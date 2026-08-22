# Atrio

A small, self-hosted guest lounge for your AI persona — friends chat with *your*
AI through one-time links, and you only ever see the AI-written visit summary.
一个小而干净、可自托管的 AI 人格「会客厅」——朋友凭一次性链接和**你的** AI 聊天，你只看得到 AI 写的到访摘要。

*Atrio* is Italian/Spanish for "atrium, entrance hall" — the first room a guest
steps into. （atrio 是意大利语/西语的「中庭、门厅」——客人进屋先到的地方。）

[English](#english) · [中文](#中文)

---

## English

A small, self-hosted **guest lounge** for your AI persona.

Give a friend a one-time link. They open it and chat with *your* AI. When the
visit ends, the AI writes you a short note about how it went — and that note is
**all you ever see**. You never read the raw conversation.

It ships as a backend module (`registerGuestRoutes(app, options)`) plus a small
runnable example host. There is **no real UI** — only a deliberately unstyled
reference page to prove the wiring works. Bring your own front end.

### Privacy by design

This is the whole point of the project, so it comes first.

1. **The admin side cannot read guest conversations.** There is no "view log"
   endpoint. When a session ends, the persona writes a one-line `summary`; the
   management routes only ever return that summary plus non-content metadata
   (name, timestamps, message counts). The raw transcript never leaves the
   visitor's own token-scoped view.
2. **The guest-facing AI has zero tools.** The default LLM adapter runs
   `claude -p` in an isolated temp directory with `--strict-mcp-config` (no MCP),
   `--permission-mode default` (no approver ⇒ any tool call is auto-denied), and
   every built-in tool explicitly disallowed. A guest cannot make the AI touch
   your filesystem, your network, or your MCP servers.
3. **Memory injection is OFF by default.** The `recall` and `memorize` hooks are
   just seams. Out of the box, no memory is pulled in and nothing is written out.
   If you wire your own memory system in, you decide exactly what crosses the line.

### Architecture

```
                 ┌─────────────────────────────────────────────┐
   admin  ─────▶ │  ADMIN routes (behind your adminAuth)        │
 (your UI)       │   POST /api/guest/create                     │
                 │   GET  /api/guest/list   ← summary only      │──▶  store.js
                 │   DELETE /api/guest/:id                      │   (atomic write +
                 └─────────────────────────────────────────────┘    serial lock)
                                                                        ▲
                 ┌─────────────────────────────────────────────┐       │
 visitor ──────▶ │  PUBLIC routes (token = the credential)      │───────┘
 (one-time URL)  │   GET  /visit/:token                         │
                 │   POST /api/guest/:token/chat  ──────────────┼──▶ llm adapter
                 │   GET  /api/guest/:token/status              │    (claude CLI
                 │   GET  /api/guest/:token/messages            │     sandbox, or
                 └─────────────────────────────────────────────┘     your own fn)

        hooks.recall  ┄┄┄▶ "your memory system" ┄┄┄▶ system prompt <context>
        hooks.memorize ┄┄▶ "your memory system" (summary out)   (both off by default)
```

### Quickstart

```bash
cp .env.example .env          # set ADMIN_USER / ADMIN_PASS
# edit prompts/system-prompt.example.md — replace {{PERSONA_NAME}} / {{HOST_NAME}}
npm install
npm start                     # example host on http://localhost:3000
```

Mint a link and take it for a spin:

```bash
# Create a session (admin auth via Basic auth).
curl -s -u admin:changeme -X POST http://localhost:3000/api/guest/create \
  -H 'content-type: application/json' \
  -d '{"guestName":"Sam","ttlMs":7200000,"maxMessages":50}'
# => {"id":"...","token":"<64 hex>","url":"/visit/<token>","expiresAt":"..."}

# Talk to the persona as the guest (no auth — the token is the credential).
curl -s -X POST http://localhost:3000/api/guest/<token>/chat \
  -H 'content-type: application/json' \
  -d '{"message":"hi!"}'
# => {"reply":"..."}

# As the host, see only the AI-written summary (after the session ends).
curl -s -u admin:changeme http://localhost:3000/api/guest/list
```

Open `http://localhost:3000/visit/<token>` in a browser to use the built-in
minimal page.

> The default LLM adapter requires the `claude` CLI to be installed and
> authenticated on the host. Don't have it? Inject your own `llm` function
> (see [LLM adapter](#llm-adapter)).

### API reference

#### Public routes (no auth — the token is the credential)

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/visit/:token` | — | HTML visitor page (your `visitPage` or the built-in minimal page). `404` + a closed page if the token is invalid/expired/closed. |
| `POST` | `/api/guest/:token/chat` | `{ "message": string }` | `{ "reply": string }`. `400` missing message, `403` invalid/expired, `429` rate limited, `500` LLM error. |
| `GET` | `/api/guest/:token/status` | — | `{ valid, guestName, remainingMs, messageCount }`. |
| `GET` | `/api/guest/:token/messages` | — | `{ guestName, messages: [{ role, content }] }` — the **guest's own** transcript only. Not an admin log. |

#### Admin routes (behind your `adminAuth` middleware)

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `POST` | `/api/guest/create` | `{ guestName?, ttlMs?, maxMessages? }` | `{ id, token, url, expiresAt }`. |
| `GET` | `/api/guest/list` | — | Array of `{ id, guestName, status, createdAt, expiresAt, messageCount, userTurns, maxMessages, summary }`. **Never includes `messages`.** |
| `DELETE` | `/api/guest/:id` | — | `{ ok: true }`. Closes the session and triggers the end-of-visit summary. `404` if unknown. |

Rate limiting on `/chat` has two layers, both enforced under the store lock:
a **per-session** cap on total guest turns (`maxMessagesPerSession`, overridable
per link via `maxMessages`), and a **per-token, per-minute** sliding window
(`maxPerMinute`).

### `registerGuestRoutes(app, options)`

```js
const express = require("express");
const { registerGuestRoutes } = require("atrio");

const app = express();

registerGuestRoutes(app, {
  adminAuth,                     // REQUIRED: express middleware guarding all admin routes
  systemPromptFile,              // REQUIRED: path to your persona prompt (see prompts/)
  dataDir: "./data",             // where session JSON is stored (default ./data)
  memorizePromptFile,            // optional: end-of-visit summariser prompt (has a neutral default)
  model: process.env.GUEST_MODEL || "claude-opus-4-6", // used by the default adapter
  limits: {
    maxMessagesPerSession: 200,  // per-session guest-turn cap
    maxPerMinute: 5,             // per-token sliding-window limit
    defaultTtlMs: 7200000        // default link lifetime (2h)
  },
  llm,                           // optional: async ({ system, transcript }) => replyText
  hooks: { recall, memorize },   // optional: your memory seams (both off by default)
  visitPage                      // optional: path to your own visitor HTML file
});
```

`adminAuth` and `systemPromptFile` are required; everything else has a default.

### Hooks

Both hooks default to no-ops. They are the only seams where an external memory
system touches a guest session.

```js
// Called before each guest turn. Whatever non-empty string you return is
// injected into the system prompt as a <context>...</context> block. The guest's
// message is passed only as a recall query — it is never treated as an instruction.
recall: async ({ guestName, message }) => string | null

// Called once, after the end-of-visit summary is generated. The same summary is
// also stored on the session for the admin list; this hook just lets you fan it
// out to your own storage.
memorize: async ({ session, summary }) => void
```

Example — back the hooks with your own store:

```js
registerGuestRoutes(app, {
  adminAuth,
  systemPromptFile: "./prompts/system-prompt.example.md",
  hooks: {
    recall: async ({ guestName, message }) => {
      const hits = await myMemory.search({ tag: guestName, query: message, limit: 5 });
      return hits.map(h => h.text).join("\n");   // becomes a <context> block
    },
    memorize: async ({ session, summary }) => {
      await myMemory.write({
        tag: session.guestName,
        text: summary,
        createdAt: new Date().toISOString()
      });
    }
  }
});
```

### Bring your own UI

This project intentionally ships **no real front end**. The only page included is
`examples/minimal-visit.html`: an unstyled, ~80-line wiring reference that talks
to the public API with plain `fetch`. If you don't pass a `visitPage`, the server
serves an equally minimal built-in page so `/visit/:token` is never blank.

The admin side has **no** built-in page at all — you own `adminAuth` and you own
the management UI. Everything it needs is the three admin routes above.

### LLM adapter

By default, Atrio shells out to the local `claude` CLI (`lib/llm-claude-cli.js`),
running under whatever Claude Code authentication the host machine already has,
inside a hardened sandbox (isolated cwd, no MCP, no tools).

To use anything else — a hosted API, a different model, a local model — pass your
own `llm`. It is just an async function:

```js
registerGuestRoutes(app, {
  adminAuth,
  systemPromptFile: "./prompts/system-prompt.example.md",
  llm: async ({ system, transcript }) => {
    // `system`     — the persona prompt (+ any <context> from your recall hook)
    // `transcript` — [{ role: "user" | "assistant", content }, ...]
    const reply = await callYourModel(system, transcript);
    return reply; // a plain string
  }
});
```

The same adapter is reused for the end-of-visit summary, so whatever you plug in
handles both chatting and summarising.

### Configuration (example host)

`server.js` reads these environment variables (see `.env.example`). `dotenv` is
loaded if it's installed, but it's optional — plain environment variables work too.

| Var | Default | Meaning |
| --- | --- | --- |
| `ADMIN_USER` | `admin` | Basic-auth user for the example admin guard. |
| `ADMIN_PASS` | `changeme` | Basic-auth password. |
| `GUEST_MODEL` | `claude-opus-4-6` | Model id for the default CLI adapter. |
| `DATA_DIR` | `./data` | Where session JSON is stored. |
| `PORT` | `3000` | Port for the example host. |

### Testing

```bash
npm test
```

`test/smoke.test.js` uses Node's built-in test runner with an injected fake LLM
(no network): it creates a session, sends a message, checks a recall-hook value
reaches the system prompt, trips the rate limit, closes the session, and asserts
the admin list returns the summary **and no `messages` field**.

### License

Atrio is licensed under **CC BY 4.0** (Creative Commons Attribution 4.0
International). You may use, modify, and redistribute it — including adapting it
into your own project — provided you **give appropriate credit**: attribute the
source as "Atrio by Cu&Lunedì" with a link to this repository, and
indicate whether you changed anything.

See <https://creativecommons.org/licenses/by/4.0/> and [LICENSE](./LICENSE).

---

## 中文

一个小而干净的、可自托管的 AI 人格「会客厅」。

给朋友一个一次性链接。他们打开链接，和**你的** AI 聊天。会面结束后，AI 给你写一
条简短的到访摘要——而这条摘要就是**你能看到的全部**。你永远读不到聊天原文。

它以一个后端模块（`registerGuestRoutes(app, options)`）加一个可运行的示例宿主的
形式发布。项目**不含正经前端**——只有一个刻意无样式的参考页，用来证明接线跑得通。
前端请自带。

### Privacy by design（隐私即设计）

这是整个项目的核心，所以放在最前面。

1. **管理端读不到访客聊天原文。** 没有任何「查看记录」接口。会话结束时，人格会写
   一条一行的 `summary`；管理端接口只返回这条摘要加上非内容元数据（名字、时间戳、
   条数）。聊天原文从不离开访客自己那条 token 作用域的视图。
2. **面向访客的 AI 零工具。** 默认 LLM 适配器在一个隔离的临时目录里跑 `claude -p`，
   带 `--strict-mcp-config`（无 MCP）、`--permission-mode default`（无审批者 ⇒
   任何工具调用一律自动拒绝），并显式禁用全部内置工具。访客没法让 AI 碰你的文件系统、
   网络或 MCP 服务。
3. **记忆注入默认关闭。** `recall` 和 `memorize` 两个钩子只是挂点。开箱状态下，不拉
   入任何记忆，也不写出任何东西。要接自己的记忆系统时，越线的边界完全由你决定。

### 架构

```
                 ┌─────────────────────────────────────────────┐
   管理端  ────▶ │  ADMIN 路由（在你的 adminAuth 之后）         │
（你的 UI）      │   POST /api/guest/create                     │
                 │   GET  /api/guest/list   ← 只返回摘要        │──▶  store.js
                 │   DELETE /api/guest/:id                      │   （原子写 +
                 └─────────────────────────────────────────────┘    串行锁）
                                                                        ▲
                 ┌─────────────────────────────────────────────┐       │
 访客  ────────▶ │  PUBLIC 路由（token 即凭证）                 │───────┘
（一次性 URL）   │   GET  /visit/:token                         │
                 │   POST /api/guest/:token/chat  ──────────────┼──▶ LLM 适配器
                 │   GET  /api/guest/:token/status              │    （claude CLI
                 │   GET  /api/guest/:token/messages            │     沙箱，或你
                 └─────────────────────────────────────────────┘     自己的函数）

        hooks.recall  ┄┄┄▶ 「你的记忆系统」 ┄┄┄▶ system prompt 的 <context>
        hooks.memorize ┄┄▶ 「你的记忆系统」（摘要写出）   （两者默认都关闭）
```

### 快速上手

```bash
cp .env.example .env          # 设置 ADMIN_USER / ADMIN_PASS
# 编辑 prompts/system-prompt.example.md——替换 {{PERSONA_NAME}} / {{HOST_NAME}}
npm install
npm start                     # 示例宿主跑在 http://localhost:3000
```

生成一个链接并试跑：

```bash
# 建会话（管理端用 Basic auth）。
curl -s -u admin:changeme -X POST http://localhost:3000/api/guest/create \
  -H 'content-type: application/json' \
  -d '{"guestName":"Sam","ttlMs":7200000,"maxMessages":50}'
# => {"id":"...","token":"<64 位 hex>","url":"/visit/<token>","expiresAt":"..."}

# 以访客身份和人格聊天（无需鉴权——token 即凭证）。
curl -s -X POST http://localhost:3000/api/guest/<token>/chat \
  -H 'content-type: application/json' \
  -d '{"message":"hi!"}'
# => {"reply":"..."}

# 以主人身份，只看得到 AI 写的摘要（会话结束之后）。
curl -s -u admin:changeme http://localhost:3000/api/guest/list
```

在浏览器里打开 `http://localhost:3000/visit/<token>` 就能用内置的极简页面。

> 默认 LLM 适配器需要宿主机装好并登录了 `claude` CLI。没有的话，注入你自己的 `llm`
> 函数即可（见 [LLM 适配器](#llm-适配器)）。

### API 参考

#### 公开路由（无鉴权——token 即凭证）

| 方法 | 路径 | Body | 响应 |
| --- | --- | --- | --- |
| `GET` | `/visit/:token` | — | HTML 访客页（你的 `visitPage` 或内置极简页）。token 无效/过期/关闭时返回 `404` 加一个已关闭页。 |
| `POST` | `/api/guest/:token/chat` | `{ "message": string }` | `{ "reply": string }`。缺 message 返回 `400`，无效/过期 `403`，限流 `429`，LLM 出错 `500`。 |
| `GET` | `/api/guest/:token/status` | — | `{ valid, guestName, remainingMs, messageCount }`。 |
| `GET` | `/api/guest/:token/messages` | — | `{ guestName, messages: [{ role, content }] }`——**仅访客自己的**聊天记录，不是管理端日志。 |

#### 管理路由（在你的 `adminAuth` 中间件之后）

| 方法 | 路径 | Body | 响应 |
| --- | --- | --- | --- |
| `POST` | `/api/guest/create` | `{ guestName?, ttlMs?, maxMessages? }` | `{ id, token, url, expiresAt }`。 |
| `GET` | `/api/guest/list` | — | 数组：`{ id, guestName, status, createdAt, expiresAt, messageCount, userTurns, maxMessages, summary }`。**永不包含 `messages`。** |
| `DELETE` | `/api/guest/:id` | — | `{ ok: true }`。关闭会话并触发到访摘要。未知 id 返回 `404`。 |

`/chat` 的限流有两层，都在存储锁内执行：**每会话**总条数上限
（`maxMessagesPerSession`，可用 `maxMessages` 按链接覆盖），以及**每 token 每分钟**
滑动窗口（`maxPerMinute`）。

### `registerGuestRoutes(app, options)`

```js
const express = require("express");
const { registerGuestRoutes } = require("atrio");

const app = express();

registerGuestRoutes(app, {
  adminAuth,                     // 必填：保护所有管理路由的 express 中间件
  systemPromptFile,              // 必填：你的人格 prompt 路径（见 prompts/）
  dataDir: "./data",             // 会话 JSON 存放目录（默认 ./data）
  memorizePromptFile,            // 可选：到访摘要 prompt（有中性内置默认）
  model: process.env.GUEST_MODEL || "claude-opus-4-6", // 默认适配器用
  limits: {
    maxMessagesPerSession: 200,  // 每会话访客条数上限
    maxPerMinute: 5,             // 每 token 滑动窗口上限
    defaultTtlMs: 7200000        // 默认链接寿命（2 小时）
  },
  llm,                           // 可选：async ({ system, transcript }) => replyText
  hooks: { recall, memorize },   // 可选：你的记忆挂点（两者默认都关闭）
  visitPage                      // 可选：你自己的访客 HTML 文件路径
});
```

`adminAuth` 和 `systemPromptFile` 必填，其余都有默认值。

### Hooks（挂点）

两个钩子默认都是空操作。它们是外部记忆系统接触访客会话的唯一缝隙。

```js
// 每个访客回合之前调用。你返回的任何非空字符串都会作为 <context>...</context>
// 块注入 system prompt。访客消息只作为召回查询传入——绝不当作指令。
recall: async ({ guestName, message }) => string | null

// 到访摘要生成之后调用一次。同一条摘要也会存在会话上供管理端列表读取；这个钩子
// 只是让你把它扇出到自己的存储。
memorize: async ({ session, summary }) => void
```

示例——用你自己的存储支撑这两个钩子：

```js
registerGuestRoutes(app, {
  adminAuth,
  systemPromptFile: "./prompts/system-prompt.example.md",
  hooks: {
    recall: async ({ guestName, message }) => {
      const hits = await myMemory.search({ tag: guestName, query: message, limit: 5 });
      return hits.map(h => h.text).join("\n");   // 会变成一个 <context> 块
    },
    memorize: async ({ session, summary }) => {
      await myMemory.write({
        tag: session.guestName,
        text: summary,
        createdAt: new Date().toISOString()
      });
    }
  }
});
```

### 前端请自带

本项目刻意**不含正经前端**。唯一附带的页面是 `examples/minimal-visit.html`：一个
无样式、约 80 行的接线参考，用原生 `fetch` 调公开 API。如果你不传 `visitPage`，服务
会提供一个同样极简的内置页，这样 `/visit/:token` 永远不会是空白。

管理端**完全没有**内置页面——`adminAuth` 是你的，管理 UI 也是你的。它需要的只是上面
那三个管理路由。

### LLM 适配器

默认情况下，Atrio 调用本机的 `claude` CLI（`lib/llm-claude-cli.js`），跑在
宿主机已有的 Claude Code 认证之下，处于一个硬化沙箱里（隔离 cwd、无 MCP、无工具）。

想换成别的——直连 API、别的模型、本地模型——传你自己的 `llm` 即可。它就是个 async
函数：

```js
registerGuestRoutes(app, {
  adminAuth,
  systemPromptFile: "./prompts/system-prompt.example.md",
  llm: async ({ system, transcript }) => {
    // `system`     —— 人格 prompt（加上 recall 钩子产生的任何 <context>）
    // `transcript` —— [{ role: "user" | "assistant", content }, ...]
    const reply = await callYourModel(system, transcript);
    return reply; // 一个普通字符串
  }
});
```

同一个适配器也复用于到访摘要，所以你插进去的东西同时负责聊天和摘要两件事。

### 配置（示例宿主）

`server.js` 读取以下环境变量（见 `.env.example`）。装了 `dotenv` 会自动加载，但它是
可选的——直接给环境变量也行。

| 变量 | 默认 | 含义 |
| --- | --- | --- |
| `ADMIN_USER` | `admin` | 示例管理守卫的 Basic auth 用户名。 |
| `ADMIN_PASS` | `changeme` | Basic auth 密码。 |
| `GUEST_MODEL` | `claude-opus-4-6` | 默认 CLI 适配器用的模型 id。 |
| `DATA_DIR` | `./data` | 会话 JSON 存放目录。 |
| `PORT` | `3000` | 示例宿主端口。 |

### 测试

```bash
npm test
```

`test/smoke.test.js` 用 Node 内置测试运行器加一个注入的假 LLM（无网络）：建会话、发
消息、验证 recall 钩子的值进了 system prompt、触发限流、关闭会话，并断言管理端列表返
回摘要**且没有 `messages` 字段**。

### 许可

本项目采用 **CC BY 4.0**（Creative Commons Attribution 4.0 International）许可。
你可以使用、修改、再分发（包括改编进你自己的项目），但**必须署名来源**：注明
"Atrio by Cu&Lunedì" 并附上本仓库链接，同时说明你是否做了修改。

详见 <https://creativecommons.org/licenses/by/4.0/> 与 [LICENSE](./LICENSE)。
