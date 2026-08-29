"use strict";

// atrio-wire.js —— 把 Atrio 会客厅接进 Chat-C。
//
// 单开一个文件是故意的：backend.js 里只加两行（require + wireAtrio(app)），
// 将来要拆会客厅，删这个文件 + 那两行就干净了。
//
// 三条定死的规矩，改之前想清楚：
//   1. 会客厅走【独立 API key】（settings.atrio_api_key），不碰主线、不碰订阅。
//      理由：让朋友用她的订阅额度，跟她自己用不是一回事。账单也分得开。
//   2. 【不传 tools】。客人侧零工具不是靠黑名单挡的，是压根没有工具可调。
//      不要"顺手"加一个，加了就是给客人开了一条通往这台机器的路。
//   3. 记忆默认【关着】。recall 钩子留着位置，但白名单没定之前不接 Nocturne。

const path = require("path");
const { registerGuestRoutes } = require("./atrio/lib/guest-routes");

// 她定的：40 句 / 1 小时。上游默认是 200 句 / 2 小时，对两个朋友来说太松，
// 一个链接就能烧掉不少钱。发链接时可以按人单独放宽（create 收 ttlMs / maxMessages）。
const LIMITS = {
  maxMessagesPerSession: 40,
  maxPerMinute: 5,
  defaultTtlMs: 60 * 60 * 1000,
  // 2026-08-29 她定的钱闸门。改走 claude -p + 她的上下文之后，句数限额基本失效：
  // 每句都是新进程、都要把整个窗口重付一次冷前缀。实测她那条会话约 $0.15/句，
  // 所以 $2 ≈ 13 句。数字按**真实** total_cost_usd 累加，不是估的。
  maxCostPerSession: 2.00,
  maxCostPerDay: 5.00
};

const DEFAULT_MODEL = "claude-sonnet-4-6";   // 跟主线的他同款。想更好可在 settings.atrio_model 换 claude-opus-4-6
// 客人侧固定用它。跟上面那个 DEFAULT_MODEL 不是一回事 —— 那个是旧 SDK 路子用的。
const GUEST_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;


// ─── 记忆：给他 Nocturne 的 trace ─────────────────────────────────────────────
// 她定的线：「很私人的话题不可以，别的都可以，他知道分寸就行。」
// 但不能只靠他自觉——prompt 是一层，这儿再加一道机器粗筛。两层都漏才算漏。
//
// 注意这个钩子跑在客人的聊天链路上：Nocturne 慢一秒，客人就多等一秒。
// 所以超时卡得比 Chat-C 主线短，而且任何失败都静默——搜不到就当没想起来，
// 绝不能因为记忆库抽风让他一句话都说不出来。

// 命中即丢。宁可漏掉几条无辜的，也不要让她在朋友面前不好意思。
// toy_/vibrate/suck 是 Nocturne 那几个成人玩具工具留下的痕迹，必挡。
const PRIVATE_WORDS = [
  "做爱", "上床", "嗯嗯", "高潮", "情欲", "性爱", "性生活", "自慰", "呻吟",
  "调情", "情趣", "裸", "内衣", "舌吻", "玩具",
  "toy_", "vibrate", "suck", "nsfw"
];

function tooPrivate(text) {
  const t = String(text || "").toLowerCase();
  return PRIVATE_WORDS.some(w => t.includes(w));
}

function makeRecall(callNocturne) {
  if (typeof callNocturne !== "function") return null;

  return async function recall({ message }) {
    const q = String(message || "").trim();

    // 太短的（「嗯」「哈哈」「在吗」）搜了也是噪音，白花时间。
    if (q.length < 4) return "";

    // 客人自己就在往那个方向问 —— 那更不能去翻。直接不搜。
    if (tooPrivate(q)) return "";

    let raw;
    try {
      raw = await Promise.race([
        callNocturne("trace", { query: q, limit: 4 }),
        new Promise(resolve => setTimeout(() => resolve(null), 4000))
      ]);
    } catch (e) {
      return "";   // 记忆库抽风不该让他哑巴
    }
    if (!raw) return "";

    // 逐条筛：整条命中就整条丢，不做「删掉敏感词留下半句」那种事——
    // 半句往往比整句更容易让人往那儿想。
    const kept = String(raw)
      .split(/\n{2,}/)
      .map(x => x.trim())
      .filter(x => x && !tooPrivate(x));

    if (!kept.length) return "";

    // 别喂太多。塞满 context 只会让他絮叨，也费钱。
    let out = kept.join("\n\n");
    if (out.length > 900) out = out.slice(0, 900) + "…";
    return out;
  };
}

