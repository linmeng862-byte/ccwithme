#!/bin/bash
# 一次性：等一个空窗（没人正在说话、都闲下来了）再重启 ccwithme 后端，
# 把这次合并进来的 backend.js 改动生效，别在有人聊到一半时掐掉 SSE 流。
# 常驻 CLI 挂在 cc-gateway 那侧、不在 ccwithme 里，所以重启 ccwithme 不杀 CLI、不赔冷写。
for i in $(seq 1 240); do
  ST=$(curl -s --max-time 5 http://127.0.0.1:9876/persist/status || echo '')
  GO=$(printf '%s' "$ST" | python3 -c '
import sys,json
try: d=json.load(sys.stdin)
except Exception: print("no"); raise SystemExit
procs=d.get("procs") or []
# 空窗 = 没有任何常驻进程正在说话，且每个都至少闲了 90 秒（不卡在两轮之间）。
talking=any(p.get("正在说话") for p in procs)
min_idle=min([p.get("闲了秒",0) for p in procs], default=999999)
print("yes" if (not talking and min_idle>=90) else "no")
' 2>/dev/null)
  if [ "$GO" = "yes" ]; then
    pm2 restart ccwithme >/dev/null 2>&1
    echo "$(date '+%m-%d %H:%M') ccwithme 已重启（空窗：没人在说话、都闲下来了）" >> /var/log/keepalive.log
    exit 0
  fi
  sleep 60
done
echo "$(date '+%m-%d %H:%M') 等了 4 小时没等到空窗，ccwithme 没重启" >> /var/log/keepalive.log
