#!/usr/bin/env node
// set-site-password.js —— 给 /api/auth 设登录密码，或者换掉/关掉它。
//
// ⚠️ 只能在真终端里跑，跟 persona-backup.sh 一个道理：输入是隐藏的（不回显），
//    密码不进 shell 历史（不是命令行参数）、不进任何日志、更不会出现在跟 Claude 的对话里。
//    `!` 前缀那种半交互终端做不了隐藏输入，请用真正的 SSH 终端跑这个。
//
// 用法：
//   node scripts/set-site-password.js         设置/更换密码
//   node scripts/set-site-password.js --off    关掉密码锁，回到「谁都能拿 token」
"use strict";
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "data", "claude.db");
const db = new Database(dbPath);

// 逐字符读、不回显。用 charCodeAt 判控制字符，别用字面量控制字符 ——
// 那种字符在源文件里容易被编辑器/管道悄悄吃掉或改样，charCode 判断不会踩这个坑。
const CH_ENTER = [10, 13];      // \n \r
const CH_CTRLC = 3;
const CH_BACKSPACE = [8, 127];  // backspace / DEL

function hiddenInput(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let buf = "";
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    function onData(ch) {
      ch = String(ch);
      const code = ch.charCodeAt(0);
      if (CH_ENTER.includes(code)) {
        stdin.removeListener("data", onData);
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.pause();
        process.stdout.write("\n");
        resolve(buf);
      } else if (code === CH_CTRLC) {
        process.exit(1);
      } else if (CH_BACKSPACE.includes(code)) {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    }
    stdin.on("data", onData);
  });
}

async function main() {
  if (process.argv.includes("--off")) {
    db.prepare("DELETE FROM settings WHERE key IN ('site_auth_hash','site_auth_salt')").run();
    console.log("密码锁已关闭 —— /api/auth 回到没有门槛的状态。");
    db.close();
    return;
  }

  const already = !!db.prepare("SELECT value FROM settings WHERE key = 'site_auth_hash'").get()?.value;
  if (already) {
    console.log("已经设过密码了，这次会覆盖成新的。");
  }

  const pw1 = await hiddenInput("设一个密码（不会显示）：");
  if (!pw1 || pw1.length < 6) {
    console.log("太短了，至少 6 位，没保存。");
    db.close();
    return;
  }
  const pw2 = await hiddenInput("再输一遍确认：");
  if (pw1 !== pw2) {
    console.log("两次不一样，没保存。");
    db.close();
    return;
  }

  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw1, salt, 64);
  const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  upsert.run("site_auth_salt", salt.toString("hex"));
  upsert.run("site_auth_hash", hash.toString("hex"));
  db.close();
  console.log("设好了。下次在新设备/新浏览器打开这个网站时会问这个密码。");
  console.log("这台浏览器现在用的 token 还有效，不用重新登录。");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
