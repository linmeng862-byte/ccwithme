#!/bin/bash
# 推前必扫：她的 auth token / API key 一旦推进 public 仓库，历史里就洗不掉。
# 扫的是【本次要推上去的提交】里新增的内容，不是整个工作树。
# 误报了要放行：git push --no-verify（想清楚再用）。
#
# ⚠️ 命中时只打印文件和行号，绝不打印匹配到的值本身 —— 免得密钥又跑进终端记录里。

PATTERN='sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----|(token|api[_-]?key|apikey|password|passwd|secret|SESSDATA|bili_jct)["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9._-]{16,}'

fail=0
while read -r _local_ref local_sha _remote_ref remote_sha; do
  [ "$local_sha" = "0000000000000000000000000000000000000000" ] && continue   # 删分支

  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    # 新分支：扫它带来的、远端还没有的全部提交
    range="$local_sha --not --remotes=origin"
  else
    range="$remote_sha..$local_sha"
  fi

  # 只看新增行（+ 开头）。用 log -p 而不是 diff —— diff <sha> 比的是工作树，扫不到提交内容。
  hits=$(git log -p -U0 --no-color $range 2>/dev/null | grep -IE "^\+" | grep -IE "$PATTERN")

  if [ -n "$hits" ]; then
    fail=1
    echo ""
    echo "🚨 pre-push 拦下来了：这次要推的内容里有像密钥/token 的东西"
    echo "   （只显示条数和位置，不显示内容）"
    echo "   命中行数：$(echo "$hits" | wc -l)"
    echo ""
    echo "   涉及文件："
    git log --name-only --pretty=format: $range 2>/dev/null | sort -u | while read -r f; do
      [ -z "$f" ] && continue
      if git log -p -U0 --no-color $range -- "$f" 2>/dev/null | grep -IE "^\+" | grep -qIE "$PATTERN"; then
        echo "     - $f"
      fi
    done
  fi
done

if [ "$fail" = "1" ]; then
  echo ""
  echo "   ccwithme 是 public 仓库，推上去历史里洗不掉。"
  echo "   先把密钥挪进 data/claude.db 的 settings 表或 CLAUDE.local.md（两个都已 ignore），"
  echo "   代码里只留读取，别留值。"
  echo "   确认是误报再用：git push --no-verify"
  echo ""
  exit 1
fi

exit 0
