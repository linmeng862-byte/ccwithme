#!/usr/bin/env bash
# 把 Mapillary token 写进 .env，不用编辑器（她的 ! shell 没有 TTY，nano 跑不了）。
# 用法：./set-mapillary-token.sh 'MLY|xxx|yyy'
# ⚠️ token 只从命令行参数进来，不回显、不进日志、不进对话。
set -euo pipefail
ENV=/opt/ccwithme/.env
T="${1:-}"
if [ -z "$T" ]; then echo "用法: $0 'MLY|数字|十六进制'"; exit 1; fi
case "$T" in MLY\|*) ;; *) echo "看着不像 Mapillary 的 client token（应该是 MLY| 开头）。没写。"; exit 1;; esac
cp "$ENV" "$ENV.bak.$(date +%m%d-%H%M%S)"
if grep -q '^MAPILLARY_TOKEN=' "$ENV"; then
  python3 - "$ENV" "$T" <<'PY'
import io,sys
p,t=sys.argv[1],sys.argv[2]
ls=io.open(p,encoding='utf-8').read().splitlines(True)
out=[('MAPILLARY_TOKEN='+t+'\n') if l.startswith('MAPILLARY_TOKEN=') else l for l in ls]
io.open(p,'w',encoding='utf-8').write(''.join(out))
PY
else
  printf '\nMAPILLARY_TOKEN=%s\n' "$T" >> "$ENV"
fi
echo "写好了。长度 ${#T}，开头 ${T:0:4}…（内容不显示）"
