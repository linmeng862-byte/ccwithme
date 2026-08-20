# Chat-C 双 API 格式适配设计

> **版本**: v1.1.0 规划  
> **日期**: 2026-07-01

---

## 一、目标

让 Chat-C 同时支持 **OpenAI 兼容格式** 和 **Anthropic 原生格式**，用户在侧边栏配置时选择 API 格式，后端根据选择分流处理。

## 二、两种格式差异对照

| | Anthropic 原生 | OpenAI 兼容 |
|---|---|---|
| 端点 | `{base_url}/v1/messages` | `{base_url}/v1/chat/completions` |
| 认证头 | `x-api-key: {key}` | `Authorization: Bearer {key}` |
| System Prompt | 请求体 `system` 字段 | `messages[0].role = "system"` |
| Tools 格式 | `{name, description, input_schema}` | `{type:"function", function:{name, description, parameters}}` |
| 文本流 | `content_block_delta.delta.text_delta` | `choices[0].delta.content` |
| 思考流 | `content_block_delta.delta.thinking_delta` | `choices[0].delta.reasoning_content`（部分中转站支持） |
| Tool 调用流 | `content_block_start.type=tool_use` + `input_json_delta` | `choices[0].delta.tool_calls[0].function` |
| Tool 结果格式 | `{role:"user", content:[{type:"tool_result",...}]}` | `{role:"tool", tool_call_id, content}` |
| 结束 | `message_delta.stop_reason` / `message_stop` | `data: [DONE]` 或 `finish_reason:"stop"` |
| 心跳 | 无 | `: keep-alive` 注释行 |

## 三、前端改动（`static/index.html`）

### 3.1 侧边栏 API 配置区新增

在 Base URL 和 API Key 之间加两个控件：
1. **API 格式选择器**（radio：`OpenAI 兼容` / `Anthropic 原生`）
2. **自定义模型输入框**（可选，不填则用默认模型列表）

### 3.2 `saveApiConfig()` 多传两个字段

```js
fetch('/api/auth', {
  method: 'POST',
  body: JSON.stringify({
    base_url: baseURL,
    api_key: apiKey,
    api_format: 'openai',       // ← 新增
    model: 'claude-sonnet-4-6'  // ← 新增
  })
})
```

### 3.3 localStorage 持久化

`chat_api_config` 存 `{base_url, api_key, api_format, model}`

## 四、后端改动（`backend.js`）

### 4.1 `/api/auth` 多存两个字段

```js
upsert.run('api_format', api_format || 'openai');
upsert.run('model', model || '');
```

### 4.2 `/api/chat` 分流

```js
const apiFormat = db.prepare("SELECT value FROM settings WHERE key = 'api_format'").get()?.value || 'openai';

if (apiFormat === 'openai') {
  return handleOpenAIChat(req, res, ctx);
} else {
  // 原有 Anthropic 逻辑不变
  return handleAnthropicChat(req, res, ctx);
}
```

### 4.3 OpenAI 格式实现要点

1. **endpoint 智能拼接**：`base_url` 后补 `/v1/chat/completions`（除非已包含）
2. **消息格式转换**：history → OpenAI messages 数组，system 放第一条
3. **Tools 格式转换**：`input_schema` → `function.parameters`
4. **SSE 解析**：`choices[0].delta.content` → `event: delta`
5. **Tool 循环**：OpenAI 格式的 `tool_calls` / `tool` role
6. **模型 fallback**：从 DB 读 `model`，没有则用前端传的 `model`

## 五、不影响现有逻辑

- Anthropic 原生路径：**完全不动**，只在 `/api/chat` 入口加一个 `if/else`
- 数据库：只新增 `api_format` 和 `model` 两个 settings 键，不改表结构
- 前端：只扩展侧边栏配置区，不改聊天流程
