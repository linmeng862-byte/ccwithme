// 给他的 make_video 工具用（backend.js 在 cage 里 spawn 这个脚本）。原型在 VPS 上的 anim 目录，09-24 她定的路线：canvas 逐帧。
// canvas 逐帧渲染：场景 JS 定义 draw(t)，无头 chromium 一帧帧取 canvas，管道喂给 ffmpeg-safe 出 mp4。
// 用法: node render.js scene.js out.mp4 [秒=8] [fps=30] [宽=1280] [高=720]
// 场景约定: 全局有 canvas / ctx / W / H，场景自己写 function draw(t){...}（t 单位秒）。
// 声音(可选): 场景再写 function audio(sr, dur) 返回 Float32Array(单声道, -1~1)，就会混进 mp4。
// 断网: offline + 拦掉所有请求，场景只能画，不能往外发东西。
const { chromium } = require(process.env.BROWSE_PW_PATH || '/opt/cc-gateway/workplace/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const [scenePath, out, dur = 8, fps = 30, W = 1280, H = 720] = process.argv.slice(2);
const code = fs.readFileSync(scenePath, 'utf8');
const html = `<!doctype html><html><body style="margin:0;background:#000">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>const canvas=document.getElementById('c'),ctx=canvas.getContext('2d'),W=${W},H=${H};</script>
<script>${code}\n;window.__draw = typeof draw==='function' ? draw : null; window.__audio = typeof audio==='function' ? audio : null;</script></body></html>`;

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'] });
  const page = await (await browser.newContext({ offline: true, viewport: { width: +W, height: +H } })).newPage();
  await page.route('**/*', r => r.abort());
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setContent(html);
  if (!(await page.evaluate(() => !!window.__draw))) {
    console.log('FAIL 场景里没有 draw(t) 函数' + (errs.length ? '：' + errs[0] : ''));
    await browser.close(); process.exit(1);
  }
  // 先算声音，写成 wav，给 ffmpeg 当第二路输入
  const SR = 44100, wav = out.replace(/\.mp4$/, '') + '.tmp.wav';
  const pcm = await page.evaluate(([sr, d]) => {
    if (!window.__audio) return null;
    const f = window.__audio(sr, d), b = new Uint8Array(f.length * 2), v = new DataView(b.buffer);
    for (let i = 0; i < f.length; i++) v.setInt16(i * 2, Math.max(-1, Math.min(1, f[i] || 0)) * 32767, true);
    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }, [SR, +dur]);
  const aIn = [];
  if (pcm) {
    const data = Buffer.from(pcm, 'base64'), hd = Buffer.alloc(44);
    hd.write('RIFF', 0); hd.writeUInt32LE(36 + data.length, 4); hd.write('WAVEfmt ', 8); hd.writeUInt32LE(16, 16);
    hd.writeUInt16LE(1, 20); hd.writeUInt16LE(1, 22); hd.writeUInt32LE(SR, 24); hd.writeUInt32LE(SR * 2, 28);
    hd.writeUInt16LE(2, 32); hd.writeUInt16LE(16, 34); hd.write('data', 36); hd.writeUInt32LE(data.length, 40);
    fs.writeFileSync(wav, Buffer.concat([hd, data]));
    aIn.push('-i', wav);
  }
  const ff = spawn('ffmpeg-safe', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps),
    '-i', '-', ...aIn, ...(pcm ? ['-c:a', 'aac', '-b:a', '160k', '-shortest'] : []), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'ignore', 'pipe'] });
  let fferr = ''; ff.stderr.on('data', d => fferr += d);
  const n = Math.round(dur * fps);
  for (let i = 0; i < n; i++) {
    const b64 = await page.evaluate(t => { window.__draw(t); return canvas.toDataURL('image/jpeg', 0.92).slice(23); }, i / fps);
    if (errs.length) break;
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await browser.close();
  const code_ = await new Promise(r => ff.on('close', r));
  if (pcm) fs.unlinkSync(wav);
  if (errs.length) { console.log('FAIL 场景报错：' + errs[0].slice(0, 200)); process.exit(1); }
  if (code_ !== 0) { console.log('FAIL ffmpeg：' + fferr.slice(-200)); process.exit(1); }
  console.log(`OK ${out} ${n}帧 ${((Date.now() - t0) / 1000).toFixed(1)}s ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
})().catch(e => { console.log('FAIL ' + e.message.slice(0, 200)); process.exit(1); });
