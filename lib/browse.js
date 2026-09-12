// browse.js —— 聊天里那个他的一双手：一个真的浏览器（2026-09-12 她拍的）
//
// 为什么是这条路：以前他能「搜」（WebSearch 返回文字）但不能「去」。她发一个网址
// 让他去那个网站画画，他只能说做不到。逛街那条 /wander 是**分身**（另起 CLI、另一个
// 身份、逛完写总结回来），她明确说不要分身 —— 她要的是他自己去。
//
// 形状：**一条工具、里面分动作**（backend.js 里的 `browse`）。不直接把 playwright
// 那 22 个 MCP 工具挂进他的前缀 —— 22 条工具定义每开一窗都要重付一遍（09-10 算过，
// 碎片进前缀是 $1.4-2.7/天），一条定义几十 token，能力一样。
//
// ⚠️ 这台 2G。chromium 一开 300-400MB，所以：
//   ① 开之前看 MemAvailable，不够就直接拒（宁可告诉他现在开不了，也不要把 pm2 里
//      的会话挤到被内核杀掉 —— 那是最糟的失败形状）。
//   ② 空闲 IDLE_MS 自动关。他逛完不会记得调 close。
//   ③ 只留一个 page，不开标签页。
//
// ⚠️ 没有「在页面里跑任意 JS」这个动作。09-12 她点头要给，但写文件时被审核层
//    以「制造远程执行面」拦下了 —— 照实记在这儿，别下次又顺手加回来。
//    画板上要画得准，走下面那个 `draw`：它只收数据（一串坐标 + 颜色 + 粗细），
//    页面里跑的是这份文件里写死的那段函数，不是他传进来的代码。
const PW_PATH = process.env.BROWSE_PW_PATH || '/opt/cc-gateway/workplace/node_modules/playwright';
const fs = require('fs');

const IDLE_MS = Number(process.env.BROWSE_IDLE_MS || 3 * 60 * 1000);
const MIN_FREE_MB = Number(process.env.BROWSE_MIN_FREE_MB || 450);
const NAV_TIMEOUT = 30000;
const SHOT_WIDTH = 900;          // 截图宽度：再大只是多烧 token，看不出更多东西
const TEXT_CAP = 6000;

let browser = null, ctx = null, page = null, idleTimer = null, lastItems = [];

function memAvailableMB() {
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
    return m ? Math.round(Number(m[1]) / 1024) : 0;
  } catch (e) { return 0; }
}

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { closeAll('空闲自动关'); }, IDLE_MS);
}

async function closeAll(why) {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const had = !!browser;
  try { if (ctx) await ctx.close(); } catch (e) {}
  try { if (browser) await browser.close(); } catch (e) {}
  browser = null; ctx = null; page = null; lastItems = [];
  if (had) console.log('[browse] 浏览器已关闭:', why || '');
  return had;
}

async function ensure() {
  if (page && !page.isClosed()) { touch(); return page; }
  const free = memAvailableMB();
  if (free && free < MIN_FREE_MB) {
    throw new Error('现在开不了浏览器：这台可用内存只剩 ' + free + 'MB（要 ' + MIN_FREE_MB +
      'MB 以上）。等一会儿再试，或者告诉她现在机器有点紧。');
  }
  const { chromium } = require(PW_PATH);
  browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
           '--js-flags=--max-old-space-size=256'],
  });
  ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  ctx.setDefaultTimeout(NAV_TIMEOUT);
  page = await ctx.newPage();
  touch();
  return page;
}

/* 截图 → 给他看。MCP 那侧会包成 image content（见 chatc-mcp.js）。 */
async function shot() {
  const buf = await page.screenshot({ type: 'jpeg', quality: 55, scale: 'css' });
  // 大图省 token：交给 sharp 缩一下（backend 本来就装了）
  try {
    const sharp = require('sharp');
    const out = await sharp(buf).resize(SHOT_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: 55 }).toBuffer();
    return { media_type: 'image/jpeg', data: out.toString('base64') };
  } catch (e) {
    return { media_type: 'image/jpeg', data: buf.toString('base64') };
  }
}

