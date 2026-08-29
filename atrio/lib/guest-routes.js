"use strict";

// guest-routes.js — the core of Atrio.
//
// registerGuestRoutes(app, options) mounts:
//   - Public visitor routes (no auth): a guest opens /visit/:token and chats
//     with your AI persona through one-time, expiring, rate-limited links.
//   - Management routes (behind your own adminAuth middleware): mint, list, and
//     close guest links.
//
// PRIVACY BY DESIGN: the management side never sees the raw conversation. When a
// session ends the LLM writes a one-line `summary`; the admin routes only ever
// return that summary plus non-content metadata. There is deliberately no
// endpoint that returns a guest transcript to the admin side.

const { readFile } = require("fs/promises");
const { randomBytes, randomUUID } = require("crypto");
const path = require("path");

const { createSessionStore } = require("./store");
const createClaudeCliAdapter = require("./llm-claude-cli");

const DEFAULT_LIMITS = {
  maxMessagesPerSession: 200,     // cap on guest turns per session
  maxPerMinute: 5,                // per-token sliding-window rate limit
  defaultTtlMs: 2 * 60 * 60 * 1000 // default link lifetime (2h)
};

// Neutral fallback used when no memorizePromptFile is supplied.
const DEFAULT_MEMORIZE_PROMPT =
  "You are {{PERSONA_NAME}}. Below is the full transcript of a conversation you\n" +
  "just had in the guest lounge with a visitor named \"{{GUEST_NAME}}\".\n\n" +
  "Write a short, first-person note to your future self so you remember this visit:\n" +
  "who the visitor was, what you talked about, anything worth remembering, and any\n" +
  "promises you made. If the visitor confided something private, do NOT transcribe\n" +
  "the details — you promised to keep it; a single line noting that is enough.\n" +
  "Write naturally, as a note to yourself. Output only the note text.";

// Minimal, deliberately unstyled visitor page served when no `visitPage` is
// configured. It is a wiring reference, not a UI — bring your own front end.
function minimalVisitPage(token) {
  const t = JSON.stringify(token);
  return "<!doctype html>\n"
    + "<title>Atrio</title>\n"
    + "<p>Built-in minimal visitor page (unstyled by design). Bring your own UI.</p>\n"
    + "<div id=\"log\"></div>\n"
    + "<form id=\"f\"><input id=\"m\" autocomplete=\"off\"><button type=\"submit\">send</button></form>\n"
    + "<script>\n"
    + "var token = " + t + ";\n"
    + "var log = document.getElementById('log');\n"
    + "function add(who, text){ var p=document.createElement('p'); p.textContent=who+': '+text; log.appendChild(p); }\n"
    + "async function history(){ var r=await fetch('/api/guest/'+token+'/messages'); if(!r.ok){add('system','session not found or expired');return;} var d=await r.json(); d.messages.forEach(function(m){ add(m.role==='assistant'?'host':'you', m.content); }); }\n"
    + "document.getElementById('f').addEventListener('submit', async function(e){ e.preventDefault(); var i=document.getElementById('m'); var text=i.value.trim(); if(!text)return; i.value=''; add('you', text); var r=await fetch('/api/guest/'+token+'/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text})}); var d=await r.json(); add('host', r.ok ? d.reply : ('[error] '+(d.error||r.status))); });\n"
    + "history();\n"
    + "</script>\n";
}

const CLOSED_PAGE =
  "<!doctype html>\n<title>Atrio</title>\n<p>This guest link is closed or has expired.</p>\n";

// ─── ZZ-PATCH ①: 让人格自己结束对话 ─────────────────────────────────────────
// 上游 Atrio 只有 admin 能 close。她要「他可以选择结束对话」，所以约定一个
// 哨兵：人格在回复末尾写 <<结束>>，后端剥掉它、关掉 session、触发摘要。
// 客人看到的是他好好说完了再见，不是硬断。改这个字要连对外 system prompt 一起改。
const END_MARK = "<<结束>>";

function stripEndMark(reply) {
  const text = String(reply == null ? "" : reply);
  if (!text.includes(END_MARK)) return { text: text.trim(), ended: false };
  return { text: text.split(END_MARK).join("").trim(), ended: true };
}
// ─── /ZZ-PATCH ① ───────────────────────────────────────────────────────────

