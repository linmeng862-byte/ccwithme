# Chat-C 项目架构文档

> **版本**: v1.0.0 (2026-07-01)
> **仓库**: https://github.com/linmeng862-byte/Chat-C
> **版本标记**: `__VERSION__ = 'v1.0.0'` 在 `backend.js` 顶部和 `static/index.html` 的 `state` 对象中

---

## 一、项目概述

Claude.ai 风格的聊天前端，连接**第三方中转站/代理 API**（非官方 Anthropic API）。无登录页面，打开即聊。API 配置在侧边栏。

### 核心特性

| 特性 | 状态 | 说明 |
|------|------|------|
| SSE 流式聊天 | ✅ | thinking + delta + tool_use + tool_result |
| 12 个 AI 工具 | ✅ | 天气/时间/记忆/笔记/Ombre Brain/项目文件 |
| Ombre Brain | ✅ | 5个工具 + auto breath-hook 注入 system prompt |
| Projects | ✅ | Files + Instructions tabs, 指令注入 system prompt |
| 语音识别 | ✅ | Web Speech API (zh-CN/en-US) |
| 文件上传 | ✅ | multer FormData + 图片 base64 发给 AI |
| 导出对话 | ✅ | Markdown / JSON |
| 深色/浅色主题 | ✅ | Toggle + 跟随系统 |
| 流式中断 | ✅ | AbortController |
| 移动端适配 | ✅ | 44px touch targets, safe-area, font-size 16px |
| 无 Gate | ✅ | 直接打开聊天 |

---

## 二、技术栈

```
后端:  Node.js + Express 5 + better-sqlite3 + multer
前端:  单文件 SPA (static/index.html, ~389KB, ~2085行)
CSS:   static/design-system.css + 内联 CSS 变量
依赖:  marked.min.js (Markdown 渲染)
数据库: SQLite (data/claude.db)
```

---

## 三、数据存储

### 3.1 文件系统结构

```
data/
├── claude.db              # SQLite 主数据库（所有业务数据）
├── uploads/               # 聊天上传的文件
│   ├── {id}_{filename}    # 实际文件
│   └── tmp/               # multer 临时目录
└── projects/              # 项目目录（目前仅用于文件删除时清理）
```

### 3.2 SQLite 表结构

#### `settings` — 全局配置
| 列 | 类型 | 说明 |
|----|------|------|
| key | TEXT PK | 配置键名 |
| value | TEXT | 配置值 |

存储内容: `base_url`, `api_key`, `ombre_password`

#### `sessions` — 对话会话
| 列 | 类型 | 说明 |
|----|------|------|
| conv_id | TEXT PK | 会话ID (时间戳+随机) |
| title | TEXT | 会话标题，默认"新对话" |
| starred | INTEGER | 是否加星 (0/1) |
| project_id | TEXT | 关联的项目ID (可NULL) |
| created_at | INTEGER | Unix 时间戳 |
| updated_at | INTEGER | Unix 时间戳 |

#### `messages` — 消息记录
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增ID |
| conv_id | TEXT | 所属会话 (FK → sessions) |
| role | TEXT | 'user' 或 'assistant' |
| content | TEXT | 消息正文 |
| thinking | TEXT | AI 思考过程 |
| attachments | TEXT | JSON 数组, 如 `[{"path":"xxx"}]` |
| created_at | INTEGER | Unix 时间戳 |

#### `profile` — 用户档案
| 列 | 类型 | 说明 |
|----|------|------|
| key | TEXT PK | 键名 |
| value | TEXT | 值 |

存储内容: `fullName`, `nickname`, `preferences`

#### `saved_memories` — 保存的记忆
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 记忆ID |
| content | TEXT | 记忆内容 |
| enabled | INTEGER | 是否启用 (0/1) |
| source | TEXT | 来源，默认'manual' |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

#### `diary` — 日记
| 列 | 类型 | 说明 |
|----|------|------|
| date | TEXT PK | 日期 (YYYY-MM-DD) |
| content | TEXT | 日记内容 |
| created_at | INTEGER | 创建时间 |

#### `uploads` — 上传文件
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 文件ID |
| filename | TEXT | 原始文件名 |
| path | TEXT | 服务器存储路径 |
| size | INTEGER | 文件大小(字节) |
| created_at | INTEGER | 上传时间 |

#### `projects` — 项目
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 项目ID (时间戳+随机) |
| name | TEXT | 项目名称 |
| description | TEXT | 项目描述 |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

#### `project_files` — 项目文件
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | 文件ID |
| project_id | TEXT | 所属项目 (FK → projects) |
| filename | TEXT | 文件名 |
| content | TEXT | 文件内容 |
| size | INTEGER | 文件大小 |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