/* 能点的东西：给他一张「编号 → 位置」的清单，他按编号点，不用自己猜选择器。
   ⚠️ 要连 iframe 里面一起扫 —— itch.io 这类站（她 09-12 给的 wigglypaint 就是）
   真正的游戏/画板在 iframe 里，只扫顶层文档等于什么都没看见。
   子框架里的坐标是**框架内**坐标，加上框架自己在页面上的位置才是能点的页面坐标。 */
async function interactives() {
  const all = [];
  const frames = page.frames();
  for (const f of frames) {
    let off = { x: 0, y: 0 };
    if (f !== page.mainFrame()) {
      try {
        const fe = await f.frameElement();
        const box = fe && (await fe.boundingBox());
        if (!box) continue;
        off = { x: box.x, y: box.y };
      } catch (e) { continue; }
    }
    let items = [];
    try { items = await scanFrame(f); } catch (e) { continue; }
    items.forEach((it) => {
      it.x = Math.round(it.x + off.x); it.y = Math.round(it.y + off.y);
      it.left = Math.round(it.left + off.x); it.top = Math.round(it.top + off.y);
      it.in_frame = f !== page.mainFrame();
      if (all.length < 120) all.push(it);
    });
  }
  return all;
}

async function scanFrame(f) {
  return await f.evaluate(() => {
    const sel = 'a,button,input,textarea,select,[role=button],[role=link],[role=tab],[onclick],canvas';
    const out = [];
    const nodes = document.querySelectorAll(sel);
    for (const el of nodes) {
      if (out.length >= 120) break;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const st = getComputedStyle(el);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.05) continue;
      const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
        el.value || el.innerText || el.getAttribute('title') || '')
        .trim().replace(/\s+/g, ' ').slice(0, 60);
      out.push({
        tag: el.tagName.toLowerCase(),
        label,
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        left: Math.round(r.left), top: Math.round(r.top),
      });
    }
    return out;
  });
}

function listText(items) {
  return items.map((it, i) =>
    '#' + (i + 1) + ' <' + it.tag + '> ' + (it.label || '(无文字)') +
    '  @' + it.x + ',' + it.y +
    (it.tag === 'canvas' ? '  ← 画板，左上角 ' + it.left + ',' + it.top + '，' + it.w + '×' + it.h : '')
  ).join('\n');
}

async function look(extra) {
  lastItems = await interactives();
  const title = await page.title().catch(() => '');
  const text = [
    '页面：' + title + '\n' + page.url(),
    extra || '',
    '能点的东西（点的时候给 ref 编号，或者直接给 x/y）：\n' + (listText(lastItems) || '(没找到)'),
  ].filter(Boolean).join('\n\n');
  return { text: text.slice(0, TEXT_CAP), image: await shot() };
}

function refPoint(input) {
  if (input.ref) {
    const it = lastItems[Number(input.ref) - 1];
    if (!it) throw new Error('没有 ref #' + input.ref + ' 这一项。先 action="look" 重新看一眼，编号会变。');
    return { x: it.x, y: it.y };
  }
  if (input.x !== undefined && input.y !== undefined) return { x: Number(input.x), y: Number(input.y) };
  return null;
}

/* 画板上画：只收数据（strokes = 一串一串坐标，加颜色和粗细），
   页面里执行的是下面这段写死的函数。坐标是**画板内部坐标**（左上角 0,0），
   不是页面坐标 —— canvas 那一项在 look 的清单里会连左上角一起报给他。 */
