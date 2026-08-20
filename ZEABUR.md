# Zeabur 部署指南

## 方法一：从 GitHub 部署（推荐）

1. 登录 [Zeabur](https://zeabur.com)
2. 新建项目 → **Deploy from GitHub** → 选择 `linmeng862-byte/Chat-C`
3. Zeabur 自动检测 Dockerfile 并构建
4. 在 **Networking** 页点 **Generate Domain** 获得免费域名

## 持久化存储（重要！）

SQLite 数据库在容器内 `/app/data/` 目录，容器重启会丢失数据。

**解决方法**：在 Zeabur 控制台 → **Storage** → **Add Volume**：
- Mount Path: `/app/data`
- 这会持久化 SQLite 数据库和上传的文件

## 环境变量（可选）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | 4567 |
| `AUTH_TOKEN` | 认证 token | 自动生成 |

## 自定义域名

在 Zeabur → **Networking** → **Custom Domain** → 绑定你的域名
Zeabur 自动配 HTTPS

## 更新部署

push 到 GitHub 的 main 分支后，Zeabur 自动重新部署
