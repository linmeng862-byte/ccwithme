#!/bin/bash
# Chat-C Capacitor iOS 初始化脚本
# 在终端中运行: bash setup-capacitor.sh

set -e
echo "=== Chat-C Capacitor iOS 初始化 ==="

# 1. 安装依赖
echo "[1/4] 安装 npm 依赖..."
npm install

# 2. 构建 Capacitor 配置
echo "[2/4] 生成 Capacitor 配置..."
npx cap sync

# 3. 添加 iOS 平台
echo "[3/4] 添加 iOS 平台..."
npx cap add ios

# 4. 同步 web 资源
echo "[4/4] 同步 Web 资源到 iOS..."
npx cap copy ios

echo ""
echo "=== 完成！==="
echo ""
echo "下一步："
echo "1. git add . && git commit -m 'feat: Capacitor iOS 打包支持' && git push"
echo "2. 在 GitHub Actions 页面手动触发 'iOS Build' workflow"
echo "3. 下载生成的 .ipa artifact"
echo ""
echo "安装到手机："
echo "- 免费 Apple ID: 用 Apple Configurator 或 Xcode 侧载（7 天过期）"
echo "- 付费开发者: TestFlight 分发"
