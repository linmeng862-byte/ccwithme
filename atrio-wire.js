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
  defaultTtlMs: 60 * 60 * 1000
};

const DEFAULT_MODEL = "claude-sonnet-4-6";   // 跟主线的他同款。想更好可在 settings.atrio_model 换 claude-opus-4-6
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

  // 走官方 SDK，直连 Anthropic。key 没填就明确报错，不要静默退回 claude CLI ——
  // 静默退回等于偷偷用订阅额度，正是这套东西要避免的事。
  async function llm({ system, transcript }) {
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