**特殊文件**: `INSTRUCTIONS.md` — 项目指令，自动注入到该项目的对话 system prompt

---

## 四、后端架构 (backend.js)

### 4.1 启动流程

```
1. 初始化 SQLite (data/claude.db, WAL 模式)
2. 建表 (8 个表 + 迁移 sessions.project_id)
3. 创建 data/uploads, data/projects 目录
4. 配置 multer 文件上传
5. 配置中间件 (JSON parser, 静态文件)
6. 注册路由
7. 监听 PORT (0.0.0.0)
```

### 4.2 认证机制

- **AUTH_TOKEN**: `process.env.AUTH_TOKEN || 'claude-chat-' + Date.now().toString(36)`
- **auth 中间件**: 检查 `Authorization: Bearer <token>`
- **获取 token**: POST `/api/auth` 提交 base_url + api_key → 返回 token
- **前端存储**: `localStorage.chat_token`

### 4.3 API 路由一览

| 路由 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/auth` | POST | 无 | 保存中转站配置，返回 token |
| `/api/auth/ombre` | POST | auth | 保存 Ombre Brain 密码 |
| `/api/auth/ombre` | GET | auth | 查询 Ombre Brain 配置状态 |
| `/api/sessions` | GET | auth | 获取会话列表 (按更新时间倒序) |
| `/api/sessions` | POST | auth | 创建会话 |
| `/api/sessions/:id/title` | PATCH | auth | 修改会话标题 |
| `/api/sessions/:id/star` | PATCH | auth | 加星/取消星 |
| `/api/sessions/:id` | DELETE | auth | 删除会话及消息 |
| `/api/sessions/:id/messages` | GET | auth | 获取消息 (分页, limit/before) |
| `/api/chat` | POST | auth | **核心: SSE 聊天代理** |
| `/api/profile` | GET | auth | 获取用户档案 |
| `/api/profile` | POST | auth | 保存用户档案 |
| `/api/profile` | PUT | auth | 更新用户档案 |
| `/api/diary` | GET | auth | 获取日记列表 |
| `/api/diary` | POST | auth | 写日记 |
| `/api/tool-caption` | POST | auth | 获取工具标题 |
| `/api/projects` | GET | auth | 获取项目列表 |
| `/api/projects` | POST | auth | 创建项目 |
| `/api/projects/:id` | DELETE | auth | 删除项目及文件 |
| `/api/projects/:id` | PUT | auth | 编辑项目名/描述 |
| `/api/projects/:id/files` | GET | auth | 项目文件列表 |
| `/api/projects/:id/files` | POST | auth | 创建/上传项目文件 |
| `/api/projects/:pid/files/:fid` | GET | auth | 读取文件内容 |
| `/api/projects/:pid/files/:fid` | PUT | auth | 更新文件内容 |
| `/api/projects/:pid/files/:fid` | DELETE | auth | 删除文件 |
| `/api/upload` | POST | auth | 聊天文件上传 (multer multipart) |
| `/api/models` | GET | 无 | 返回模型列表 |
| `/api/splash` | GET | 无 | 返回时间问候语 |

### 4.4 `/api/chat` 核心流程（最重要）

```
1. 接收: { message, conversation_id, model, effort, extended, attachments, project_id }
2. 获取/创建会话 (sessions 表)
3. 保存用户消息 (messages 表)
4. 构建消息历史 (从 DB 读取, 图片附件转 base64)
5. 构建 system prompt:
   - 基础指令
   + Ombre Breath-hook 记忆 (如果配了密码)
   + Project Instructions (如果会话关联了 project_id, 读 INSTRUCTIONS.md)
6. 发送到中转站 API (POST base_url/v1/messages, stream: true)
7. 流式代理 SSE → 自定义事件格式转换:
   - Anthropic content_block_start (thinking) → event: thinking
   - Anthropic content_block_delta + thinking_delta → event: thinking
   - Anthropic content_block_delta + text_delta → event: delta
   - Anthropic content_block_stop (thinking) → event: thinking (done)
   - Anthropic content_block_stop (text) → 无
   - message_stop → event: done
   - message_start → event: conversation (提取 conversation_id)
   - error → event: error
8. 工具调用循环:
   - 检测 stop_reason='tool_use'
   - 提取 tool_use blocks
   - 执行工具 (executeTool)
   - 构建包含 tool_result 的新消息
   - 再次请求 API 获取工具结果后的回复
9. 保存助手消息 (content + thinking 到 messages 表)
```

### 4.5 SSE 事件格式（前端→后端）

```
event: conversation
data: {"conversation_id":"xxx"}

