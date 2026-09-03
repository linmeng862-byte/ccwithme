#!/usr/bin/env bash
# ios-prep.sh —— 在 `npx cap sync ios && npx cap copy ios` 之后、xcodebuild 之前跑。
#
# 它只动 Capacitor 拷出去的那份网页（ios/App/App/public/），
# **不动 static/ 里的原件**，所以线上网站和仓库一个字都不变。
#
# 干两件事：
#   1. 把玩具直连页塞进 app 里 —— toy.html 是私人内容、在 .gitignore 里，
#      CI 检出的代码里没有它，不塞就等于 app 里没这一页。
#   2. 给 app 里那份 index.html 加一个进入口 —— 网页版没有任何地方链到 toy.html
#      （故意的，PUBLIC 仓库里不能有），所以入口只在 app 这份里注入：
#      **右上角 60×60 的范围内，2 秒里连点 5 下** → 进玩具页。
#
# 用法（在仓库根目录）：
#   bash scripts/ios-prep.sh                 # 从 static/toy.html 拿（这台/你 Mac 上有的话）
#   TOY_HTML=~/toy.html bash scripts/ios-prep.sh   # 从别处拿
#
# 没有 toy.html 就跳过第 1 步并**明确报出来**，不静默 —— 静默的话
# 编出来的包缺一页，装到手机上才发现，白编一次。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC="$ROOT/ios/App/App/public"
TOY_HTML="${TOY_HTML:-$ROOT/static/toy.html}"

if [ ! -d "$PUBLIC" ]; then
  echo "❌ 找不到 $PUBLIC —— 先跑 npx cap sync ios && npx cap copy ios" >&2
  exit 1
fi

# 1. 玩具页
if [ -f "$TOY_HTML" ]; then
  cp "$TOY_HTML" "$PUBLIC/toy.html"
  echo "✅ toy.html 已放进 app（来源：$TOY_HTML）"
else
  echo "⚠️  没找到 toy.html（找的是 $TOY_HTML）—— 这次编出来的 app 里没有玩具页。"
  echo "    它在 .gitignore 里，不进 PUBLIC 仓库；要么放回 static/，要么用 TOY_HTML=路径 指过来。"
fi

# 2. 入口（只注入到 app 那份 index.html）
INDEX="$PUBLIC/index.html"
if [ ! -f "$INDEX" ]; then
  echo "❌ $INDEX 不见了，cap copy 没跑成？" >&2
  exit 1
fi

if grep -q "__TOY_ENTRY__" "$INDEX"; then
  echo "   (skip) 入口已经在了"
else
  cat >> "$INDEX" <<'EOF'
<script>/* __TOY_ENTRY__ 只存在于 app 这份拷贝里，static/ 原件没有这段 */
(function(){var n=0,t=0;document.addEventListener('touchend',function(e){
var p=(e.changedTouches&&e.changedTouches[0])||e;
if(p.clientX<innerWidth-60||p.clientY>60){n=0;return;}
var now=Date.now();if(now-t>2000)n=0;t=now;
if(++n>=5){n=0;location.href='toy.html';}},true);})();
</script>
EOF
  echo "✅ 入口已注入（右上角 2 秒内连点 5 下）"
fi
