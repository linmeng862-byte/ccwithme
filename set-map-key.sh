#!/usr/bin/env bash
# 把地图密钥写进 .env 并当场自检。不回显内容、不进日志。
#   ./set-map-key.sh --google 'AIza...'      → GOOGLE_MAPS_KEY
#   ./set-map-key.sh --mapillary 'MLY|..|..' → MAPILLARY_TOKEN
set -euo pipefail
ENV=/opt/ccwithme/.env
WHICH="${1:-}"; T="${2:-}"
case "$WHICH" in
  --google)    VAR=GOOGLE_MAPS_KEY ;;
  --mapillary) VAR=MAPILLARY_TOKEN ;;
  *) echo "用法: $0 --google 'AIza…'  |  $0 --mapillary 'MLY|…'"; exit 1 ;;
esac
[ -z "$T" ] && { echo "没给密钥。"; exit 1; }
if [ "$VAR" = GOOGLE_MAPS_KEY ]; then
  case "$T" in AIza*) ;; *) echo "看着不像 Google 的 API key（一般 AIza 开头）。没写。"; exit 1;; esac
fi
cp "$ENV" "$ENV.bak.$(date +%m%d-%H%M%S)"
python3 - "$ENV" "$VAR" "$T" <<'PY'
import io,sys
p,var,t=sys.argv[1],sys.argv[2],sys.argv[3]
ls=io.open(p,encoding='utf-8').read().splitlines(True)
hit=False
for i,l in enumerate(ls):
    if l.startswith(var+'='): ls[i]=var+'='+t+'\n'; hit=True
if not hit: ls.append('\n'+var+'='+t+'\n')
io.open(p,'w',encoding='utf-8').write(''.join(ls))
PY
echo "写好了：$VAR，长度 ${#T}，开头 ${T:0:4}…（内容不显示）"

# ── 自检 ───────────────────────────────────────────────
if [ "$VAR" = GOOGLE_MAPS_KEY ]; then
  echo "自检中（拿东京涩谷试一张街景）…"
  # 带上 Referer —— key 若锁了 HTTP referrer，不带这个头一定会被拒，那是正常的
  R=$(curl -s --max-time 15 -H 'Referer: https://zhou-and-claude.online/' \
    "https://maps.googleapis.com/maps/api/streetview/metadata?location=35.6595,139.7005&key=$T")
  S=$(printf '%s' "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('status',''));print(d.get('error_message',''))" 2>/dev/null || echo "PARSE_FAIL")
  ST=$(printf '%s\n' "$S" | head -1); MSG=$(printf '%s\n' "$S" | sed -n 2p)
  case "$ST" in
    OK) echo "✅ key 能用，街景也查到了。" ;;
    ZERO_RESULTS) echo "✅ key 能用（那个点恰好没街景，不影响）。" ;;
    REQUEST_DENIED) echo "❌ 被拒了：$MSG"; echo "   常见原因：没开 Street View Static API / 没绑 billing / key 的 API 限制没勾对。" ;;
    OVER_QUERY_LIMIT) echo "❌ 配额或账单有问题：$MSG" ;;
    *) echo "❌ 没看懂的返回：$ST $MSG" ;;
  esac
fi