function wireAtrio(app, opts) {
  const { db, auth, callNocturne } = opts;

  const setting = key => {
    try {
      return db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value || null;
    } catch (e) {
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 2026-08-29：粥粥要客人见到的是**带着她的上下文的他**，不是一个白板 Claude。
  //
  // 这推翻了本文件顶上规矩 1（独立 key、不碰订阅）——她当天明确拍板了：
  // 走 `claude -p`、烧她自己的订阅额度。所以下面这套东西必须成立：
  //
  //   1. --fork-session：从她的会话**分叉**，不是续。实测（08-29）原 jsonl
  //      连 mtime 都没变，客人说的话全进新文件。她的会话一个字节都不会被碰，
  //      也不会跟她的常驻进程抢同一个 session 文件。
  //   2. 客人第一句 fork，之后 resume 那个分叉 —— 客人自己的上下文能接上，
  //      但永远回不到她的原会话。
  //   3. 按**真实** total_cost_usd 记账（--output-format json 直接给），
  //      不估算。闸门在 guest-routes.js，这里只负责如实报数。
  //   4. 起客人进程前先请她的常驻让路（这台 2G，两个 claude 塞不下）——
  //      **等她那一句说完**，不掐断她的话。她定的。
  //   5. 客人依旧零工具：13 个内置全进 --disallowedTools，--strict-mcp-config
  //      掐掉全部 MCP。fork 来的上下文里有工具**记录**，但他一个都调不动。
  // ═══════════════════════════════════════════════════════════════════════

  const { execFile } = require("child_process");
  const GW = "http://127.0.0.1:9876";
  const GW_KEY = () => process.env.GATEWAY_KEY || "";

  // 客人侧一个工具都不给。跟网关 BASE_DENIED 不是一份 —— 那份是给他自己用的，
  // 这份是给客人用的，只会更严，别合并。
  const GUEST_BLOCKED = [
    "Bash", "Edit", "Write", "Read", "Glob", "Grep",
    "WebFetch", "WebSearch", "Task", "TodoWrite", "NotebookEdit",
    "BashOutput", "KillShell", "ExitPlanMode"
  ];

  // 她当前那条会话（要从这儿分叉）。db 里 is_main 那行才是主线。
  function herSessionId() {
    try {
      const r = db.prepare(
        "SELECT cli_session_id FROM sessions WHERE cli_session_id IS NOT NULL AND cli_session_id != '' " +
        "ORDER BY is_main DESC, updated_at DESC LIMIT 1"
      ).get();
      return r && r.cli_session_id ? r.cli_session_id : null;
    } catch (e) { return null; }
  }

  // 请她的常驻进程让路。**等她说完**：轮询 /busy，talking=0 才 drop。
  // 等不到就不 drop 直接跑 —— 客人多等一会儿可以，OOM 不行；真挤爆了
  // 内核先杀的是她的会话，那比客人看到一句错误严重得多。
  async function yieldHerProcess() {
    const key = GW_KEY();
    if (!key) return { yielded: false, why: "没有网关密钥" };
    const headers = { "Content-Type": "application/json", "x-gateway-key": key };
    const deadline = Date.now() + 45000;   // 最多等 45 秒
    while (Date.now() < deadline) {
      let busy;
      try {
        const r = await fetch(GW + "/busy", { headers });
        busy = await r.json();
      } catch (e) { return { yielded: false, why: "网关问不到" }; }
      if (!busy || !busy.talking) {
        try {
          await fetch(GW + "/drop", {
            method: "POST", headers,
            body: JSON.stringify({ all: true, why: "会客厅有客人，让路" })
          });
          return { yielded: true };
        } catch (e) { return { yielded: false, why: "放不掉" }; }
      }
      await new Promise(r => setTimeout(r, 1500));   // 她还在说，再等等
    }
    return { yielded: false, why: "等了 45 秒她还在说" };
  }

  // 一次只跑一个客人进程。1G 可用内存的时候两个 claude 就是 OOM，
  // 而且 OOM killer 挑的是最大那个 —— 很可能就是她的会话。
  let guestChain = Promise.resolve();
  function runExclusive(fn) {
    const run = guestChain.then(fn, fn);
    guestChain = run.then(() => {}, () => {});
    return run;
  }

  // 走 claude -p。resumeFrom 有值就从那儿续（客人自己的分叉），
  // 没有就从她的会话 fork 一份。回 { text, cliSessionId, costUsd }。
  function claudeP({ prompt, resumeFrom, forkFrom }) {
    return new Promise((resolve, reject) => {
      // 客人固定 sonnet 4.6（她 08-29 定的）。不指定的话会继承她自己的默认，
      // 实测那次客人跑在 opus-4-6 上、一句 $0.2848 —— 同样一句 sonnet 约省 40%。
      // 客人闲聊不需要 opus 的深度，$2 的额度也能多撑一倍。
      const args = ["-p", prompt, "--model", GUEST_MODEL, "--output-format", "json", "--strict-mcp-config"];
      if (resumeFrom) args.push("--resume", resumeFrom);
      else if (forkFrom) args.push("--resume", forkFrom, "--fork-session");
      // 变长参数必须放最后
      args.push("--disallowedTools", ...GUEST_BLOCKED);

      execFile("claude", args, {
        // cwd 必须是他自己的家：--resume 靠 cwd 定位项目目录，
        // 而且那份 CLAUDE.md（他的人格）就在这儿 —— 这正是「带着上下文」的一半。
        cwd: "/root/companion",
        env: { ...process.env, CLAUDE_CONFIG_DIR: "/root/.claude-noct", TERM: "dumb" },
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error("claude -p 失败: " + (stderr || err.message).slice(0, 200)));
        let j;
        try { j = JSON.parse(stdout); }
        catch (e) { return reject(new Error("解析不了 claude 的输出")); }
        if (j.is_error) return reject(new Error("claude 报错: " + String(j.result || "").slice(0, 200)));
        resolve({
          text: String(j.result || "").trim(),
          cliSessionId: j.session_id || null,
          costUsd: Number(j.total_cost_usd) || 0,
        });
      });
    });
  }

  // 会客厅的 llm。guest 有值 = 客人在聊（要 fork、要记账、要让路）；
  // 没有 = 内部用途（比如结束时的摘要），走一次性白板，别碰她的会话。
  async function llm({ system, transcript, guest }) {
    const lines = (transcript || [])
      .filter(m => m && m.content && String(m.content).trim())
      .map(m => (m.role === "assistant" ? "[你说]: " : "[客人说]: ") + String(m.content));
    if (!lines.length) throw new Error("空对话");

    // --resume 之后 system prompt 不生效（跟主线那条一样的坑），
    // 所以「你在会客厅、对面是谁」只能随这一句递进去。
    const prompt = (system ? system + "\n\n═══\n\n" : "") + lines.join("\n\n");

    if (!guest) {
      // 摘要这类内部调用：白板，不 fork、不碰她的上下文。
      const r = await claudeP({ prompt });
      return r.text;
    }

    return runExclusive(async () => {
      const yielded = await yieldHerProcess();
      if (!yielded.yielded) console.log("[atrio] 她的进程没让开（" + yielded.why + "），照跑");
      const her = guest.cliSessionId ? null : herSessionId();
      if (!guest.cliSessionId && !her) throw new Error("找不到她的会话，没法带上下文");
      const r = await claudeP({ prompt, resumeFrom: guest.cliSessionId || null, forkFrom: her });
      console.log("[atrio] 客人这轮 $" + r.costUsd.toFixed(4)
        + (guest.cliSessionId ? "（续分叉）" : "（新分叉 " + String(r.cliSessionId).slice(0, 8) + "）"));
      return r;
    });
  }

  // ─── 旧的 SDK 路子，留着做退路。她要换回「独立 key、不烧订阅」就用这个。 ───
  async function llmViaSdk({ system, transcript }) {
    const apiKey = setting("atrio_api_key");
    if (!apiKey) {
      throw new Error("会客厅还没配 API key（settings.atrio_api_key）");
    }

    const Anthropic = require("@anthropic-ai/sdk");

    // settings.atrio_base_url 填了就走中转，不填 = 直连官方。
    // ⚠️ 走中转 = 中转站看得见全部明文对话。这套东西的卖点是「连她自己都看不到原文」，
    //    中转站却看得到。省的是几十块，赔的是这个。默认为空是故意的。
    const baseURL = setting("atrio_base_url");
    const client = new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });

    const messages = (transcript || [])
      .filter(m => m && m.content && String(m.content).trim())
      .map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content)
      }));

    if (!messages.length) throw new Error("空对话");

    const resp = await client.messages.create({
      model: setting("atrio_model") || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages
      // tools: 故意不传。见文件顶部规矩 2。
    });

    return (resp.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
  }

  const recall = makeRecall(callNocturne);

  registerGuestRoutes(app, {
    adminAuth: auth,                       // 复用 Chat-C 的 Bearer 鉴权
    dataDir: path.join(__dirname, "data", "atrio"),
    systemPromptFile: path.join(__dirname, "atrio", "prompts", "system-prompt.md"),
    memorizePromptFile: path.join(__dirname, "atrio", "prompts", "memorize-prompt.md"),
    visitPage: path.join(__dirname, "atrio", "visit.html"),
    limits: LIMITS,
    llm,
    // 只接 recall，不接 memorize —— 外人聊天不该往她的手稿里写东西。
    hooks: recall ? { recall } : {}
  });

  console.log("[atrio] 会客厅已挂载：/visit/:token");
}

module.exports = { wireAtrio, _test: { makeRecall, tooPrivate } };