event: thinking
data: {"text":"思考内容..."}

event: delta
data: {"text":"回复文字..."}

event: tool_use
data: {"id":"xxx","name":"get_weather","input":"..."}

event: tool_result
data: {"id":"xxx","name":"get_weather","output":"..."}

event: trace_summary
data: {"text":"工具调用总结"}

event: done
data: {"conversation_id":"xxx"}

event: error
data: {"message":"错误信息"}
```

### 4.6 AI 工具定义 (TOOLS 数组)

| 工具名 | 说明 | 输入参数 |
|--------|------|----------|
| `get_weather` | 获取天气 | `city`(string) |
| `get_time` | 获取时间 | `timezone`(string, 可选) |
| `search_memory` | 搜索记忆 | `query`(string) |
| `save_note` | 保存笔记 | `title`(string), `content`(string) |
| `ombre_remember` | Ombre Brain 记忆 | `content`(string) |
| `ombre_recall` | Ombre Brain 回忆 | `query`(string) |
| `ombre_breath` | Ombre Breath 浮现 | 无 |
| `ombre_persona` | Ombre 人设 | `query`(string) |
| `ombre_slang` | Ombre 俚语 | `query`(string) |
| `project_write_file` | 写项目文件 | `project_id`(string), `filename`(string), `content`(string) |
| `project_read_file` | 读项目文件 | `project_id`(string), `filename`(string) |
| `project_list_files` | 列项目文件 | `project_id`(string) |

### 4.7 Ombre Brain 集成

- **服务器**: `https://ye-ombre-brain.zeabur.app`
- **认证**: Cookie (`ombre_session`)
- **密码存储**: `settings` 表 `ombre_password` 键
- **Breath-hook**: `/breath-hook` (无需认证，返回浮现记忆文本)
- **自动注入**: 每次聊天请求时，如果配了 Ombre 密码，自动 fetch breath-hook 并注入 system prompt
- **工具调用**: `ombre_remember/recall/breath/persona/slang` 需要先 `ensureOmbreSession()` 获取 cookie

---

## 五、前端架构 (static/index.html)

### 5.1 整体结构

单文件 SPA (~2085行, ~389KB)，包含：
- 内联 CSS（CSS 变量 + 暗色主题覆盖 + 移动端适配）
- HTML 结构（侧边栏、聊天区、Composer、各种面板）
- JavaScript（状态管理、SSE 处理、UI 交互）

### 5.2 核心全局对象

```javascript
// 全局状态
const state = {
  token,           // auth token (localStorage)
  convId,          // 当前会话ID
  legacySessionId, // 旧版会话ID (不再使用)
  currentTitle,    // 当前会话标题
  starred,         // 是否加星
  model,           // 当前模型
  settings,        // 模型设置 {effort, extended}
  busy,            // 是否正在生成
  pendingFiles,    // 待上传文件
  models,          // 可用模型列表
  menuSession,     // 右键菜单目标会话
  profile,         // 用户档案
  projectId,       // 当前项目上下文
  abortController, // 流式中断控制器
  ...
};

// DOM 引用
const chat, stream, streamInner, input, send;
```

### 5.3 关键函数

| 函数 | 说明 |
|------|------|
| `sendMessage(text, showUser, files, existingAttachments)` | 发送消息，触发 SSE 流式请求 |
| `beginClaude(text, attachments)` | 创建 AI 回复 DOM，返回 msg 对象 |
| `resetEmpty()` | 显示空对话欢迎界面 + 问候语 |
| `newChat()` | 新建对话（清除 convId, projectId） |
| `loadSessions()` | 加载侧边栏会话列表 |
| `loadMessages(convId)` | 加载历史消息 |
| `api(url, options)` | 封装 fetch（自动带 auth header） |
| `saveApiConfig()` | 保存中转站 API 配置 |
| `greeting()` | 生成时间问候语 |
| `exportChat(format)` | 导出对话 (md/json) |
| `showProjectList()` / `showProjectDetail()` | Projects 面板视图切换 |

### 5.4 `sendMessage` 流程

```
1. 检查 busy 状态和输入内容
2. state.busy = true
3. 上传待发文件 (uploadPendingFiles) → 获得 attachments
4. 显示用户消息气泡
5. beginClaude() 创建 AI 回复占位
6. fetch('/api/chat', { signal: abortController.signal })
7. 解析 SSE 事件流 (readable stream)
8. 根据 event 类型更新 UI:
   - conversation → 更新 convId
   - thinking → msg.thinking()
   - delta → msg.text()
   - tool_use → msg.toolUse()
   - tool_result → msg.toolResult()
   - done → msg.finish()
   - error → msg.fail()
9. state.busy = false
```