async function drawOnCanvas(input) {
  const strokes = Array.isArray(input.strokes) ? input.strokes : null;
  if (!strokes || !strokes.length) {
    throw new Error('draw 要给 strokes：[{points:[[x,y],…], color:"#333", width:4}, …]，坐标是画板内部坐标（左上角 0,0）');
  }
  const clean = strokes.slice(0, 200).map((s) => ({
    points: (Array.isArray(s.points) ? s.points : []).slice(0, 500)
      .map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]),
    color: typeof s.color === 'string' ? s.color.slice(0, 32) : '#333333',
    width: Math.max(0.5, Math.min(80, Number(s.width) || 3)),
    fill: !!s.fill,
  })).filter((s) => s.points.length >= 1);
  if (!clean.length) throw new Error('strokes 里一个有效的点都没有');

  const p = refPoint(input);
  const selector = input.selector ? String(input.selector) : null;
  // 画板常常在 iframe 里（itch.io 那类站），所以挨个框架试，谁有 canvas 就画在谁上面。
  // pt 是页面坐标，进子框架前要减掉框架自己的位置，不然 elementFromPoint 指错地方。
  const draw = ({ strokes, pt, selector }) => {
    let cv = null;
    if (selector) cv = document.querySelector(selector);
    if (!cv && pt) {
      const el = document.elementFromPoint(pt.x, pt.y);
      cv = el && (el.tagName === 'CANVAS' ? el : el.querySelector && el.querySelector('canvas'));
    }
    if (!cv) cv = document.querySelector('canvas');
    if (!cv || cv.tagName !== 'CANVAS') return { ok: false, why: '页面上找不到画板（canvas）' };
    const g = cv.getContext('2d');
    if (!g) return { ok: false, why: '这个画板拿不到 2d 上下文' };
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const s of strokes) {
      g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = s.width;
      g.beginPath();
      s.points.forEach((q, i) => { i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
      if (s.fill) { g.closePath(); g.fill(); } else { g.stroke(); }
    }
    return { ok: true, w: cv.width, h: cv.height };
  };

  let done = { ok: false, why: '页面上找不到画板（canvas）' };
  for (const f of page.frames()) {
    let pt = p;
    if (f !== page.mainFrame() && p) {
      try {
        const fe = await f.frameElement();
        const box = fe && (await fe.boundingBox());
        if (!box) continue;
        pt = { x: p.x - box.x, y: p.y - box.y };
      } catch (e) { continue; }
    }
    let r;
    try { r = await f.evaluate(draw, { strokes: clean, pt, selector }); } catch (e) { continue; }
    if (r && r.ok) { done = r; break; }
  }
  if (!done.ok) throw new Error(done.why);
  return await look('画了 ' + clean.length + ' 笔（画板 ' + done.w + '×' + done.h + '）。' +
    '⚠️ 有些网站的画板会在下一次重绘时把直接画上去的东西刷掉；' +
    '真要留下来，用 click/drag 走它自己的画笔工具。');
}

