#!/usr/bin/env bash
# build-fun.sh —— 在她 Mac 上编 fun 变体（.fun 那台的 app），一条命令走完。
#
# 为什么要有这个（2026-09-14）：以前是五六条命令，每条都有前提，错一条不报警 ——
#   .app-variant 被收成 .app-variant.fun 忘了放回；那份文件里没有 api= 行，
#   set-server-url.sh 报错失败，server.url 停在上次编的那台；
#   而 ios-prep.sh 的体检读的是 index.html 里的域名，照样显示 .fun。
#   她看了体检才编的，装上连到另一台。这个脚本把这些全收进来，最后**读包里真正的地址**核对。
#
# 用法（仓库根目录，git pull 之后）：
#   bash scripts/build-fun.sh
#
# ⚠️ 只管 fun 这一个变体。主 app（另一台的）照旧走它自己那套，这个脚本一行都不碰：
#    - 不改 ios-prep.sh / set-server-url.sh 的任何行为，只是按顺序调用它们；
#    - 域名不写在这里（公开仓库），第一次问她一次，存进 gitignore 的 .app-variant；
#    - **退出时一定把 .app-variant 收回成 .app-variant.fun**（成功失败都收），
#      不然下次在同一台 Mac 上编主 app，会被 ios-prep.sh 当成 fun 编。
#
# ⚠️ macOS 自带 bash 3.2：变量后面接中文一律写 ${VAR}（见 ios-prep.sh 文件头）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VF="$ROOT/.app-variant"
VF_PARKED="$ROOT/.app-variant.fun"
VARIANT="fun"
BID="com.zzclaude.eclat.${VARIANT}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# ── 1. 把变体文件放回原位 ──
if [ -f "$VF" ] && [ -f "$VF_PARKED" ]; then
  red "❌ .app-variant 和 .app-variant.fun 同时存在，不知道哪份是对的 —— 先看一眼再删掉一份"
  exit 1
fi
UNPARKED=0     # 是不是这个脚本把 .app-variant.fun 挪回来的
if [ -f "$VF_PARKED" ]; then
  mv "$VF_PARKED" "$VF"
  UNPARKED=1
elif [ ! -f "$VF" ]; then
  echo "${VARIANT}" > "$VF"
  echo "🔖 没有变体文件，新建了一份（变体名 ${VARIANT}）"
fi

# 文件里的变体名必须是 fun —— 不是的话这份文件是别人的，不动
# ⚠️ 这一段在挂 trap **之前**：核对不过就原样退出，别让「退出时收回」把人家的文件改了名
#    （第一版就是先挂 trap，测出来会把别人的 .app-variant 挪成 .app-variant.fun）。
NAME=""
HOST=""
while IFS= read -r _line || [ -n "${_line}" ]; do
  _line="$(printf '%s' "${_line}" | tr -d ' \t\r')"
  case "${_line}" in
    ''|\#*) ;;
    api=*)  HOST="${_line#api=}" ;;
    *)      [ -z "${NAME}" ] && NAME="${_line}" ;;
  esac
done < "$VF"
if [ "${NAME}" != "${VARIANT}" ]; then
  [ "${UNPARKED}" = "1" ] && mv "$VF" "$VF_PARKED"   # 挪过的挪回去，原本就在的不碰
  red "❌ .app-variant 里的变体名是「${NAME}」，不是 ${VARIANT} —— 这个脚本只编 ${VARIANT}，没动任何东西"
  exit 1
fi
# 核对过了，是 fun 的文件。从这里起，不管成功失败都收回成 .app-variant.fun
trap 'if [ -f "$VF" ]; then mv "$VF" "$VF_PARKED"; echo "🔖 .app-variant 已收回成 .app-variant.fun"; fi' EXIT

# ── 2. 域名：文件里没有就问一次，存进去（这份文件不进 git） ──
HOST="${HOST#https://}"
if [ -z "${HOST}" ]; then
  printf '这台（%s）的域名，只问这一次，比如 example.com：' "${VARIANT}"
  read -r HOST
  HOST="$(printf '%s' "${HOST}" | tr -d ' \t\r')"
  HOST="${HOST#https://}"
  HOST="${HOST%/}"
  case "${HOST}" in
    *.*) ;;
    *) red "❌ 「${HOST}」不像域名，没存"; exit 1 ;;
  esac
  echo "api=${HOST}" >> "$VF"
  echo "🔖 存进 .app-variant 了，下次不问"
fi
WANT_URL="https://${HOST}"
echo "🎯 要编的：${BID} → ${WANT_URL}"

# ── 3. 依次跑。任何一步失败 set -e 就停，不会带着错的配置往下走 ──
APP_API_HOST="${HOST}" bash "$ROOT/scripts/set-server-url.sh"
npx cap sync ios
bash "$ROOT/scripts/ios-prep.sh"

# ── 4. 核对**打进包里的**东西，不看任何中间文件 ──
#    app 连哪台只看 server.url；cap sync 拷进 ios/App/App/ 的那份才是真正打进包的。
CFG="$ROOT/ios/App/App/capacitor.config.json"
GOT_URL="$(grep -oE '"url"[[:space:]]*:[[:space:]]*"[^"]+"' "$CFG" 2>/dev/null | head -1 | sed -E 's/.*"(https?:[^"]+)"$/\1/')"
GOT_BID_N="$(grep -c "PRODUCT_BUNDLE_IDENTIFIER = ${BID};" "$ROOT/ios/App/App.xcodeproj/project.pbxproj" 2>/dev/null || true)"

echo ""
echo "———— 核对 ————"
ok=1
if [ "${GOT_URL}" = "${WANT_URL}" ]; then
  green "   ✅ 后端：${GOT_URL}"
else
  red   "   ❌ 后端：${GOT_URL:-（没有 server.url）}，应该是 ${WANT_URL}"
  ok=0
fi
if [ "${GOT_BID_N:-0}" -gt 0 ]; then
  green "   ✅ bundle：${BID}"
else
  red   "   ❌ 工程里没有 ${BID} —— 变体没生效"
  ok=0
fi

if [ "${ok}" != "1" ]; then
  red "别编。把上面这几行拍给他。"
  exit 1
fi

green "都对。打开 Xcode：三个 target（App / LiveActivityWidget / BroadcastUpload）都选 Team，再 Cmd+R。"
open "$ROOT/ios/App/App.xcworkspace" 2>/dev/null || echo "（没能自动打开，手动开 ios/App/App.xcworkspace）"
