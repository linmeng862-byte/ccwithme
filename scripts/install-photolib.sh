#!/bin/bash
# 在 Mac 上跑这个。装两样东西：
#   1. PhotoLib 原生插件 —— 附件面板右边那条「最近照片」的供货方
#   2. @capacitor/browser —— 他发的网址在 app 内打开（代码早就写好了，只差这个插件）
# 幂等：重复跑没事，已经加过的不会加第二遍。
# 照着 static/b.sh（装蓝牙插件那个）的路子写的。
set -e

APP=~/ccwithme
IOS=$APP/ios/App
cd "$APP"

echo "== 0/5 检查家伙事儿"
command -v ruby >/dev/null || { echo "没有 ruby"; exit 1; }
ruby -e "require 'xcodeproj'" 2>/dev/null || {
  echo "缺 xcodeproj，先跑这条再回来："
  echo "    sudo gem install xcodeproj"
  exit 1
}
for f in PhotoLibraryPlugin.swift PhotoLibraryPlugin.m; do
  [ -f "$IOS/App/$f" ] || { echo "少了 $f —— git pull 了吗？"; exit 1; }
done
grep -q NSPhotoLibraryUsageDescription "$IOS/App/Info.plist" || {
  echo "Info.plist 里没有相册权限"; exit 1; }
echo "   都在"

echo "== 1/5 备份 project.pbxproj"
cp "$IOS/App.xcodeproj/project.pbxproj" \
   "$IOS/App.xcodeproj/project.pbxproj.bak.$(date +%Y%m%d-%H%M%S)"
echo "   备份好了"

echo "== 2/5 装 @capacitor/browser"
if [ -d node_modules/@capacitor/browser ]; then
  echo "   本来就有"
else
  npm i @capacitor/browser
fi

echo "== 3/5 确认 capacitor.config.json 指向 .fun（远程加载）"
# ⚠️ 这个文件是 skip-worktree 的（每台机器各一份，不进 git），所以 pull 不下来，
#    必须在这儿就地补。没有 server.url = 本地打包，前端每改一次都得重装一遍 app。
node -e "
const fs=require('fs'),p='capacitor.config.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
c.server=Object.assign({},c.server,{url:'https://chat.zhou-and-claude.fun',cleartext:false});
fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
console.log('   server.url =',c.server.url);
"
git update-index --skip-worktree capacitor.config.json 2>/dev/null || true

echo "== 3.5/5 npx cap sync ios"
npx cap sync ios

echo "== 4/5 把插件注册进工程"
ruby <<'RUBY'
require 'xcodeproj'
require 'json'

APP = File.expand_path('~/ccwithme')
proj = Xcodeproj::Project.open("#{APP}/ios/App/App.xcodeproj")
app  = proj.targets.find { |t| t.name == 'App' } or abort '找不到 App target'
grp  = proj.main_group.find_subpath('App', true)

added = []
%w[PhotoLibraryPlugin.swift PhotoLibraryPlugin.m].each do |f|
  next if app.source_build_phase.files.any? { |x| x.file_ref&.path == f }
  ref = grp.files.find { |x| x.path == f } || grp.new_file(f)
  app.source_build_phase.add_file_reference(ref)
  added << f
end
proj.save
puts added.empty? ? '   编译源：本来就有，没动' : "   编译源：加了 #{added.join(', ')}"

# cap sync 会把 config 拷进来，所以这一步必须在 sync 之后。
# ⚠️ 官方插件（Browser/Keyboard/LocalNotifications）cap sync 会自己写进去，
#    自定义的这个必须手动加 —— 漏了的话 Capacitor 照样返回一个插件代理，
#    调下去 Promise 永远不 resolve，那条缩略图带子就永远是空的，还不报错。
cfg_path = "#{APP}/ios/App/App/capacitor.config.json"
cfg = JSON.parse(File.read(cfg_path))
list = (cfg['packageClassList'] ||= [])
if list.include?('PhotoLibraryPlugin')
  puts '   packageClassList：本来就有'
else
  list << 'PhotoLibraryPlugin'
  File.write(cfg_path, JSON.pretty_generate(cfg) + "\n")
  puts '   packageClassList：加上了'
end
puts "   现在这些插件在册：#{list.join(', ')}"
RUBY

echo "== 5/5 pod install"
cd "$IOS" && pod install

echo
echo "好了。接下来去 Xcode："
echo "  open ~/ccwithme/ios/App/App.xcworkspace"
echo "选你的 iPhone，Cmd+R。"
echo
echo "装完第一次打开附件面板，系统会问要不要给相册权限 —— 要给，"
echo "不然那条带子会显示「去设置里允许访问」。"
