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

# ⚠️ macOS 自带的是 bash 3.2（2007 年那个）。`$VAR` 后面紧跟中文标点时，
#    它会把那几个字节当成变量名的一部分，配上 set -u 就报 unbound variable。
#    所以这份里凡是后面接中文的变量，一律写 ${VAR}。在 Linux 的 bash 5 上试不出来。
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
  echo "✅ toy.html 已放进 app（来源：${TOY_HTML}）"
else
  echo "⚠️  没找到 toy.html（找的是 ${TOY_HTML}）—— 这次编出来的 app 里没有玩具页。"
  echo "    它在 .gitignore 里，不进 PUBLIC 仓库；要么放回 static/，要么用 TOY_HTML=路径 指过来。"
fi

# 2. 入口（只注入到 app 那份 index.html）
INDEX="$PUBLIC/index.html"
if [ ! -f "$INDEX" ]; then
  echo "❌ $INDEX 不见了，cap copy 没跑成？" >&2
  exit 1
fi

# 进入口现在**直接写在 static/index.html 里**了（⋯ 菜单里那项 Bluetooth，
# 跟另一台一致），不再靠注入。这里只剩一句体检：拷过去那份里有没有它。
# 注入那套（第一版「右上角连点 5 下」、第二版动态塞菜单项）都废弃了 ——
# 看不见的入口等于没有入口，而能写进仓库的东西就不该靠构建脚本现加。
if grep -q 'id="moreToy"' "$INDEX"; then
  echo "✅ ⋯ 菜单里的 Bluetooth 入口在"
else
  echo "⚠️  app 那份 index.html 里没有 Bluetooth 入口 —— static/index.html 是旧的？"
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

# 屏幕时间：**默认不建**。免费账号签不下来 —— 2026-08-30 Xcode 原话：
#   Personal development teams do not support the Family Controls (Development) capability.
# 这是三个扩展里唯一撞 $99 墙的那个，所以它是 opt-in，不是 opt-out。
# 哪天买了开发者账号，跑 SCREEN_TIME=1 bash scripts/ios-prep.sh 就把它接回来。
if [ "${SCREEN_TIME:-0}" = "1" ]; then
  run_ext add_screen_time_monitor.rb ScreenTimeMonitor
else
  echo "   (skip) ScreenTimeMonitor —— 免费账号签不下来，默认不建（要的话 SCREEN_TIME=1）"
fi

ruby "$ROOT/ios/App/add_app_plugins.rb"                # ← 必须最后

echo "✅ 扩展 target 建好了，可以 xcodebuild / 在 Xcode 里编了"
