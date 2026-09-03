#!/usr/bin/env bash
# ios-prep.sh —— 在 `npx cap sync ios && npx cap copy ios` 之后、xcodebuild 之前跑。
#
# 它只动 Capacitor 拷出去的那份网页（ios/App/App/public/），
# **不动 static/ 里的原件**，所以线上网站和仓库一个字都不变。
#
# 干三件事：
#   1. 把玩具直连页塞进 app 里 —— toy.html 是私人内容、在 .gitignore 里，
#      CI 检出的代码里没有它，不塞就等于 app 里没这一页。
#   2. 给 app 里那份 index.html 加一个进入口 —— 网页版没有任何地方链到 toy.html
#      （故意的，PUBLIC 仓库里不能有），所以入口只在 app 这份里注入：
#      **右上角 60×60 的范围内，2 秒里连点 5 下** → 进玩具页。
#   3. 跑那几个建扩展 target 的 ruby 脚本（灵动岛 / 共享屏幕 / 屏幕时间）。
#      ⚠️ 这几个 target **工程文件里本来没有**，是脚本现建的 ——
#      CI 里一直只跑了 widget 一个，Mac 上直接点 Xcode 编译则一个都不跑。
#      「装上了但灵动岛没反应」最像是这里。
#
# 用法（在仓库根目录）：
#   bash scripts/ios-prep.sh                 # 从 static/toy.html 拿（这台/你 Mac 上有的话）
#   TOY_HTML=~/toy.html bash scripts/ios-prep.sh   # 从别处拿
#   SKIP_EXT="ScreenTimeMonitor" bash scripts/ios-prep.sh   # 跳过某个扩展（空格分隔）
#
# 没有 toy.html 就跳过第 1 步并**明确报出来**，不静默 —— 静默的话
# 编出来的包缺一页，装到手机上才发现，白编一次。
#
# 需要：gem install xcodeproj

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

# 3. 扩展 target
# ⚠️ 顺序不能换：建 target 的脚本会重写工程文件，add_app_plugins.rb
#    必须**最后**跑，不然它加进 App target 的那些插件源文件会被冲掉。
#    （add_app_plugins.rb 自己的注释里也写了这条。）
SKIP_EXT="${SKIP_EXT:-}"
run_ext() {
  local rb="$1" name="$2"
  for s in $SKIP_EXT; do
    if [ "$s" = "$name" ]; then echo "   (skip) $name —— SKIP_EXT 里点名跳过"; return 0; fi
  done
  if [ ! -f "$ROOT/ios/App/$rb" ]; then
    echo "⚠️  $rb 不在，跳过 $name"; return 0
  fi
  ruby "$ROOT/ios/App/$rb"
}

if ! command -v ruby >/dev/null 2>&1; then
  echo "❌ 没有 ruby —— 扩展 target 建不了。Mac 上：gem install xcodeproj" >&2
  exit 1
fi

run_ext add_widget_extension.rb   LiveActivityWidget   # 灵动岛
run_ext add_broadcast_extension.rb BroadcastUpload     # 共享屏幕
run_ext add_screen_time_monitor.rb ScreenTimeMonitor   # 屏幕时间
ruby "$ROOT/ios/App/add_app_plugins.rb"                # ← 必须最后

echo "✅ 扩展 target 都建好了，可以 xcodebuild / 在 Xcode 里编了"
