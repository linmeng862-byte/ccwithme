# Zeabur 部署

仓库：`linmeng862-byte/ccwithme`（Deploy from GitHub，自动检测 Dockerfile）。
push 到 `main` 后自动重新部署。

**持久化必做**：Storage → Add Volume → Mount Path `/app/data`。
SQLite 库和上传文件都在那儿，不挂卷容器一重启就没了。

环境变量：`PORT`（默认 4567）、`AUTH_TOKEN`（不给就自动生成）。

---

⚠️ **Zeabur 上跑的是直连 API 的那套老部署，跟 VPS 这套不是一回事。**
VPS 这套走 cc-gateway spawn CLI，有记忆、Mind、workplace、语音，Zeabur 上都没有。
**两边代码不同步，别拿这份当当前架构看** —— 当前架构以实际代码为准，
路径见 `CLAUDE.local.md`，交接状态见 `HANDOVER.md`。
