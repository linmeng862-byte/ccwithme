# Chat-C 接入中转 API 指南

---

## 第一步：打开侧边栏配置

首页 → 左上角 ☰ 菜单 → 展开 **API 配置** 区

---

## 第二步：填写配置

| 字段 | 填什么 | 示例 |
|------|--------|------|
| **API 格式** | 中转站选 `OpenAI`；Anthropic 官方选 `Anthropic` | OpenAI |
| **Endpoint** | 完整的聊天 API 地址（★ 最关键！） | `https://cc.cwapi.vip/v1/chat/completions` |
| **API Key** | 中转站给你的密钥 | `sk-b8ZBD4Kwy50...` |
| **Model** | 中转站支持的模型名 | `claude-sonnet-4-20250514` |

---

## Endpoint 怎么填（最容易出错 ⚠️）

**Chat-C 后端是原样透传的**——你填什么 URL，后端就 fetch 什么 URL。**不帮你拼路径**。

所以你要填**完整的聊天端点**：

| 中转站类型 | Endpoint 填法 |
|-----------|--------------|
| OpenAI 官方 | `https://api.openai.com/v1/chat/completions` |
| Anthropic 官方 | `https://api.anthropic.com/v1/messages` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` |
| 自建中转站 | 看中转站文档，一般是 `https://xxx.xxx/v1/chat/completions` |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` |
| Ollama 本地 | `http://localhost:11434/v1/chat/completions` |

**常见错误**：
- ❌ 只填 `https://cc.cwapi.vip`（缺路径）
- ❌ 填 `https://cc.cwapi.vip/v1`（缺 `/chat/completions`）
- ✅ 填 `https://cc.cwapi.vip/v1/chat/completions`

---

## API 格式怎么选

| 你用的中转站 | 选什么 | 原因 |
|-------------|--------|------|
| OpenAI 官方 | OpenAI | — |
| **绝大多数第三方中转站** | **OpenAI** | 90% 的中转站都兼容 OpenAI 格式 |
| Anthropic 官方 API | Anthropic | — |
| OpenRouter | OpenAI | OpenRouter 用 OpenAI 格式 |
| 不确定？ | **先试 OpenAI** | 兼容性最广 |

**判断方法**：看中转站文档里的示例——
- 请求头用 `Authorization: Bearer sk-xxx` → **OpenAI 格式**
- 请求头用 `x-api-key: sk-xxx` → **Anthropic 格式**

---

## Model 怎么填

问你的中转站客服/文档，看它支持哪些模型：

| 中转站类型 | Model 填法 |
|-----------|-----------|
| OpenAI 官方 | `gpt-4o`、`gpt-4o-mini` |
| Anthropic 中转 | `claude-sonnet-4-20250514`、`claude-haiku-4-5-20241022` |
| DeepSeek | `deepseek-chat`、`deepseek-reasoner` |
| OpenRouter | `anthropic/claude-sonnet-4-20250514`（带前缀） |

---

## 常见报错和解决

| 报错信息 | 原因 | 解决 |
|---------|------|------|
| `未配置中转站 API` | 没填 Endpoint 或 API Key | 回侧边栏填完保存 |
| `API 返回 401` | API Key 错误或过期 | 检查 Key 是否复制完整 |
| `API 返回 403` | Key 没权限用这个模型 | 换模型名，或联系中转站 |
| `API 返回 404` | Endpoint 路径错误 | **检查 URL 是否完整**（要带 `/v1/chat/completions`） |
| `API 返回 429` | 请求频率过高/额度用完 | 等一会再试 |
| `Invalid URL` | URL 拼接错误 | 填完整 Endpoint，不要只填域名 |
| 聊天一直空白无响应 | API 格式选错了 | 中转站用 OpenAI 格式就选 OpenAI |
| 连接不是专用连接 | Zeabur SSL 证书 | 点"高级→继续访问"，或绑自定义域名 |

---

## 调试技巧

### 1. 用浏览器 DevTools 看 SSE 流

F12 → Network → 找到 `chat` 请求 → EventStream 标签：

- 看到 `data: {"choices":[{"delta":{"content":"..."}}]}` → OpenAI 格式正常 ✅
- 看到 `data: {"type":"content_block_delta",...}` → Anthropic 格式正常 ✅
- 看到 HTML 错误页 → URL 填错了 ❌
- 什么都没有 → 中转站没响应 ❌

### 2. 先用 curl 测试中转站

```bash
curl https://cc.cwapi.vip/v1/chat/completions \
  -H "Authorization: Bearer sk-你的key" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","messages":[{"role":"user","content":"hi"}],"stream":true}'
```

curl 能返回数据 = 中转站没问题，填进 Chat-C 就能用。

### 3. 最常见的坑：复制粘贴带隐藏字符

从网页或微信复制 URL/Key 时，经常带入零宽空格等不可见字符。肉眼正常，程序读到乱码。

**解决**：在输入框里全选 → 删除 → **手动逐字敲**。
