#!/usr/bin/env bash
# ios-prep.sh —— 在 `npx cap sync ios && npx cap copy ios` 之后、xcodebuild 之前跑。
#
# 它只动 Capacitor 拷出去的那份网页（ios/App/App/public/），
# **不动 static/ 里的原件**，所以线上网站和仓库一个字都不变。
#
# 干三件事：
#   1. 把玩具直连页塞进 app 里 —— toy.html 是私人内容、在 .gitignore 里，
#      CI 检出的代码里没有它，不塞就等于 app 里没这一页。
#   2. 检查进入口还在 —— 入口是 **⋯ 菜单里那项 Bluetooth**，
#      现在直接写在 static/index.html 里，这个脚本只验、不注入。
#      （文件头这里原来写着「右上角连点 5 下」，那是废弃的第一版 ——
#       09-03 照着它念，把她指到一个不存在的入口上。改注释别只改代码。）
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
#   两台机器各编一个 app、装同一部手机上互不干扰：
#   APP_VARIANT=fun bash scripts/ios-prep.sh
#   后端域名**不写在这个仓库里**（公开仓库，别把自己的机器暴露出去）。
#   放在 gitignore 的 .app-variant 里，一行一个：
#       fun
#       api=你自己的域名
#   或者临时用环境变量：APP_API_HOST=你的域名 APP_VARIANT=fun bash scripts/ios-prep.sh
#   不设 APP_VARIANT 就跟以前一模一样，另一台的行为一个字不变。
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

# 2.5 变体：两台各编一个 app，装同一部手机上互不干扰
#
# 不设 APP_VARIANT 时整段跳过 —— 仓库默认值属于另一台，别动它。
#
# ⚠️ **App Group 必须跟着分开**。这是「互相干扰」最可能出现的地方：
#    两个 app 共用一份 UserDefaults 的话，灵动岛 / 录屏 / 屏幕时间那几个扩展
#    读到的是对方写的数 —— 装上去能跑，显示的却是另一台的东西，最难查那种。
#    所以下面是把 com.zzclaude.eclat 整个前缀替换掉，group.* 会自动跟着变。
#
# ⚠️ 域名只改 **public/ 那份拷贝**，不碰 static/ 原件（跟这个脚本其它步骤一个规矩）。
#    仓库里的 index.html 是线上网站那份，改了会推给另一台。
# 变体名的来源，按优先级：
#   1. 命令行 APP_VARIANT=xxx
#   2. 仓库根的 .app-variant 文件（**gitignore，每台一份**，跟 CLAUDE.local.md 同一个套路）
#
# 为什么要第 2 条：忘了加 APP_VARIANT 就编，编出来的 app 会打到**另一台**的后端 ——
# 界面全在、聊天记录一条没有，是最难往这儿想的那种错。
# 在自己机器上 `echo fun > .app-variant` 一次，以后就忘不了了。
#
# ⚠️ 不能做成「不设就报错」：另一台和 CI 都是不设的，那样等于把他们的构建打断。
APP_VARIANT="${APP_VARIANT:-}"
if [ -f "$ROOT/.app-variant" ]; then
  # 第一行是变体名；`api=xxx` 那行是后端域名（可以没有）。
  # ⚠️ 域名故意不写进仓库 —— 这是 PUBLIC 仓库，写进去等于公布自己那台机器在哪。
  while IFS= read -r _line || [ -n "${_line}" ]; do
    _line="$(printf '%s' "${_line}" | tr -d ' \t\r')"
    case "${_line}" in
      ''|'#'*) : ;;
      api=*)   [ -z "${APP_API_HOST:-}" ] && APP_API_HOST="${_line#api=}" ;;
      *)       [ -z "${APP_VARIANT}" ] && APP_VARIANT="${_line}" ;;
    esac
  done < "$ROOT/.app-variant"
  [ -n "${APP_VARIANT}" ] && echo "🔖 变体名取自 .app-variant：${APP_VARIANT}"
