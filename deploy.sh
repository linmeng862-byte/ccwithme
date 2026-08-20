#!/bin/bash
# ============================================
# Chat-C VPS 部署脚本
# 用法: bash deploy.sh
# ============================================

set -e

echo "🧡 Chat-C Deploy Script"
echo "========================"

# --- 配置 ---
APP_DIR="/opt/chat-c"
REPO_URL="https://github.com/linmeng862-byte/Chat-C.git"
PORT=4567
DOMAIN=""  # 留空则只用 IP:PORT，填域名则配 Nginx+HTTPS

# --- 检查系统 ---
if command -v apt-get &>/dev/null; then
  PKG_MGR="apt-get"
  echo "📦 检测到 Debian/Ubuntu 系统"
elif command -v yum &>/dev/null; then
  PKG_MGR="yum"
  echo "📦 检测到 CentOS/RHEL 系统"
else
  echo "❌ 不支持的系统"; exit 1
fi

# --- 安装基础依赖 ---
echo "📦 安装基础依赖..."
if [ "$PKG_MGR" = "apt-get" ]; then
  sudo apt-get update -y
  sudo apt-get install -y curl git nginx certbot python3-certbot-nginx
elif [ "$PKG_MGR" = "yum" ]; then
  sudo yum install -y curl git nginx certbot python3-certbot-nginx
fi

# --- 安装 Node.js ---
if ! command -v node &>/dev/null; then
  echo "📦 安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null || \
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
  if [ "$PKG_MGR" = "apt-get" ]; then
    sudo apt-get install -y nodejs
  else
    sudo yum install -y nodejs
  fi
fi
echo "✅ Node.js $(node -v)"

# --- 安装 PM2 ---
if ! command -v pm2 &>/dev/null; then
  echo "📦 安装 PM2..."
  sudo npm install -g pm2
fi

# --- 克隆/更新项目 ---
if [ -d "$APP_DIR" ]; then
  echo "📥 更新项目..."
  cd "$APP_DIR" && git pull
else
  echo "📥 克隆项目..."
  sudo git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# --- 安装依赖 ---
echo "📦 安装依赖..."
npm install --omit=dev

# --- 创建数据目录 ---
sudo mkdir -p "$APP_DIR/data/uploads/tmp" "$APP_DIR/data/projects"

# --- 启动应用 ---
echo "🚀 启动 Chat-C..."
pm2 delete chat-c 2>/dev/null || true
pm2 start backend.js --name chat-c
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "✅ Chat-C 已启动在端口 $PORT"

# --- 防火墙 ---
echo "🔥 配置防火墙..."
if command -v ufw &>/dev/null; then
  sudo ufw allow $PORT/tcp 2>/dev/null || true
  sudo ufw allow 80/tcp 2>/dev/null || true
  sudo ufw allow 443/tcp 2>/dev/null || true
elif command -v firewall-cmd &>/dev/null; then
  sudo firewall-cmd --permanent --add-port=$PORT/tcp 2>/dev/null || true
  sudo firewall-cmd --permanent --add-service=http 2>/dev/null || true
  sudo firewall-cmd --permanent --add-service=https 2>/dev/null || true
  sudo firewall-cmd --reload 2>/dev/null || true
fi

# --- Nginx 反代 ---
if [ -n "$DOMAIN" ]; then
  echo "🌐 配置 Nginx + HTTPS for $DOMAIN..."
  cat > /tmp/chat-c-nginx <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 50m;
    }
}
EOF
  sudo mv /tmp/chat-c-nginx /etc/nginx/sites-available/chat-c 2>/dev/null || \
  sudo mv /tmp/chat-c-nginx /etc/nginx/conf.d/chat-c.conf 2>/dev/null
  sudo ln -sf /etc/nginx/sites-available/chat-c /etc/nginx/sites-enabled/ 2>/dev/null || true
  sudo nginx -t && sudo systemctl reload nginx

  # HTTPS
  echo "🔒 申请 SSL 证书..."
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" || \
  echo "⚠️ 自动 SSL 失败，请手动运行: sudo certbot --nginx -d $DOMAIN"
  
  echo "✅ HTTPS 配置完成！访问: https://$DOMAIN"
else
  echo "ℹ️ 没有配置域名，直接访问: http://你的服务器IP:$PORT"
fi

echo ""
echo "=========================================="
echo "🎉 部署完成！"
echo "=========================================="
echo "应用目录: $APP_DIR"
echo "端口: $PORT"
echo "PM2 管理: pm2 status / pm2 logs / pm2 restart chat-c"
if [ -n "$DOMAIN" ]; then
  echo "访问地址: https://$DOMAIN"
else
  echo "访问地址: http://你的服务器IP:$PORT"
fi
echo ""
echo "常用命令:"
echo "  查看日志: pm2 logs chat-c"
echo "  重启应用: pm2 restart chat-c"
echo "  停止应用: pm2 stop chat-c"
echo "  更新代码: cd $APP_DIR && git pull && npm install && pm2 restart chat-c"
