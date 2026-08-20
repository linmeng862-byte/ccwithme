# Chat-C 变更日志 (CHANGELOG)

> 记录从初始提交到当前版本所有对生产环境有影响的改动。  
> 格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

---

## [v1.0.0] — 2026-07-01

### 🚀 新增功能

#### 核心聊天
- SSE 流式聊天，支持 `thinking / delta / tool_use / tool_result / done / error` 全事件类型
- AbortController 流式中断（发送中可随时停止）
- 消息历史持久化（SQLite `messages` 表，含 thinking 字段）
- 会话管理：创建 / 重命名 / 加星 / 删除 / 导出 MD/JSON
- 模型选择（claude-3-5-sonnet / claude-3-7-sonnet / claude-opus-4 等）
- Extended Thinking 开关（`effort` + `extended` 参数）
- 文件/图片上传（multer FormData，图片以 base64 发给 AI）

#### AI 工具（12 个）
| 工具 | 说明 |
|------|------|
| `get_weather` | 获取城市天气 |
| `get_time` | 获取当前时间（支持时区） |
| `search_memory` | 搜索记忆库 |
| `save_note` | 保存笔记 |
| `ombre_remember` | Ombre Brain 存储记忆 |
| `ombre_recall` | Ombre Brain 召回记忆 |
| `ombre_breath` | Ombre Breath 浮现 |
| `ombre_persona` | Ombre 人设查询 |
| `ombre_slang` | Ombre 俚语查询 |
| `project_write_file` | 写项目文件 |
| `project_read_file` | 读项目文件 |
| `project_list_files` | 列项目文件 |

#### Ombre Brain
- 服务端：`https://ye-ombre-brain.zeabur.app`
- 配置密码后，每次聊天自动调用 `/breath-hook` 注入记忆到 system prompt
- 5 个专属工具（remember / recall / breath / persona / slang）

#### Projects（项目管理）
- 创建/编辑/删除项目
- Files Tab：上传/创建/编辑/删除项目内文件
- Instructions Tab：编辑项目指令（保存为 `INSTRUCTIONS.md`）
- 切换至项目上下文后，Instructions 自动注入到每次对话的 system prompt

#### 其他功能
- 语音识别（Web Speech API，支持 zh-CN / en-US）
- 深色/浅色主题切换（手动 Toggle + 跟随系统 `prefers-color-scheme`，localStorage 持久化）
- 移动端适配（44px touch targets、safe-area、font-size ≥ 16px 防 iOS 缩放）
- 用户档案（昵称/全名/偏好设置）
- 日记功能（按日期写日记）
- 无 Gate：打开即聊，无需登录页

---

### 🛠️ 部署修复

#### `backend.js`

| 位置 | 改动前 | 改动后 | 原因 |
|------|--------|--------|------|
| 端口 | `const PORT = 4567` | `const PORT = process.env.PORT \|\| 4567` | Zeabur 运行时动态注入 PORT，硬编码导致服务无法对外暴露 |
| 监听地址 | `app.listen(PORT, cb)` | `app.listen(PORT, '0.0.0.0', cb)` | 容器默认只监听 127.0.0.1，Zeabur 网关无法转发 |
| Auth Token | 硬编码每次重启变化 | `process.env.AUTH_TOKEN \|\| 'claude-chat-' + timestamp` | 支持固定 Token，重启后前端不用重新配置 |
| 版本标记 | 无 | `const __VERSION__ = 'v1.0.0'` | 方便多版本区分，日志输出当前版本 |

#### `Dockerfile`

| 位置 | 改动前 | 改动后 | 原因 |
|------|--------|--------|------|
| 基础镜像 | `node:20-alpine` | `node:22-slim` | Alpine 缺少 glibc，`better-sqlite3` C++ 原生模块编译失败 |
| 构建工具 | 无 | `apt-get install python3 make g++` | `better-sqlite3` 需从源码编译 |
| 依赖安装 | `npm ci --omit=dev` | `npm install` | Windows 生成的 `package-lock.json` 与 Linux 不兼容 |
| 端口声明 | `EXPOSE 4567` | 已删除 | Zeabur 动态注入 PORT，固定 EXPOSE 无意义 |
| PORT 固化 | `ENV PORT=4567` | 已删除 | 防止构建期固化端口干扰运行时注入 |
| 数据目录 | 无 | `RUN mkdir -p data/uploads data/projects data/uploads/tmp` | 首次启动目录不存在报错 |

最终 Dockerfile：
```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN mkdir -p data/uploads data/projects data/uploads/tmp
ENV NODE_ENV=production
CMD ["node", "backend.js"]
```

#### `zbpack.json` — Zeabur 构建模式（新建）
```json
{"build_mode": "docker"}
```
强制 Zeabur 使用 Dockerfile 构建，否则走 Node.js 模式导致 `better-sqlite3` 编译失败。

