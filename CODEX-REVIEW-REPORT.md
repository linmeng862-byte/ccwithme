# Chat-C Codex 审阅修改报告

> **审阅日期**: 2026-07-01  
> **审阅对象**: Codex 提供的 5 条修改建议  
> **项目**: https://github.com/linmeng862-byte/Chat-C

---

## 审阅结论总表

| 任务 | Codex 建议 | 判定 | 实际修改 | 备注 |
|------|-----------|------|---------|------|
| 1 | SSE 变量未声明 (P0 bug) | ✅ 合理 | 已修复 | 确认是隐式全局变量 bug |
| 2 | 加 OpenAI API 格式支持 | ✅ 合理 | 已实现 | 含前后端完整改动 |
| 3 | 前端加 API 格式选择 + Model 输入 | ✅ 合理 | 已实现 | Anthropic 默认选中 |
| 4 | Dockerfile 修复 | ⚠️ 部分合理 | 保留原样 | 已在更早版本完成，且 `node:22-slim` 优于 codex 建议的 `node:20-slim` |
| 5 | 加请求超时 120s | ✅ 合理 | 已实现 | 两个处理器都加了 |

---

## 详细修改记录

### 任务 1：SSE 变量声明 bug (P0) — ✅ 已修复

**问题**：`/api/chat` 路由中，`currentContentBlockType`、`currentToolId`、`currentToolName`、`currentToolInput`、`toolCalls`、`stopReason` 六个变量在 `reader.read()` 循环前未用 `let` 声明，成为隐式全局变量，跨请求污染导致并发 bug。

**修改位置**：`backend.js` 第 717 行附近

**修改内容**：
```js
// 修改前
let assistantText = '';
let thinkingText = '';
const reader = apiRes.body.getReader();

// 修改后
let assistantText = '';
let thinkingText = '';
let currentContentBlockType = '';
let currentToolId = '';
let currentToolName = '';
let currentToolInput = '';
let toolCalls = [];
let stopReason = '';
const reader = apiRes.body.getReader();
```

---

### 任务 2：OpenAI API 格式支持 — ✅ 已实现

**2.1 后端 `/api/auth` 多存两个字段**

```js
const { base_url, api_key, api_format, model } = req.body;
upsert.run('api_format', api_format || 'anthropic');  // 默认 anthropic（向后兼容）
if (model) upsert.run('model', model);
```

**2.2 后端 `/api/chat` 分流**

```js
const apiFormat = db.prepare("SELECT value FROM settings WHERE key = 'api_format'").get()?.value || 'anthropic';
const defaultModel = db.prepare("SELECT value FROM settings WHERE key = 'model'").get()?.value || '';
const useModel = model || defaultModel || 'claude-sonnet-4-6';

if (apiFormat === 'anthropic') {
  return handleAnthropicChat(req, res, { baseUrl, apiKey, model: useModel, history, systemPrompt, thinkingConfig, convId });
} else {
  return handleOpenAIChat(req, res, { baseUrl, apiKey, model: useModel, history, systemPrompt, convId });
}
```

**2.3 `handleAnthropicChat` — 原有代码重构为独立函数**

- 从 `app.post('/api/chat')` 提取为 `async function handleAnthropicChat(req, res, ctx)`
- **新增智能 endpoint 拼接**（Codex 方案未覆盖）：

```js
let endpoint = baseUrl.replace(/\/+$/, '');
if (endpoint.endsWith('/v1/messages')) { /* 已完整 */ }
else if (endpoint.endsWith('/v1')) { endpoint += '/messages'; }
else if (endpoint.includes('/v1/')) { endpoint += '/messages'; }
else { endpoint += '/v1/messages'; }
```

> 修复了 base_url 已含 `/v1/` 时路径重复（如 `/v1/chat/v1/messages`）的问题。

**2.4 `handleOpenAIChat` — 全新函数**

| 要点 | 实现 |
|------|------|
| endpoint 智能拼接 | 检查是否已含 `/v1/`，否则补 `/v1/chat/completions` |
| 认证头 | `Authorization: Bearer {apiKey}`（非 `x-api-key`） |
| 消息格式 | system → `messages[0].role="system"`；数组内容提取文字；图片转 `image_url` |
| Tools 格式 | `input_schema` → `function.parameters` |
| SSE 解析 | `choices[0].delta.content` → delta；`delta.tool_calls` → tool_use（增量式拼接 arguments）；`delta.reasoning_content` → thinking |
| Tool 循环 | `role: "tool"` + `tool_call_id`（非 Anthropic 的 `role: "user"` + `tool_result`） |

---

### 任务 3：前端 UI 改动 — ✅ 已实现

**侧边栏 API 配置区新增控件**：

| 控件 | 样式 | 默认值 |
|------|------|--------|
| API 格式 radio | `◉ Anthropic  ○ OpenAI` | Anthropic（向后兼容） |
| Model 输入框 | `<input id="drawerModel">` | 空（使用模型列表默认值） |

**`saveApiConfig()` 多传 `api_format` 和 `model`**：
```js
fetch('/api/auth', {
  body: JSON.stringify({ base_url, api_key, api_format, model })
})
```

**localStorage `chat_api_config` 扩展**：
```js
{ base_url, api_key, api_format: 'anthropic', model: 'claude-sonnet-4-6' }
```

**页面加载自动恢复**：读取 localStorage 配置，自动勾选对应 radio 和填充 model。

---

### 任务 4：Dockerfile — ⚠️ 未采纳（已在更早版本完成）

Codex 建议 `node:20-slim`，但我们已用更好的 `node:22-slim`。`EXPOSE 4567` 和 `ENV PORT` 已在之前版本删除。`.dockerignore` 和 `zbpack.json` 也已存在。

---

### 任务 5：请求超时 — ✅ 已实现

所有 `fetch()` 调用都加了 `signal: AbortSignal.timeout(120000)`：

| 位置 | 调用 |
|------|------|
| `handleAnthropicChat` 首次请求 | ✅ |
| `handleAnthropicChat` 工具循环第二次请求 | ✅ |
| `handleOpenAIChat` 首次请求 | ✅ |
| `handleOpenAIChat` 工具循环第二次请求 | ✅ |

---

## Codex 方案的改进点

| Codex 原始建议 | 我的调整 | 原因 |
|---------------|---------|------|
| 默认 `api_format='openai'` | 改为 `api_format='anthropic'` | 向后兼容：用户之前都在用 Anthropic 格式，改默认会断 |
| Anthropic 处理器无 endpoint 智能拼接 | 加了和 OpenAI 同级的逻辑 | 修复 `base_url` 含 `/v1/` 时路径重复 bug |
| 前端 radio OpenAI 默认选中 | 改为 Anthropic 默认选中 | 同上，向后兼容 |
| Dockerfile 用 `node:20-slim` | 保留 `node:22-slim` | 22 有更好的性能和 LTS 支持 |
| Tool 循环中重复执行 `executeTool` | OpenAI 处理器中只执行一次，结果同时用于展示和 API | 避免副作用（如写文件）被重复执行 |