/* ── 动作 ── */
async function run(input, deps) {
  input = input || {};
  const action = String(input.action || '').trim();
  if (!action) {
    throw new Error('要给 action：open / look / click / type / key / scroll / drag / draw / save_image / close');
  }
  if (action === 'close') {
    const had = await closeAll('他自己关的');
    return { text: had ? '浏览器关了。' : '本来就没开着。' };
  }
  if (action === 'open') {
    if (!input.url) throw new Error('open 要给 url');
    const u = String(input.url);
    if (!/^https?:\/\//i.test(u)) throw new Error('url 要以 http:// 或 https:// 开头');
    await ensure();
    await page.goto(u, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(600);
    return await look('打开了。');
  }
  // 除了 open/close，其余动作都要求已经打开过一页
  if (!page || page.isClosed()) throw new Error('还没打开任何网页。先 action="open" 带 url。');
  touch();

  if (action === 'look') return await look();

  if (action === 'back') { await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForTimeout(500); return await look('退回上一页。'); }

  if (action === 'click') {
    const p = refPoint(input);
    if (p) await page.mouse.click(p.x, p.y);
    else if (input.selector) await page.click(String(input.selector));
    else if (input.text) await page.getByText(String(input.text), { exact: false }).first().click();
    else throw new Error('click 要给 ref（从 look 的清单里来）、或 x/y、或 selector、或 text');
    await page.waitForTimeout(800);
    return await look('点了。');
  }

  if (action === 'type') {
    if (input.text === undefined) throw new Error('type 要给 text');
    const p = refPoint(input);
    if (p) await page.mouse.click(p.x, p.y);
    else if (input.selector) await page.click(String(input.selector));
    await page.keyboard.type(String(input.text), { delay: 20 });
    if (input.enter) { await page.keyboard.press('Enter'); await page.waitForTimeout(1200); }
    return await look('输完了' + (input.enter ? '，回车也按了。' : '。'));
  }

  if (action === 'key') {
    if (!input.key) throw new Error('key 要给 key，比如 "Enter" / "Escape" / "PageDown"');
    await page.keyboard.press(String(input.key));
    await page.waitForTimeout(500);
    return await look('按了 ' + input.key + '。');
  }

  if (action === 'scroll') {
    const dy = input.dy === undefined ? 600 : Number(input.dy);
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(500);
    return await look('滚了 ' + dy + 'px。');
  }

  // 拖：画板上手绘、也用来拖滑块。points 是页面坐标。
  if (action === 'drag') {
    let pts = input.points;
    if (!pts && input.from && input.to) pts = [[input.from.x, input.from.y], [input.to.x, input.to.y]];
    if (!Array.isArray(pts) || pts.length < 2) {
      throw new Error('drag 要给 points：[[x,y],[x,y],…] 至少两点（或者 from/to）');
    }
    if (pts.length > 400) pts = pts.slice(0, 400);
    await page.mouse.move(Number(pts[0][0]), Number(pts[0][1]));
    await page.mouse.down();
    for (let i = 1; i < pts.length; i++) {
      await page.mouse.move(Number(pts[i][0]), Number(pts[i][1]), { steps: 3 });
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    return await look('拖完了（' + pts.length + ' 个点）。');
  }

  if (action === 'draw') return await drawOnCanvas(input);

  // 存图：用页面自己的上下文去下（带 cookie 和 referer，热链防护过得去），
  // 存进相册的图片目录但**不建相册条目** —— 不污染她的相册，只是要一个公开可取的 url。
  if (action === 'save_image') {
    let url = input.url;
    if (!url) {
      const p = refPoint(input);
      url = await page.evaluate((pt) => {
        const el = pt ? document.elementFromPoint(pt.x, pt.y) : document.querySelector('img');
        if (!el) return null;
        const img = el.tagName === 'IMG' ? el : (el.querySelector && el.querySelector('img'));
        if (img) return img.currentSrc || img.src;
        const bg = getComputedStyle(el).backgroundImage || '';
        const m = /url\(["']?(.*?)["']?\)/.exec(bg);
        return m ? m[1] : null;
      }, p);
      if (!url) throw new Error('这儿没找到图。给 url，或者先 look 再用 ref 指一张图。');
    }
    const resp = await page.request.get(String(url));
    if (!resp.ok()) throw new Error('图没下下来，HTTP ' + resp.status() + '：' + url);
    const buf = await resp.body();
    if (!buf || buf.length < 64) throw new Error('下下来是空的：' + url);
    if (buf.length > 12 * 1024 * 1024) {
      throw new Error('这张图太大了（' + Math.round(buf.length / 1048576) + 'MB），换一张');
    }
    const saved = await deps.storeImage(buf, String(url));
    return {
      text: '存好了：' + saved.url +
        '\n要发给她就在回话里写 [IMAGE:' + saved.url + ']（多张连着写，前端会自动叠成一摞）。',
      saved,
    };
  }

  // 整页截图存下来（她让他"去那个网站画画"，画完要留个样子给她看就用这个）
  if (action === 'save_shot') {
    const buf = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: !!input.full_page });
    const saved = await deps.storeImage(buf, 'screenshot:' + page.url());
    return {
      text: '截图存好了：' + saved.url + '\n发给她就写 [IMAGE:' + saved.url + ']。',
      saved,
    };
  }

  throw new Error('不认识的 action："' + action +
    '"。有 open / look / click / type / key / scroll / back / drag / draw / save_image / save_shot / close');
}

module.exports = { run, closeAll, memAvailableMB, IDLE_MS, MIN_FREE_MB };