> ⚠️ 此文件必须始终保留在仓库根目录。

#### `.dockerignore` — 构建上下文排除（新建）
```
node_modules/
data/
.git/
*.md
docker-compose.yml
deploy.sh
.codeflicker/
```
排除 Windows 下编译的 `node_modules/`，避免与容器内 Linux 二进制冲突。

#### `package.json`

| 字段 | 改动前 | 改动后 | 说明 |
|------|--------|--------|------|
| `name` | `claude` | `chat-c` | 项目重命名 |
| `main` | `add-mock.js` | `backend.js` | 旧文件不存在，容器启动失败 |
| `scripts.start` | `node server.js` | `node backend.js` | 同上，关键修复 |
| `license` | `ISC` | `MIT` | 更新开源协议 |

#### `static/index.html`

| 改动 | 说明 |
|------|------|
| `<link rel="icon" href="/logo.png">` | 新增 favicon |
| `state.__VERSION__ = 'v1.0.0'` | 版本标记 |

#### `static/logo.png` — 新增
网站图标，由 `express.static` 自动托管，访问路径 `/logo.png`。

#### 已删除文件

| 文件 | 原因 |
|------|------|
| `package-lock.json` | Windows 路径格式与 Linux 构建不兼容 |
| `deploy.sh` | 临时脚本，不参与生产构建 |

---

## Zeabur 部署链路

```
GitHub push
    │
    ▼
Zeabur 检测 zbpack.json → Docker 模式
    │
    ▼
Docker build (node:22-slim)
    ├── apt-get install python3 make g++
    ├── npm install  ← better-sqlite3 在此编译原生模块
    └── COPY 全部源码
    │
    ▼
容器启动
    ├── Zeabur 注入 PORT（如 34567）
    └── app.listen(PORT, '0.0.0.0')
    │
    ▼
Zeabur 网关（HTTPS 443）
    └── 反向代理 → 容器 PORT
    │
    ▼
https://xxx.zeabur.app
```

---

## Zeabur 持久化（必做）

Zeabur 容器重部署后 `/app/data` 会被清空，所有对话/记忆/项目都会丢失。

**操作：** Zeabur 控制台 → 服务 → Storage → Add Volume  
**挂载路径：** `/app/data`

---

## 常见问题排查

| 现象 | 根因 | 解决方案 |
|------|------|----------|
| `Cannot find module 'better-sqlite3'` | 走了 Node.js 构建模式，原生模块编译失败 | 确认 `zbpack.json` 存在且 `build_mode: docker` |
| `Cannot find module 'express'` | `node_modules` 未正确安装 | Dockerfile 中 `npm install` 在 `COPY . .` 之前执行 |
| 服务反复 BackOff 重启 | `package.json` 的 `start` 指向不存在文件 | 确认 `scripts.start` = `node backend.js` |
| SSL 证书警告 | Zeabur 默认证书由 "Zeabur Pte. Ltd." 自签 | 点击「高级 → 继续访问」，或绑定自定义域名获取正规证书 |
| 重启后数据全丢 | 未挂载持久化 Volume | Zeabur 控制台挂载 `/app/data` |
| 前端请求 403 | AUTH_TOKEN 每次重启变化，前端 token 失效 | 在 Zeabur 环境变量设置固定 `AUTH_TOKEN` |

---

## 下一版规划（v1.1.0 TODO）

- [ ] 消息气泡内 Markdown 渲染（marked.js 已引入，待启用）
- [ ] AI 生成代码的 Artifacts 实时预览面板
- [ ] 对话内容搜索
- [ ] 图片附件前端预览（上传后气泡内展示缩略图）
- [ ] Ombre Brain 离线/密码错误友好提示
- [ ] 会话列表虚拟滚动/分页（目前一次全部加载）
- [ ] 工具调用多轮循环（当前只支持单轮）
- [ ] 自定义域名绑定引导文档

---

## 修改代码注意事项

1. **`static/index.html` 是单文件 SPA**，修改时绝不用通用字符串（如 `});`）做边界定位，必须用唯一上下文
2. **`better-sqlite3` 是 C++ 原生模块**，任何环境变化（Node 版本、OS）都需重新编译
3. **SSE 事件格式转换**在 `/api/chat` 路由中，改动需同步更新 Anthropic 原始格式与自定义格式的映射关系
4. **前端 `state` 对象**是全局单例，所有 UI 状态都集中在此
5. **暗色主题 CSS** 同时写在 `@media(prefers-color-scheme:dark)` 和 `html[data-theme="dark"]` 两处，改样式需两处同步
6. **Project Instructions** 以 `INSTRUCTIONS.md` 文件存储在 `project_files` 表，每次聊天时自动注入 system prompt
