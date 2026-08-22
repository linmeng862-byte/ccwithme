#!/usr/bin/env python3
"""改完前端跑一下，看真实页面到底长什么样 —— 别靠脑补。

用法:  python3 scripts/ui-check.py
依赖:  Python 版 playwright（这台已装，见 CLAUDE.local.md），浏览器在 ~/.cache/ms-playwright

⚠️ 关于 token：只从文件读进变量、注入浏览器 localStorage，**不打印、不写盘、不进 git**。
   改这个脚本时守住这条（见 HANDOVER 顶上那节 auth 红线）。
"""
import os, pathlib
from playwright.sync_api import sync_playwright

ROOT  = os.environ.get("CHATC_DIR", "/home/ubuntu/ccwith")     # 机器相关，走 env
URL   = os.environ.get("CHATC_URL", "http://127.0.0.1:4567")
OUT   = os.environ.get("UI_OUT", "/tmp/ui_check")
pathlib.Path(OUT).mkdir(parents=True, exist_ok=True)
TOKEN = pathlib.Path(f"{ROOT}/data/.auth_token").read_text().strip()

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width": 430, "height": 932}, device_scale_factor=2)  # 她用手机
    pg.add_init_script(f"localStorage.setItem('chat_token', {TOKEN!r});")
    errs = []
    pg.on("console",   lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    pg.goto(URL, wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(4000)

    print("=== 流里的元素顺序（看得见结构，才知道哪儿多了哪儿少了）===")
    for i, it in enumerate(pg.evaluate("""() => {
        const el = document.getElementById('streamInner');
        if (!el) return [{cls:'(没有 #streamInner)', txt:''}];
        return [...el.children].map(c => ({
          cls: c.className || c.tagName,
          txt: (c.innerText||'').replace(/\\s+/g,' ').slice(0,42)
        }));
      }""")[-30:]):
        print(f"  {i:>2} [{it['cls']}] {it['txt']}")

    print("\n=== 计数 ===")
    for sel in ['.msg-time-inline', '.time-separator', '.msg-claude', '.msg-user',
                '.file-card', '.action-report-card', '.trace-row', '.message-attachment']:
        print(f"  {sel:<22}", pg.locator(sel).count())

    print("\n=== 控制台 ===")
    print("  无错误 ✅" if not errs else "\n".join("  " + e[:160] for e in errs[:6]))

    pg.screenshot(path=f"{OUT}/full.png", full_page=True)
    print(f"\n截图: {OUT}/full.png")
    b.close()
