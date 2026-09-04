#!/usr/bin/env bash
# 把 capacitor.config.json 的 server.url 设成 .app-variant 里的 api= 那个域名。
#
# 干什么用：app 改成「远程加载」—— 一打开就去服务器拿网页，而不是用打包进去的副本。
# 好处是前端改完在手机上刷新一下就有了，不用每次重编译重装。
# 代价是没网的时候 app 打不开。
#
# ⚠️ 域名**故意不写在这个脚本里** —— 这是 PUBLIC 仓库，跟 ios-prep.sh 一个规矩：
#    地址放 .app-variant（gitignore，每台一份），格式见 ios-prep.sh 文件头。
#
# ⚠️ capacitor.config.json 是 skip-worktree 的（不进 git，每台一份），
#    所以这一步 git pull 拿不到，每台各跑一次。
#
# 撤回本地打包：bash scripts/set-server-url.sh --off
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$ROOT/capacitor.config.json"
[ -f "$CFG" ] || { echo "❌ 找不到 $CFG" >&2; exit 1; }

if [ "${1:-}" = "--off" ]; then
  node -e "
    const fs=require('fs'),p='$CFG';
    const c=JSON.parse(fs.readFileSync(p,'utf8'));
    if(c.server){delete c.server.url;delete c.server.cleartext}
    fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
  "
  echo "✅ 撤回本地打包（server.url 已移除）"
  echo "   记得重跑 npx cap sync ios && bash scripts/ios-prep.sh"
  exit 0
fi

# 域名来源：命令行 APP_API_HOST > .app-variant 里的 api=
API_HOST="${APP_API_HOST:-}"
if [ -z "${API_HOST}" ] && [ -f "$ROOT/.app-variant" ]; then
  while IFS= read -r _line || [ -n "${_line}" ]; do
    _line="$(printf '%s' "${_line}" | tr -d ' \t\r')"
    case "${_line}" in
      api=*) API_HOST="${_line#api=}" ;;
    esac
  done < "$ROOT/.app-variant"
fi

if [ -z "${API_HOST}" ]; then
  echo "❌ 不知道该指向哪台后端。" >&2
  echo "   在 .app-variant 里加一行： api=你的域名" >&2
  echo "   或者临时： APP_API_HOST=你的域名 bash scripts/set-server-url.sh" >&2
  exit 1
fi

# 允许写成 example.com 或 https://example.com，统一补成 https://
case "${API_HOST}" in
  https://*) URL="${API_HOST}" ;;
  http://*)  echo "❌ 必须是 https —— iOS 的 ATS 不收明文" >&2; exit 1 ;;
  *)         URL="https://${API_HOST}" ;;
esac

node -e "
  const fs=require('fs'),p='$CFG';
  const c=JSON.parse(fs.readFileSync(p,'utf8'));
  c.server=Object.assign({},c.server,{url:'${URL}',cleartext:false});
  fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n');
  console.log('   server.url =',c.server.url);
"
git -C "$ROOT" update-index --skip-worktree capacitor.config.json 2>/dev/null || true
echo "✅ 改成远程加载了"
echo "   接下来： npx cap sync ios && bash scripts/ios-prep.sh"
echo "   ⚠️ 这之后前端改动**不用重编**，手机上把 app 划掉重开（或下拉刷新）就是新的。"
