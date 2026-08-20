#!/usr/bin/env python3
"""
Cove 字幕管线 — 外挂字幕 > 平台字幕 > 内封字幕 > Whisper 转写
输入：--bvid BV... --cid ...  或  --url https://...
输出：JSON transcript [{from, to, content}]
"""

import argparse, json, os, sys, time, subprocess, re, hashlib, tempfile

BILI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
FFMPEG = r'C:\Users\123\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\ffmpeg.exe'
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'videos')
COOKIE_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'bilibili-cookie.txt')
os.makedirs(CACHE_DIR, exist_ok=True)

# ── helpers ──────────────────────────────

def load_cookie_string():
    """读取 Chat-C 格式的 B站 cookie，返回 Cookie header 字符串"""
    if not os.path.exists(COOKIE_FILE):
        return ''
    with open(COOKIE_FILE, 'r', encoding='utf-8') as f:
        raw = f.read().strip()
    if not raw:
        return ''
    # Chat-C 格式: "key1=val1; Path=/; Domain=..., key2=val2; ..."
    # 提取 key=value 对，忽略 Path/Domain/Expires 等
    pairs = []
    for part in raw.split(','):
        part = part.strip()
        if not part:
            continue
        # 取第一个 ; 之前的 key=value
        kv = part.split(';')[0].strip()
        if '=' in kv:
            pairs.append(kv)
    return '; '.join(pairs)

def make_netscape_cookie_file(cookie_string):
    """将 cookie 字符串转成 yt-dlp 可读的 Netscape 格式临时文件"""
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
    tmp.write('# Netscape HTTP Cookie File\n')
    pairs = cookie_string.split('; ')
    for pair in pairs:
        if '=' not in pair:
            continue
        key, _, val = pair.partition('=')
        # 默认 domain=bilibili.com, path=/
        tmp.write(f'.bilibili.com\tTRUE\t/\tTRUE\t0\t{key}\t{val}\n')
    tmp.close()
    return tmp.name

# ── helpers ──────────────────────────────

def cache_path(bvid, cid):
    key = (bvid or '') + '_' + (cid or '')
    return os.path.join(CACHE_DIR, key + '.transcript.json')

def load_cache(bvid, cid):
    p = cache_path(bvid, cid)
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

def save_cache(bvid, cid, body):
    with open(cache_path(bvid, cid), 'w', encoding='utf-8') as f:
        json.dump(body, f, ensure_ascii=False)

def output_json(body):
    print(json.dumps(body, ensure_ascii=False))
    sys.exit(0)

# ── Step 1: B站 API 字幕 ─────────────────

def fetch_bilibili_subs(bvid, cid, cookie=''):
    """从 B站 player API 拉字幕列表，下载字幕 JSON"""
    import urllib.request, urllib.error
    try:
        url = f'https://api.bilibili.com/x/player/wbi/v2?bvid={bvid}&cid={cid}'
        headers = {'User-Agent': BILI_UA, 'Referer': 'https://www.bilibili.com/'}
        if cookie:
            headers['Cookie'] = cookie
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        subtitles = data.get('data', {}).get('subtitle', {}).get('subtitles', [])
        if not subtitles:
            return None
        # 优先中文
        sub = next((s for s in subtitles if s.get('lan') in ('zh-Hans', 'zh-CN')), None)
        if not sub:
            sub = next((s for s in subtitles if s.get('lan', '').startswith('ai-zh')), None)
        if not sub:
            sub = subtitles[0]
        sub_url = sub.get('subtitle_url', '')
        if sub_url.startswith('//'):
            sub_url = 'https:' + sub_url
        if not sub_url:
            return None
        req2 = urllib.request.Request(sub_url, headers={'User-Agent': BILI_UA, 'Referer': 'https://www.bilibili.com/'})
        if cookie:
            req2.headers['Cookie'] = cookie
        with urllib.request.urlopen(req2, timeout=15) as resp2:
            sub_data = json.loads(resp2.read().decode('utf-8'))
        body = sub_data.get('body', [])
        if body:
            return [{'from': float(b['from']), 'to': float(b['to']), 'content': b['content']} for b in body]
    except Exception as e:
        print(f'[pipeline] B站 API 字幕失败: {e}', file=sys.stderr)
    return None

# ── Step 2: yt-dlp 字幕 ─────────────────