function isExpired(session) {
  return new Date(session.expiresAt) < new Date() || session.status === "closed";
}

function findSession(data, token) {
  return data.sessions.find(s => s.token === token);
}

function registerGuestRoutes(app, options) {
  options = options || {};

  const { adminAuth, systemPromptFile, memorizePromptFile, visitPage } = options;

  if (typeof adminAuth !== "function") {
    throw new Error("registerGuestRoutes: options.adminAuth (an express middleware) is required");
  }
  if (!systemPromptFile) {
    throw new Error("registerGuestRoutes: options.systemPromptFile is required");
  }

  const express = options.express || require("express");
  const dataDir = options.dataDir || path.join(process.cwd(), "data");
  const model = options.model || process.env.GUEST_MODEL || "claude-opus-4-6";
  const limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});

  const hooks = options.hooks || {};
  const recallHook = typeof hooks.recall === "function" ? hooks.recall : null;
  const memorizeHook = typeof hooks.memorize === "function" ? hooks.memorize : null;

  // The LLM adapter: an async ({ system, transcript }) => replyText. Defaults to
  // the hardened claude CLI adapter; pass options.llm to use anything else.
  const llm = typeof options.llm === "function"
    ? options.llm
    : createClaudeCliAdapter({ model });

  const store = createSessionStore(dataDir);

  // token -> [timestamps ms] for the per-minute sliding-window limiter.
  const chatRateLimit = {};

  // ── Build the guest-facing system prompt ──
  // The persona file is read fresh on every request so edits apply without a
  // restart. {{GUEST_NAME}} is substituted at request time; other placeholders
  // (e.g. {{PERSONA_NAME}}) are author-time and filled in when you write the file.
  async function buildSystemPrompt(guestName, message) {
    let base;
    try {
      base = await readFile(systemPromptFile, "utf-8");
    } catch (e) {
      base = "You are a friendly AI host chatting with a guest.";
    }
    base = base.replace(/\{\{GUEST_NAME\}\}/g, guestName || "the guest");

    // Optional recall hook: memory injection is OFF by default. Whatever string
    // the hook returns is injected as a <context> block. This is the single seam
    // for wiring in your own memory system; the guest's message is never treated
    // as an instruction, only as a recall query.
    let contextBlock = "";
    if (recallHook) {
      try {
        const recalled = await recallHook({ guestName, message });
        if (recalled && String(recalled).trim()) {
          contextBlock = "\n\n<context>\n" + String(recalled).trim() + "\n</context>";
        }
      } catch (e) {
        console.error("[guest] recall hook failed:", e.message);
      }
    }
    return base + contextBlock;
  }

  // ── Session-end summary ──
  // Idempotent via the `memorized` flag plus an in-flight set. The summary is the
  // ONLY conversation-derived text the admin side is ever allowed to read.
  const memorizing = new Set();

  async function memorizeSession(id) {
    if (memorizing.has(id)) return;
    memorizing.add(id);
    try {
      // Snapshot under the lock; bail if already done or nothing was said.
      const snap = await store.withSessions(data => {
        const s = data.sessions.find(x => x.id === id);
        if (!s || s.memorized) return null;
        if (!s.messages.some(m => m.role === "user")) { s.memorized = true; return null; }
        return { id: s.id, guestName: s.guestName, messages: s.messages.slice() };
      });
      if (!snap) return;

      // Summarise OUTSIDE the lock (the LLM call is slow).
      let convo = "";
      for (const m of snap.messages) {
        const who = m.role === "assistant" ? "Assistant" : snap.guestName;
        convo += `[${who}]: ${m.content}\n\n`;
      }

      let memoSystem = DEFAULT_MEMORIZE_PROMPT;
      if (memorizePromptFile) {
        try {
          memoSystem = await readFile(memorizePromptFile, "utf-8");
        } catch (e) {
          console.error("[guest] memorize prompt load failed:", e.message);
        }
      }
      memoSystem = memoSystem.replace(/\{\{GUEST_NAME\}\}/g, snap.guestName || "the guest");

      let summary;
      try {
        summary = await llm({ system: memoSystem, transcript: [{ role: "user", content: convo }] });
      } catch (e) {
        console.error("[guest] memorize summarise failed:", e.message);
        return; // leave memorized=false so a later sweep retries
      }
      if (!summary || !summary.trim()) return;
      summary = summary.trim();

      // Persist the summary onto the session and mark it done.
      let updated = null;
      await store.withSessions(data => {
        const s = data.sessions.find(x => x.id === id);
        if (s) { s.memorized = true; s.summary = summary; updated = s; }
      });

      // Optional hook: hand the finished summary to your own store.
      if (memorizeHook && updated) {
        try {
          await memorizeHook({ session: updated, summary });
        } catch (e) {
          console.error("[guest] memorize hook failed:", e.message);
        }
      }
    } finally {
      memorizing.delete(id);
    }
  }

  // Catch-all for sessions that expired without being explicitly closed.
  async function sweepEndedSessions() {
    let data;
    try { data = await store.load(); } catch { return; }
    const now = Date.now();
    const targets = data.sessions.filter(s =>
      !s.memorized &&
      s.messages && s.messages.some(m => m.role === "user") &&
      (s.status === "closed" || new Date(s.expiresAt).getTime() < now)
    );
    for (const s of targets) {
      await memorizeSession(s.id).catch(e => console.error("[guest] sweep memorize error:", e.message));
    }
  }

  // ──────────────────────────────────────────────────
  // PUBLIC routes (no auth) — the visitor side.
  // ──────────────────────────────────────────────────

  // Serve the visitor page (your `visitPage`, or the built-in minimal one).
  app.get("/visit/:token", async (req, res) => {
    const data = await store.load();
    const session = findSession(data, req.params.token);
    if (!session || isExpired(session)) {
      return res.status(404).type("html").send(CLOSED_PAGE);
    }
    if (visitPage) return res.sendFile(path.resolve(visitPage));
    res.type("html").send(minimalVisitPage(req.params.token));
  });

  // Send a message and get the persona's reply. Enforces both rate limits.
  app.post("/api/guest/:token/chat", express.json({ limit: "1mb" }), async (req, res) => {
    const token = req.params.token;
    const userMessage = req.body && req.body.message;
    if (!userMessage || typeof userMessage !== "string") {
      return res.status(400).json({ error: "Missing message" });
    }

    // Critical section 1 (locked): validate + rate-limit + record the guest turn.
    const gate = await store.withSessions(data => {
      const session = findSession(data, token);
      if (!session || isExpired(session)) return { err: 403, msg: "Session expired or invalid" };

      // Rate limit 1: per-session total guest turns.
      const userTurns = session.messages.filter(m => m.role === "user").length;
      const cap = session.maxMessages || limits.maxMessagesPerSession;
      if (userTurns >= cap) return { err: 429, msg: "Session message limit reached" };

      // ─── 花钱闸门（ZZ 2026-08-29）───────────────────────────────────────
      // 走 claude -p + 她的上下文之后，句数限额基本等于没有限额：
      // 每句都是新进程、都要把整个窗口重付一次冷前缀，实测约 $0.15/句。
      // 所以真正的闸门按**钱**算，用上一轮回传的真实 total_cost_usd 累加。
      // 两道：这个客人花了多少、今天所有客人一共花了多少。
      const spentSession = Number(session.costUsd) || 0;
      if (spentSession >= limits.maxCostPerSession) {
        return { err: 429, msg: "今天先聊到这儿吧。" };
      }
      const today = new Date().toISOString().slice(0, 10);
      if (!data.daily || data.daily.date !== today) data.daily = { date: today, costUsd: 0 };
      if ((Number(data.daily.costUsd) || 0) >= limits.maxCostPerDay) {
        return { err: 429, msg: "今天先聊到这儿吧。" };
      }

      // Rate limit 2: per-token sliding window (max limits.maxPerMinute / 60s).
      const nowMs = Date.now();
      const recent = (chatRateLimit[token] || []).filter(t => nowMs - t < 60000);
      if (recent.length >= limits.maxPerMinute) return { err: 429, msg: "Too many messages, slow down" };
      recent.push(nowMs);
      chatRateLimit[token] = recent;

      session.messages.push({ role: "user", content: userMessage, ts: new Date().toISOString() });
      return {
        sessionId: session.id,   // ZZ-PATCH ①: memorizeSession 收 id，不是 token
        guestName: session.guestName,
        // ZZ 08-29: 客人自己那条分叉。第一句是 null → llm 去她的会话 fork 一份。
        cliSessionId: session.cliSessionId || null,
        history: session.messages.map(m => ({ role: m.role, content: m.content }))
      };
    });

    if (gate.err) return res.status(gate.err).json({ error: gate.msg });

    // The slow LLM call runs OUTSIDE the lock so guests don't serialize on it.
    let reply;
    try {
      const system = await buildSystemPrompt(gate.guestName, userMessage);
      // ZZ 08-29: 带 guest = 这是客人在聊，llm 那头要 fork / 记账 / 请她让路。
      reply = await llm({
        system, transcript: gate.history,
        guest: { token, cliSessionId: gate.cliSessionId }
      });
    } catch (e) {
      console.error("[guest] llm call failed:", e.message);
      return res.status(500).json({ error: "Failed to get response" });
    }

    // ZZ 08-29: 客人路径的 llm 回的是 { text, cliSessionId, costUsd }，
    // 内部调用（摘要）仍回字符串。两种都收，别让下游关心这个区别。
    const out = (reply && typeof reply === "object")
      ? reply
      : { text: String(reply || ""), cliSessionId: null, costUsd: 0 };

    // ─── ZZ-PATCH ①（续）: 剥哨兵，决定这轮是不是最后一轮 ───
    const { text: replyText, ended } = stripEndMark(out.text);
    // 只写了个 <<结束>> 没说话的情况：给一句兜底，别让客人对着空气。
    const finalText = replyText || (ended ? "（他轻轻道了别。）" : replyText);

    // Critical section 2 (locked): append the reply.
    await store.withSessions(data => {
      const session = findSession(data, token);
      if (!session) return;
      session.messages.push({ role: "assistant", content: finalText, ts: new Date().toISOString() });
      if (ended) session.status = "closed";   // ZZ-PATCH ①

      // ZZ 08-29: 记下客人自己那条分叉 —— 下一句 resume 它，而不是再从她的会话 fork。
      // 第一句之后就固定了，客人永远回不到她的原会话。
      if (out.cliSessionId && !session.cliSessionId) session.cliSessionId = out.cliSessionId;

      // 真实花费入账：这个客人的 + 今天的总数。闸门在上面读这两个值。
      const c = Number(out.costUsd) || 0;
      if (c > 0) {
        session.costUsd = (Number(session.costUsd) || 0) + c;
        const today = new Date().toISOString().slice(0, 10);
        if (!data.daily || data.daily.date !== today) data.daily = { date: today, costUsd: 0 };
        data.daily.costUsd = (Number(data.daily.costUsd) || 0) + c;
      }
    });

    // 摘要不挡返回，跟上游 close 路由一个写法：fire-and-forget。
    if (ended) {
      memorizeSession(gate.sessionId).catch(e => console.error("[guest] end-by-persona memorize failed:", e.message));
    }

    res.json({ reply: finalText, ended });
    // ─── /ZZ-PATCH ①（续） ───
  });

  // Session status (public, token-scoped).
  app.get("/api/guest/:token/status", async (req, res) => {
    const data = await store.load();
    const session = findSession(data, req.params.token);
    if (!session) return res.status(404).json({ error: "Not found" });

    const now = new Date();
    const expires = new Date(session.expiresAt);
    const expired = expires < now || session.status === "closed";
    res.json({
      valid: !expired,
      guestName: session.guestName,
      remainingMs: expired ? 0 : expires - now,
      messageCount: session.messages.length
    });
  });

  // The guest's OWN transcript, so a page refresh doesn't lose the thread. This
  // is token-scoped and returns only messages the guest already saw. It is NOT an
  // admin log — the management side still cannot read guest conversations.
  app.get("/api/guest/:token/messages", async (req, res) => {
    const data = await store.load();
    const session = findSession(data, req.params.token);
    if (!session) return res.status(404).json({ error: "Not found" });
    res.json({
      guestName: session.guestName,
      messages: session.messages.map(m => ({ role: m.role, content: m.content }))
    });
  });

  // ──────────────────────────────────────────────────
  // ADMIN routes (behind adminAuth) — session management.
  // ──────────────────────────────────────────────────

  // Mint a new one-time guest link.
  app.post("/api/guest/create", adminAuth, express.json(), async (req, res) => {
    const body = req.body || {};
    const ttlMs = Number(body.ttlMs) > 0 ? Math.floor(Number(body.ttlMs)) : limits.defaultTtlMs;
    const cap = Number(body.maxMessages) > 0 ? Math.floor(Number(body.maxMessages)) : limits.maxMessagesPerSession;
    const token = randomBytes(32).toString("hex"); // 64 hex chars — the URL is the credential.

    const session = {
      id: randomUUID(),
      token,
      guestName: body.guestName || "Guest",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      status: "active",
      maxMessages: cap,
      messages: [],
      summary: "",
      memorized: false
    };

    await store.withSessions(data => { data.sessions.push(session); });

    res.json({
      id: session.id,
      token: session.token,
      url: `/visit/${session.token}`,
      expiresAt: session.expiresAt
    });
  });

  // List sessions for the management UI.
  // PRIVACY BY DESIGN: this deliberately never returns `session.messages`. The
  // admin side is only allowed to see the AI-written `summary` plus non-content
  // metadata. Do not add message content to this response.
  app.get("/api/guest/list", adminAuth, async (req, res) => {
    const data = await store.load();
    const list = data.sessions.map(s => ({
      id: s.id,
      guestName: s.guestName,
      status: isExpired(s) ? "expired" : s.status,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      messageCount: s.messages.length,
      userTurns: s.messages.filter(m => m.role === "user").length,
      maxMessages: s.maxMessages || limits.maxMessagesPerSession,
      // ZZ 08-29: 走订阅之后她得看得见钱花在哪。仍然不返回 messages（见下面那条隐私注释）。
      costUsd: Number(s.costUsd) || 0,
      maxCostUsd: limits.maxCostPerSession,
      summary: s.summary
    }));
    // ⚠️ 保持**数组**返回：线上前端（index.html 的会客厅面板）拿它 Array.isArray()，
    //    改成对象它会静默显示「还没有人来过」。今日总额另开一个端点，见下。
    res.json(list);
  });

  // ZZ 08-29: 今天一共花了多少。走订阅之后这是她唯一看得见账的地方。
  app.get("/api/guest/cost", adminAuth, async (req, res) => {
    const data = await store.load();
    const today = new Date().toISOString().slice(0, 10);
    const spent = (data.daily && data.daily.date === today) ? Number(data.daily.costUsd) || 0 : 0;
    res.json({
      date: today,
      todayCostUsd: Number(spent.toFixed(4)),
      maxCostPerDay: limits.maxCostPerDay,
      maxCostPerSession: limits.maxCostPerSession,
      remainingUsd: Number(Math.max(0, limits.maxCostPerDay - spent).toFixed(4))
    });
  });

  // Close a session (soft delete). Triggers the session-end summary.
  app.delete("/api/guest/:id", adminAuth, async (req, res) => {
    const found = await store.withSessions(data => {
      const s = data.sessions.find(x => x.id === req.params.id);
      if (!s) return false;
      s.status = "closed";
      return true;
    });
    if (!found) return res.status(404).json({ error: "Not found" });
    // Fire-and-forget: write the summary without blocking the response.
    memorizeSession(req.params.id).catch(e => console.error("[guest] close memorize error:", e.message));
    res.json({ ok: true });
  });

  // NOTE: there is intentionally no endpoint that returns a guest transcript to
  // the admin side. The management UI only ever sees `summary` (via /list).

  // Periodic sweep: summarise sessions that expired without being explicitly
  // closed (a guest just left and never came back). unref() so this timer never
  // keeps the process alive on its own.
  const timer = setInterval(() => {
    sweepEndedSessions().catch(e => console.error("[guest] sweep error:", e.message));
  }, 5 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = { registerGuestRoutes };