### 5.5 侧边栏结构

```
#drawer
├── 头部 (新对话按钮)
├── 会话列表 (可滑动、长按菜单)
│   ├── 每项: 标题 + 时间 + 星标
│   └── 右键菜单: Star / Rename / Export MD / Export JSON / Delete
├── API 配置区
│   ├── Base URL 输入框
│   ├── API Key 输入框
│   ├── 保存按钮 → /api/auth
│   └── 状态提示
├── 深色模式 Toggle
├── Ombre Brain 配置区
│   ├── 密码输入框
│   └── 保存按钮
└── Projects 按钮 → 打开 Project 面板
```

### 5.6 Projects 面板

```
#projectPanel (右侧固定面板, 覆盖层)
├── 项目列表视图
│   ├── 标题 "Projects" + "New project" 按钮
│   └── 项目卡片 (名称 + 描述 + 文件数 + ✏️编辑 + 🗑️删除)
│
└── 项目详情视图
    ├── 标题 + 描述 + "Chat in project" 按钮
    ├── Files Tab
    │   ├── "+ Upload file or create" 按钮
    │   ├── 文件列表 (📄 filename + 大小 + ✕删除)
    │   └── 文件编辑器 (textarea)
    │
    └── Instructions Tab
        ├── 说明文字
        ├── textarea 编辑区
        └── "Save instructions" 按钮 → 保存为 INSTRUCTIONS.md
```

### 5.7 主题系统

- **检测**: `matchMedia('(prefers-color-scheme:dark)')`
- **手动切换**: `document.documentElement.dataset.theme = 'dark' | 'light'`
- **持久化**: `localStorage.chat_theme`
- **CSS**: 内联 `@media(prefers-color-scheme:dark)` + `<style id="darkOverride">` 中的 `html[data-theme="dark"]` 覆盖

---

## 六、关键文件路径

```
backend.js                     # 后端主入口 (1150行)
static/index.html              # 前端 SPA (2085行, 389KB)
static/design-system.css        # 设计系统 CSS
static/marked.min.js            # Markdown 解析器
package.json                    # 依赖声明
Dockerfile                      # Docker 构建配置
.dockerignore                   # Docker 忽略文件
docker-compose.yml               # Docker Compose
data/claude.db                  # SQLite 数据库 (运行时生成)
data/uploads/                   # 上传文件 (运行时生成)
data/projects/                  # 项目目录 (运行时生成)
```

---

## 七、环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务监听端口 | `4567` |
| `AUTH_TOKEN` | 认证 token | `claude-chat-{timestamp}` |
| `NODE_ENV` | 运行环境 | - |

---

## 八、部署指南

### Zeabur (推荐)
1. Deploy from GitHub → 选仓库
2. **Build Mode 选 Docker**（否则 better-sqlite3 编不过）
3. Storage → Add Volume → Mount Path: `/app/data`
4. Networking → Generate Domain

### Docker
```bash
docker compose up -d
```

### VPS
```bash
git clone https://github.com/linmeng862-byte/Chat-C.git
cd Chat-C && npm install && node backend.js
# 或用 pm2: pm2 start backend.js --name chat-c
```

---

## 九、已知限制 & TODO

- [ ] Markdown 渲染 (marked.js 已引入但未在消息气泡中启用)
- [ ] Artifacts 预览 (AI 生成的代码实时预览)
- [ ] 对话搜索
- [ ] 图片附件在前端消息气泡中的预览
- [ ] Ombre Brain 离线容错（密码错误时无友好提示）
- [ ] 会话列表分页加载（目前一次加载全部）
- [ ] Tool call 循环只支持一轮（复杂工具链需多轮）

---

## 十、修改注意事项

1. **static/index.html 是单文件 SPA**，任何修改都要极其小心，特别是删除操作 — **绝不用 `})();` 等通用字符串做边界**，只用唯一标记
2. **better-sqlite3 是 C++ 原生模块**，需要编译工具链，Zeabur 部署必须用 Docker 模式
3. **SSE 格式转换** 在 `/api/chat` 路由中，修改时注意 Anthropic API 的事件格式和自定义事件格式的映射
4. **前端 state 对象** 是全局单例，所有 UI 交互都依赖它
5. **CSS 变量** 同时支持 `@media(prefers-color-scheme:dark)` 和 `html[data-theme="dark"]`，修改暗色样式要两处都改
6. **Project instructions** 通过 `INSTRUCTIONS.md` 文件存储，在 `/api/chat` 时注入 system prompt