fi
if [ -n "${APP_VARIANT}" ]; then
  BID_OLD="com.zzclaude.eclat"
  BID_NEW="${BID_OLD}.${APP_VARIANT}"
  APP_NAME="${APP_NAME:-éclat ${APP_VARIANT}}"
  # ⚠️ **没有默认域名**。不给就不改地址 —— 与其猜一个塞进去，
  #    不如让它保持仓库原样、在下面那句体检里显出来，你一眼能看见不对。
  APP_API_HOST="${APP_API_HOST:-}"
  export APP_BUNDLE_ID="$BID_NEW"      # 三个 add_*.rb 从这里读

  echo "🔀 变体 ${APP_VARIANT}"
  echo "   bundle id : ${BID_NEW}"
  echo "   App Group : group.${BID_NEW}"
  echo "   显示名    : ${APP_NAME}"
  if [ -n "${APP_API_HOST}" ]; then
    echo "   后端      : ${APP_API_HOST}"
  else
    echo "   后端      : (没给 —— 地址不动，见结尾体检那行)"
  fi

  # 幂等：已经带后缀的文件不再替换，重复跑不会变成 …eclat.fun.fun
  sub_bid() {
    local f="$1"
    [ -f "$f" ] || return 0
    grep -q "$BID_NEW" "$f" && return 0
    grep -q "$BID_OLD" "$f" || return 0
    perl -pi -e "s/\Qcom.zzclaude.eclat\E/${BID_NEW}/g" "$f"
    echo "   ✎ ${f#${ROOT}/}"
  }
  sub_bid "$ROOT/ios/App/App.xcodeproj/project.pbxproj"
  sub_bid "$ROOT/ios/App/App/capacitor.config.json"
  sub_bid "$ROOT/ios/App/App/App.entitlements"
  sub_bid "$ROOT/ios/App/App/AppGroupDataStore.swift"
  sub_bid "$ROOT/ios/App/App/ScreenTimeManager.swift"
  sub_bid "$ROOT/ios/App/BroadcastUpload/BroadcastUpload.entitlements"
  sub_bid "$ROOT/ios/App/BroadcastUpload/SampleHandler.swift"
  sub_bid "$ROOT/ios/App/ScreenTimeMonitor/ScreenTimeMonitor.entitlements"
  sub_bid "$ROOT/ios/App/ScreenTimeMonitor/ScreenTimeMonitorExtension.swift"

  # 显示名（图标下面那行字，要在手机上一眼分得出是哪个）
  perl -0pi -e "s{(<key>CFBundleDisplayName</key>\s*\n\s*<string>)[^<]*}{\${1}${APP_NAME}}" \
    "$ROOT/ios/App/App/Info.plist"

  # 后端域名：只改 public/ 里的拷贝，而且只在给了域名时才动。
  if [ -n "${APP_API_HOST}" ]; then
    for f in "$PUBLIC/index.html" "$PUBLIC/toy.html"; do
      [ -f "$f" ] || continue
      perl -pi -e "s/\Qzhou-and-claude.online\E/${APP_API_HOST}/g" "$f"
    done
  fi
  # app 图标：变体可以换掉，仓库那张是另一台的。
  #
  # 放 static/app-icon-<变体>.png（**gitignore**，每台自己一份）。
  # ⚠️ iOS 的硬要求：**1024x1024、RGB、不能有 alpha 通道**。
  #    带 alpha 的话 Xcode 归档时才报错，编译阶段一声不吭 —— 白编一次。
  #    这里先验一遍，不合格就明说并跳过，不悄悄塞一张会挂的进去。
  ICON_SRC="$ROOT/static/app-icon-${APP_VARIANT}.png"
  ICON_DST="$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
  if [ -f "${ICON_SRC}" ]; then
    _icon_ok="$(node -e '
      const fs=require("fs");
      try{
        const b=fs.readFileSync(process.argv[1]);
        if(b.readUInt32BE(16)!==1024||b.readUInt32BE(20)!==1024){console.log("尺寸不是 1024x1024");process.exit(0)}
        const ct=b[25];
        if(ct!==2&&ct!==0){console.log("有 alpha 通道（颜色类型 "+ct+"），iOS 不收");process.exit(0)}
        if(b.includes(Buffer.from("tRNS"))){console.log("有 tRNS 透明块，iOS 不收");process.exit(0)}
        console.log("OK");
      }catch(e){console.log("读不出来："+e.message)}
    ' "${ICON_SRC}" 2>/dev/null || echo "node 跑不了，跳过检查")"
    if [ "${_icon_ok}" = "OK" ]; then
      cp "${ICON_SRC}" "${ICON_DST}"
      echo "   ✎ app 图标换成变体版：$(basename "${ICON_SRC}")"
    else
      echo "   ⚠️ 图标没换 —— ${_icon_ok}"
      echo "      （$(basename "${ICON_SRC}")，要 1024x1024 / RGB / 无 alpha）"
    fi
  else
    echo "   (skip) app 图标 —— 没有 static/app-icon-${APP_VARIANT}.png"
  fi

  # 小组件 / 灵动岛的长相：变体可以整份换掉，不改仓库里那份。
  #
  # 规矩：仓库里的 LiveActivityWidget/*.swift 是**另一台的**，别动。
  # 想让我们这个 app 的小组件长得不一样，就在
  #   ios/App/LiveActivityWidget/variants/<文件名>.${APP_VARIANT}.swift
  # 放一份，这里会拷成 <文件名>.swift 顶掉。
  # 这样两边各改各的，git pull 不会冲突（改的根本不是同一个文件）。
  #
  # ⚠️ 拷过去的文件名必须跟原件一样 —— add_widget_extension.rb 的 EXT_SOURCES
  #    是按文件名点名的，改了名字就进不了 target（编译时报 Cannot find in scope）。
  VAR_DIR="$ROOT/ios/App/LiveActivityWidget/variants"
  if [ -d "$VAR_DIR" ]; then
    found_any=0
    for f in "$VAR_DIR"/*.${APP_VARIANT}.swift; do
      [ -e "$f" ] || continue
      base="$(basename "$f")"
      dest="$ROOT/ios/App/LiveActivityWidget/${base%.${APP_VARIANT}.swift}.swift"
      cp "$f" "$dest"
      echo "   ✎ 小组件换成变体版：$(basename "${dest}")"
      found_any=1
    done
    [ "$found_any" = "1" ] || echo "   (skip) 小组件变体 —— variants/ 里没有 *.${APP_VARIANT}.swift"
  fi

  echo "   ✅ 变体改完了"
else
  echo "   (skip) 变体 —— 没设 APP_VARIANT，用仓库默认的 com.zzclaude.eclat"

  # 2.6 还原：把上一次编变体留下的痕迹擦掉（2026-09-05 她定的）
  #
  # 为什么要这段：上面那套替换是**单向**的 —— 设了变体就往几个**进 git 的**文件里
  # 写痕迹，不设变体时只跳过、不还原。于是「编完 fun 再编主 app」编出来的还是 fun：
  #   09-04 bundle id 咬了三次（一次只露一处）；09-05 又咬到小组件 ——
  #   她桌面上那个变成了 fun 版（「天」「一直在一起呀」），而主 app 的小组件
  #   跟着 app 一起没了（bundle id 变了 = 另一个 app）。
  #
  # ⚠️ 只在**没设 APP_VARIANT** 时跑。另一台靠 .app-variant 一直设着，
  #    永远进不到这个分支，行为一个字不变 —— 这段影响的只有「编主 app」和 CI。
  #
  # ⚠️ 只还原**认得出是变体痕迹**的改动，看不懂的一律只警告不动手 ——
  #    哪天谁真在 PresenceWidget.swift 里写了东西，不能被这段一把冲掉。
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    _restored=0
    _kept=0

    # 内容跟某个 variants/<同名>.*.swift 逐字节相同 = 是被 cp 覆盖出来的，不是人写的
    _is_variant_copy() {
      local dest="$1" v
      for v in "$ROOT/ios/App/LiveActivityWidget/variants/$(basename "${dest%.swift}")."*.swift; do
        [ -e "$v" ] || continue
        cmp -s "$dest" "$v" && return 0
      done
      return 1
    }
    # 图标：跟本机某张 static/app-icon-<变体>.png 逐字节相同 = 是变体图标
    _is_variant_icon() {
      local dest="$1" v
      for v in "$ROOT/static/app-icon-"*.png; do
        [ -e "$v" ] || continue
        cmp -s "$dest" "$v" && return 0
      done
      return 1
    }

    _restore() {
      local rel="$1" why="$2"
      local abs="$ROOT/$rel"
      [ -e "$abs" ] || return 0
      git -C "$ROOT" diff --quiet -- "$rel" && return 0     # 没动过
      case "$why" in
        # 加进去的行里带 com.zzclaude.eclat.<变体> = bundle id 被换过
        bid)    git -C "$ROOT" diff -U0 -- "$rel" | grep -q '^+.*com\.zzclaude\.eclat\.' \
                  || { _kept=1; echo "   ⚠️ ${rel} 有改动但不像变体痕迹 —— 没动它，自己看一眼"; return 0; } ;;
        # 显示名被改成「éclat xxx」
        name)   git -C "$ROOT" diff -U0 -- "$rel" | grep -q '^+.*<string>éclat .' \
                  || { _kept=1; echo "   ⚠️ ${rel} 有改动但不像变体痕迹 —— 没动它，自己看一眼"; return 0; } ;;
        widget) _is_variant_copy "$abs" \
                  || { _kept=1; echo "   ⚠️ ${rel} 有改动但不是变体那份的副本 —— 没动它，自己看一眼"; return 0; } ;;
        icon)   _is_variant_icon "$abs" \
                  || { _kept=1; echo "   ⚠️ ${rel} 有改动但不是变体图标 —— 没动它，自己看一眼"; return 0; } ;;
      esac
      git -C "$ROOT" checkout -- "$rel"
      echo "   ↩︎ 还原 ${rel}"
      _restored=1
    }

    _restore "ios/App/App.xcodeproj/project.pbxproj"                bid
    _restore "ios/App/App/capacitor.config.json"                    bid
    _restore "ios/App/App/App.entitlements"                         bid
    _restore "ios/App/App/AppGroupDataStore.swift"                  bid
    _restore "ios/App/App/ScreenTimeManager.swift"                  bid
    _restore "ios/App/BroadcastUpload/BroadcastUpload.entitlements" bid
    _restore "ios/App/BroadcastUpload/SampleHandler.swift"          bid
    _restore "ios/App/ScreenTimeMonitor/ScreenTimeMonitor.entitlements"   bid
    _restore "ios/App/ScreenTimeMonitor/ScreenTimeMonitorExtension.swift" bid
    _restore "ios/App/App/Info.plist"                               name
    _restore "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png" icon
    # 小组件：variants/ 里有几份就还原几份（现在只有 PresenceWidget）
    for _vf in "$ROOT/ios/App/LiveActivityWidget/variants/"*.swift; do
      [ -e "$_vf" ] || continue
      _b="$(basename "$_vf")"                 # PresenceWidget.fun.swift
      _b="${_b%.swift}"; _b="${_b%.*}.swift"  # → PresenceWidget.swift
      _restore "ios/App/LiveActivityWidget/${_b}" widget
    done

    if [ "$_restored" = "1" ]; then
      echo "   ✅ 变体痕迹已还原 —— 这次编出来的是主 app（com.zzclaude.eclat）"
    elif [ "$_kept" = "0" ]; then
      echo "   ✅ 没有变体痕迹，工作区本来就是干净的"
    fi
  else
    echo "   (skip) 还原 —— 这儿不是 git 仓库，认不出什么是变体痕迹"
  fi
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

# 最后报一句这个包会打到**哪台后端** —— 前面所有替换的净结果就是这一行。
# 打错服务器是「界面全在、数据全不对」，装到手机上才发现，白编一次。
echo ""
echo "———— 这个包编出来会连哪儿 ————"
HOSTS="$(grep -oE 'zhou-and-claude\.[a-z]+' "$PUBLIC/index.html" 2>/dev/null | sort -u | tr '\n' ' ')"
if [ -z "${HOSTS}" ]; then
  echo "   后端：同源（没有绝对地址 —— capacitor.config.json 里设了 server.url 才对）"
else
  echo "   后端：${HOSTS}"
fi
echo "   bundle：$(grep -oE 'com\.zzclaude\.eclat[.a-z]*' "$ROOT/ios/App/App/capacitor.config.json" 2>/dev/null | head -1)"
echo "   ⚠️ 上面这两行不是你要的，就是变体没生效 —— 别编，先查。"
echo ""

echo "✅ 扩展 target 建好了，可以 xcodebuild / 在 Xcode 里编了"
