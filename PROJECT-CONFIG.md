# Chat-C 项目配置文档

> 仓库地址: https://github.com/linmeng862-byte/Chat-C.git

## 项目概述

Claude.ai 风格的聊天前端，连接第三方中转站 API（非官方 Anthropic API），无登录页面，直接进入聊天。

## 技术栈

- **后端**: Node.js + Express 5 + better-sqlite3 + multer
- **前端**: 单文件 SPA (`static/index.html`, ~389KB) + `design-system.css` + `marked.min.js`
- **端口**: 4567（支持 `PORT` 环境变量）
- **数据库**: SQLite (`data/claude.db`，自动创建)

## 项目结构

```
Chat-C/
├── backend.js          # Express + SQLite 后端 (主入口)
├── package.json        # 依赖: express, better-sqlite3, multer
├── Dockerfile          # Docker 构建（当前有问题需修复）
├── zbpack.json         # Zeabur 构建配置（刚加的，可能需要调整）
├── docker-compose.yml
├── .gitignore
├── README.md
├── ZEABUR.md
├── deploy.sh
└── static/
    ├── index.html      # 主 SPA
    ├── design-system.css
    └── marked.min.js
```

## package.json 依赖

```json
{
  "dependencies": {
    "better-sqlite3": "^12.11.1",
    "express": "^5.2.1",
    "multer": "^2.2.0"
  }
}
```

**⚠️ 关键**: `better-sqlite3` 是 C++ 原生模块，需要 `python3`, `make`, `g++` 编译工具链

## 当前 Zeabur 部署问题

### 错误信息
```
BackOff: Back-off restarting failed container
Error: Cannot find module 'express'
```

### 根因分析
1. Zeabur 可能忽略了 Dockerfile，自动检测到 `package.json` 后使用自己的 Node.js 构建模式
2. Zeabur 的 Node.js 构建模式可能没装 `better-sqlite3` 的原生编译依赖
3. 也可能 Zeabur 用了 Dockerfile 但 `npm install` 失败了（编译 better-sqlite3 需要 python3/make/g++）

### 当前 Dockerfile
```dockerfile
FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm install
RUN mkdir -p data/uploads data/projects data/uploads/tmp
EXPOSE 4567
ENV NODE_ENV=production
ENV PORT=4567
CMD ["node", "backend.js"]
```

### 当前 zbpack.json
```json
{
  "build_command": "npm install",
  "start_command": "node backend.js",
  "install_command": "apt-get update && apt-get install -y python3 make g++ && npm install",
  "build_mode": "docker"
}
```

## 需要解决的方向

1. **确认 Zeabur 使用了 Dockerfile** — 可能需要在 Zeabur 控制台手动选择 Docker 构建模式
2. **或者不用 Dockerfile** — 用 Zeabur 原生 Node.js 模式，但需要确保原生模块能编译
3. **或者换掉 better-sqlite3** — 用纯 JS 的 `sql.js`（不需要编译工具），但要改后端代码
4. **数据持久化** — Zeabur 容器重启数据会丢，需要在 Zeabur 控制台加 Volume，Mount Path: `/app/data`

## 后端关键配置

- **启动命令**: `node backend.js`
- **监听端口**: `process.env.PORT || 4567`
- **AUTH_TOKEN**: `process.env.AUTH_TOKEN || 'claude-chat-' + Date.now().toString(36)`
- **数据目录**: `./data/` (SQLite + uploads + projects)
- **静态文件**: `./static/`

## 后端 API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth` | POST | 保存 API 配置(base_url, api_key)，返回 token |
| `/api/sessions` | GET | 获取会话列表 |
| `/api/sessions` | POST | 创建会话 |
| `/api/sessions/:id` | DELETE | 删除会话 |
| `/api/sessions/:id/title` | PATCH | 改标题 |
| `/api/sessions/:id/star` | PATCH | 加星 |
| `/api/sessions/:id/messages` | GET | 获取消息（分页） |
| `/api/chat` | POST | SSE 聊天代理（核心，转发到中转站 API） |
| `/api/profile` | GET/POST/PUT | 用户档案 |
| `/api/diary` | GET/POST | 日记 |
| `/api/upload` | POST | 文件上传（multer multipart） |
| `/api/models` | GET | 模型列表 |
| `/api/splash` | GET | 启动画面 |
| `/api/auth/ombre` | POST/GET | Ombre Brain 认证 |
| `/api/projects` | GET/POST | 项目 CRUD |
| `/api/projects/:id` | DELETE/PUT | 删除/编辑项目 |
| `/api/projects/:id/files` | GET/POST | 项目文件列表/创建 |
| `/api/projects/:pid/files/:fid` | GET/PUT/DELETE | 文件读写删 |

## 前端功能清单

- ✅ SSE 流式聊天（thinking + delta + tool_use + tool_result）
- ✅ 12 个 AI 工具（get_weather, get_time, search_memory, save_note, ombre_remember/recall/breath/persona/slang, project_write_file/read_file/list_files）
- ✅ Ombre Brain 记忆集成（auto breath-hook 注入 system prompt）
- ✅ Projects（Files + Instructions tabs，项目指令注入 system prompt）
- ✅ 语音识别（Web Speech API）
- ✅ 文件上传（multer FormData + 图片 base64 发给 AI）
- ✅ 导出对话（Markdown/JSON）
- ✅ 深色/浅色主题切换
- ✅ 流式中断（AbortController）
- ✅ 移动端适配
- ✅ 无 Gate/登录页面

## Zeabur 部署所需操作

1. 从 GitHub 导入仓库
2. **构建模式选 Docker**（如果 Zeabur 允许手动选）
3. **加持久化存储**: Storage → Add Volume → Mount Path: `/app/data`
4. **生成域名**: Networking → Generate Domain
5. **可选环境变量**: `AUTH_TOKEN`（设固定值避免每次部署 token 变化）