def fetch_ytdlp_subs(url, cookie_file=None):
    """用 yt-dlp 提取字幕，不下载视频"""
    import tempfile, shutil
    tmp = tempfile.mkdtemp(prefix='cove_subs_')
    try:
        args = [
            sys.executable, '-m', 'yt_dlp',
            '--write-subs', '--write-auto-subs',
            '--skip-download',
            '--sub-langs', 'zh-Hans,zh-CN,zh,ai-zh,en',
            '--convert-subs', 'vtt',
            '--output', os.path.join(tmp, '%(id)s.%(ext)s'),
        ]
        if cookie_file:
            args += ['--cookies', cookie_file]
        args.append(url)
        subprocess.run(args, capture_output=True, text=True, timeout=60, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        # 找生成的字幕文件
        for f in os.listdir(tmp):
            if f.endswith('.vtt') or f.endswith('.srt'):
                fp = os.path.join(tmp, f)
                return parse_vtt_srt(fp)
    except Exception as e:
        print(f'[pipeline] yt-dlp 字幕失败: {e}', file=sys.stderr)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return None

def parse_vtt_srt(path):
    """解析 WebVTT / SRT 为统一格式"""
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    body = []
    # VTT / SRT 时间格式: HH:MM:SS.mmm --> HH:MM:SS.mmm
    pattern = r'(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\s*\n(.*?)(?=\n\n|\n\d+\n|\Z)'
    for m in re.finditer(pattern, text, re.DOTALL):
        h, mm, s, ms = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
        from_sec = h * 3600 + mm * 60 + s + ms / 1000.0
        content = re.sub(r'<[^>]+>', '', m.group(5).strip())
        if content:
            body.append({'from': from_sec, 'to': from_sec + 5.0, 'content': content})
    return body if body else None

# ── Step 3: Whisper 兜底 ──────────────────

def fetch_whisper_fallback(url_or_bvid, cookie_file=None):
    """下载音频 → Whisper 转写"""
    import tempfile, shutil
    tmp = tempfile.mkdtemp(prefix='cove_whisper_')
    audio_path = os.path.join(tmp, 'audio.wav')
    try:
        # yt-dlp 提取音频
        args = [
            sys.executable, '-m', 'yt_dlp',
            '-f', 'worstaudio',
            '--output', os.path.join(tmp, '%(id)s.%(ext)s'),
        ]
        if cookie_file:
            args += ['--cookies', cookie_file]
        args.append(url_or_bvid)
        r = subprocess.run(args, capture_output=True, text=True, timeout=120, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        # 找下载的音频文件
        audio_file = None
        for f in os.listdir(tmp):
            if f.endswith('.opus') or f.endswith('.m4a') or f.endswith('.webm') or f.endswith('.mp3'):
                audio_file = os.path.join(tmp, f)
                break
        if not audio_file:
            print('[pipeline] yt-dlp 未下载到音频', file=sys.stderr)
            return None

        # ffmpeg 转 WAV (16kHz mono)
        subprocess.run(
            [FFMPEG, '-y', '-i', audio_file, '-ar', '16000', '-ac', '1', audio_path],
            capture_output=True, timeout=60
        )
        if not os.path.exists(audio_path):
            print('[pipeline] ffmpeg 转换失败', file=sys.stderr)
            return None

        # Whisper 转写 (medium 模型，中文)
        print('[pipeline] 开始 Whisper 转写...', file=sys.stderr)
        import whisper
        model = whisper.load_model('medium')
        result = model.transcribe(audio_path, language='zh', verbose=False)
        segments = result.get('segments', [])
        body = [{'from': float(s['start']), 'to': float(s['end']), 'content': s['text'].strip()} for s in segments]
        print(f'[pipeline] Whisper 完成，{len(body)} 段', file=sys.stderr)
        return body
    except Exception as e:
        print(f'[pipeline] Whisper 失败: {e}', file=sys.stderr)
        return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

# ── main ──────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Cove 字幕管线')
    parser.add_argument('--bvid', default='')
    parser.add_argument('--cid', default='')
    parser.add_argument('--url', default='')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()

    bvid, cid, url = args.bvid.strip(), args.cid.strip(), args.url.strip()

    # 加载 cookie
    cookie_str = load_cookie_string()
    cookie_netscape = None
    if cookie_str:
        cookie_netscape = make_netscape_cookie_file(cookie_str)

    # 读缓存
    if not args.force and (bvid or cid):
        cached = load_cache(bvid, cid)
        if cached:
            output_json(cached)

    target_url = url or f'https://www.bilibili.com/video/{bvid}'

    # Step 1: B站 API
    if bvid and cid:
        print('[pipeline] Step 1: B站 API 字幕...', file=sys.stderr)
        body = fetch_bilibili_subs(bvid, cid, cookie_str)
        if body:
            save_cache(bvid, cid, body)
            output_json(body)

    # Step 2: yt-dlp 字幕提取
    print('[pipeline] Step 2: yt-dlp 字幕...', file=sys.stderr)
    body = fetch_ytdlp_subs(target_url, cookie_netscape)
    if body:
        if bvid and cid:
            save_cache(bvid, cid, body)
        output_json(body)

    # Step 3: Whisper 兜底
    print('[pipeline] Step 3: Whisper 转写...', file=sys.stderr)
    body = fetch_whisper_fallback(target_url, cookie_netscape)
    if body:
        if bvid and cid:
            save_cache(bvid, cid, body)
        output_json(body)

    print('[pipeline] 所有方式均失败，无法获取字幕', file=sys.stderr)
    output_json([])

if __name__ == '__main__':
    main()