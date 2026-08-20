const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const iconv = require('iconv-lite');
let neteaseApi = null;
try { neteaseApi = require('NeteaseCloudMusicApi'); } catch(e) {}

// ═══════════════════════════════════════════
// Chat-C v1.0.0 — 2026-07-01
// ═══════════════════════════════════════════
const __VERSION__ = 'v1.0.0';

const app = express();
const PORT = process.env.PORT || 4567;

// === 数据库初始化 ===
const db = new Database(path.join(__dirname, 'data', 'claude.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    conv_id TEXT PRIMARY KEY,
    title TEXT DEFAULT '新对话',
    starred INTEGER DEFAULT 0,
    project_id TEXT DEFAULT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT DEFAULT '',
    thinking TEXT DEFAULT '',
    attachments TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (conv_id) REFERENCES sessions(conv_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS profile (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS saved_memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    source TEXT DEFAULT 'manual',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS diary (
    date TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    mood TEXT DEFAULT '',
    locked INTEGER DEFAULT 0,
    unlock_date TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS diary_comments (
    id TEXT PRIMARY KEY,
    diary_date TEXT NOT NULL,
    author TEXT DEFAULT 'zhou',
    avatar TEXT DEFAULT '',
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content TEXT DEFAULT '',
    size INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// 迁移：diary 表新列（v2 装修）
try { db.exec('ALTER TABLE diary ADD COLUMN title TEXT DEFAULT \'\''); } catch (e) {}
try { db.exec('ALTER TABLE diary ADD COLUMN mood TEXT DEFAULT \'\''); } catch (e) {}
try { db.exec('ALTER TABLE diary ADD COLUMN locked INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE diary ADD COLUMN unlock_date TEXT DEFAULT \'\''); } catch (e) {}
try { db.exec('ALTER TABLE diary ADD COLUMN updated_at INTEGER DEFAULT (strftime(\'%s\',\'now\'))'); } catch (e) {}

// === Gallery 相册 ===
db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_albums (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    mood TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    photo_count INTEGER DEFAULT 0,
    created_by TEXT DEFAULT 'zhou',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS gallery_photos (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL,
    url TEXT NOT NULL,
    caption TEXT DEFAULT '',
    taken_at TEXT DEFAULT '',
    created_by TEXT DEFAULT 'zhou',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (album_id) REFERENCES gallery_albums(id) ON DELETE CASCADE
  );
`);

// 迁移：为已有 sessions 表添加 project_id 列
try { db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT DEFAULT NULL'); } catch(e) { /* 列已存在，忽略 */ }

// 🍅 番茄钟命令表
db.exec(`
  CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    countdown_seconds INTEGER DEFAULT 1500,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','active','done','cancelled')),
    started_at INTEGER DEFAULT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    completed_at INTEGER DEFAULT NULL,
    duration_ms INTEGER DEFAULT NULL,
    feedback_sent INTEGER DEFAULT 0
  );
`);

// 阅读器表
db.exec(`
  CREATE TABLE IF NOT EXISTS reading_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT DEFAULT '',
    filename TEXT NOT NULL,
    total_chapters INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);
  // 兼容旧表：加 cover_url 列
  try { db.exec('ALTER TABLE reading_books ADD COLUMN cover_url TEXT DEFAULT \'\''); } catch(_) {}
  try { db.exec('ALTER TABLE reading_progress ADD COLUMN user_id TEXT DEFAULT \'zhou\''); } catch(_) {}
  db.exec(`
  CREATE TABLE IF NOT EXISTS reading_chapters (
    book_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    title TEXT DEFAULT '',
    content TEXT NOT NULL,
    char_count INTEGER DEFAULT 0,
    PRIMARY KEY (book_id, chapter_index)
  );
  CREATE TABLE IF NOT EXISTS reading_notes (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    chapter_index INTEGER,
    content TEXT NOT NULL,
    quote TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS book_annotations (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    chapter_idx INTEGER NOT NULL,
    anchor TEXT NOT NULL,
    note TEXT DEFAULT '',
    who TEXT DEFAULT 'user',
    anchor_start INTEGER DEFAULT -1,
    anchor_end INTEGER DEFAULT -1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS book_annotation_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    annotation_id TEXT NOT NULL,
    who TEXT DEFAULT 'ai',
    text TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS reading_progress (
    book_id TEXT NOT NULL,
    user_id TEXT NOT NULL DEFAULT 'zhou',
    chapter_index INTEGER DEFAULT 0,
    scroll_pos REAL DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    PRIMARY KEY (book_id, user_id)
  );
`);

// 表情包表
db.exec(`
  CREATE TABLE IF NOT EXISTS stickers (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    category TEXT DEFAULT '默认',
    tags TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

const readingDir = path.join(__dirname, 'data', 'reading');
if (!fs.existsSync(readingDir)) fs.mkdirSync(readingDir, { recursive: true });
const stickerDir = path.join(__dirname, 'data', 'stickers');
if (!fs.existsSync(stickerDir)) fs.mkdirSync(stickerDir, { recursive: true });

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const projectDir = path.join(__dirname, 'data', 'projects');
if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'data', 'uploads', 'tmp'), limits: { fileSize: 20 * 1024 * 1024 } });
const readingUpload = multer({ dest: path.join(__dirname, 'data', 'uploads', 'tmp'), limits: { fileSize: 50 * 1024 * 1024 } });
// === 中间件 ===
app.use(express.json({ limit: '50mb' }));
// ── 阅读器 API ──────────────────────────────────────────

// 上传书籍
app.post('/api/reading/upload', auth, readingUpload.single('file'), async (req, res) => {
  console.log('[upload] GOT REQUEST, file:', req.file?.originalname, 'size:', req.file?.size);
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.txt', '.epub', '.pdf'].includes(ext)) return res.status(400).json({ error: '仅支持 TXT、EPUB 和 PDF' });

    const bid = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const filePath = path.join(readingDir, bid + ext);
    fs.copyFileSync(req.file.path, filePath);
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    let title = req.file.originalname.replace(ext, '');
    // 文件名过编码检测（Express 用 UTF-8 解析 HTTP header）
    try {
      const bufName = Buffer.from(req.file.originalname, 'utf8');
      title = _decodeBuffer(bufName).replace(ext, '');
    } catch(_) {}
    console.log('[upload] title:', title);
    let author = '';
    let chapters = [];
    let raw = '';

    // 编码检测：Port 自 Rifugio——计数替换字符 �
    function _decodeBuffer(buf) {
      var utf8 = buf.toString('utf8');
      var bad = (utf8.match(/�/g) || []).length; // U+FFFD = �
      if (bad > Math.max(3, utf8.length / 1000)) {
        console.log('[decode] utf8 bad chars:', bad, '→ fallback gb18030');
        return iconv.decode(buf, 'gb18030');
      }
      console.log('[decode] utf8 ok, bad chars:', bad);
      return utf8;
    }

    if (ext === '.txt') {
      const buf = fs.readFileSync(filePath);
      raw = _decodeBuffer(buf);
      var hasHtml = /<br|<p|<div/i.test(raw);
      console.log('[upload] has HTML tags:', hasHtml);
      if (hasHtml) { raw = raw.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\n{3,}/g,'\n\n'); console.log('[upload] HTML cleaned:', raw.slice(0,100)); }
    } else if (ext === '.epub') {
      const zipData = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(zipData);
      // 找 .xhtml/.html 文件，跳过导航页
      const htmlFiles = Object.keys(zip.files).filter(f =>
        /\.(xhtml|html|htm)$/i.test(f) && !/nav|toc|cover|titlepage/i.test(f)
      ).sort();
      if (htmlFiles.length === 0) return res.status(400).json({ error: 'EPUB 中未找到章节内容' });

      chapters = [];
      for (const f of htmlFiles) {
        const html = await zip.files[f].async('text');
        // 简易 HTML 转纯文本
        let text = html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        // 从 container.xml 或 opf 文件取标题
        const chTitle = text.trim().split('\n')[0]?.slice(0, 60) || `第${chapters.length + 1}章`;
        chapters.push({ title: chTitle, content: text.trim() });
      }
    }

    if (ext === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const buf = fs.readFileSync(filePath);
        console.log('[upload] PDF size:', buf.length, 'bytes');
        const pdfData = await pdfParse(buf);
        console.log('[upload] PDF pages:', pdfData.numpages, 'text length:', (pdfData.text || '').length);
        raw = pdfData.text || '';
        if (!raw.trim()) return res.status(400).json({ error: 'PDF 无法提取文字，可能是扫描件或图片PDF' });
        raw = raw.replace(/\n{4,}/g, '\n\n').replace(/^\s+\d+\s*$/gm, '').trim();
        console.log('[upload] PDF raw text (first 200 chars):', raw.slice(0, 200));
      } catch(e) {
        console.log('[upload] PDF error:', e.message);
        return res.status(500).json({ error: 'PDF 解析失败: ' + e.message });
      }
    }

    // TXT/PDF 共享章节切分（EPUB 已在上面处理完成）
    console.log('[upload] chapters.length:', chapters.length, 'raw.length:', raw.length);
    if (ext !== '.epub' && chapters.length === 0 && raw.length > 0) {
      const chapterSplit = raw.split(/\n(?=#{1,3}\s|第[一二三四五六七八九十百千\d]+[章节回篇]|序章|序言|楔子|引子|前言|尾声|终章|后记|番外|Chapter\s+\d+|CHAPTER\s+\d+)/);
      console.log('[upload] chapterSplit length:', chapterSplit.length);
      if (chapterSplit.length <= 1) {
        let remaining = raw; const chunks = [];
        while (remaining.length > 0) { chunks.push(remaining.slice(0, 6000)); remaining = remaining.slice(6000); }
        chapters = chunks.map((c, i) => ({ title: 'Part ' + (i + 1), content: c.trim() }));
      } else {
        chapters = chapterSplit.filter(ch => ch.trim().length > 50).map((ch, i) => {
          const lines = ch.trim().split('\n');
          const chTitle = (lines[0] || '').slice(0, 80) || 'Chapter ' + (i + 1);
          return { title: chTitle, content: ch.trim() };
        });
      }
    }
    console.log('[upload] final chapters:', chapters.length);

    // 标题：优先从正文提取，文件名兜底
    if (chapters.length > 0 && chapters[0].content) {
      const lines = chapters[0].content.split('\n').map(l => l.replace(/<[^>]+>/g, '').trim()).filter(l => l.length > 2 && l.length < 80);
      // 优先找书名标记 [xxx]、《xxx》、或 "xxx著"
      var cnLine = lines.find(l => /[\[《].+[\]》]/.test(l)) || lines.find(l => /著\s*$/.test(l)) || lines.find(l => /[一-鿿]/.test(l));
      if (cnLine) { title = cnLine.replace(/^[\[《]\s*|\s*[\]》]$/g, '').replace(/\s*\/\s*.+$/, '').slice(0, 80); console.log('[upload] title from content:', title); }
    }

    // 存数据库
    const insertBook = db.prepare('INSERT INTO reading_books (id, title, author, filename, total_chapters, cover_url) VALUES (?, ?, ?, ?, ?, ?)');
    const insertCh = db.prepare('INSERT OR REPLACE INTO reading_chapters (book_id, chapter_index, title, content, char_count) VALUES (?, ?, ?, ?, ?)');
    insertBook.run(bid, title, author, req.file.originalname, chapters.length, '');
    for (let i = 0; i < chapters.length; i++) {
      insertCh.run(bid, i, chapters[i].title, chapters[i].content, chapters[i].content.length);
    }

    res.json({ id: bid, title, author, totalChapters: chapters.length, filename: req.file.originalname });
  } catch (e) {
    res.status(500).json({ error: '上传失败: ' + e.message });
  }
});

// 列出书籍（含批注数和进度）
app.get('/api/reading/books', auth, (req, res) => {
  const books = db.prepare('SELECT id, title, author, filename, total_chapters, cover_url, created_at FROM reading_books ORDER BY created_at DESC').all();
  const result = books.map(b => {
    const notesCount = db.prepare('SELECT COUNT(*) as c FROM reading_notes WHERE book_id = ?').get(b.id)?.c || 0;
    const progress = db.prepare('SELECT * FROM reading_progress WHERE book_id = ?').all(b.id);
    return { ...b, notes_count: notesCount, progress: progress };
  });
  res.json(result);
});

// 阅读进度
app.post('/api/reading/progress', auth, (req, res) => {
  const { book_id, chapter_index, scroll_pos } = req.body;
  if (!book_id) return res.status(400).json({ error: 'book_id required' });
  const userId = 'zhou'; // TODO: 后续支持多用户
  db.prepare('INSERT OR REPLACE INTO reading_progress (book_id, user_id, chapter_index, scroll_pos, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(book_id, userId, chapter_index || 0, scroll_pos || 0, Math.floor(Date.now()/1000));
  res.json({ ok: true });
});

// === 批注系统（Port 自 Rifugio） ===
// GET 某章所有批注（含回复）
app.get('/api/reading/books/:id/chapter/:idx/annotations', auth, (req, res) => {
  try {
    const since = parseInt(req.query.since) || 0;
    const sql = `
      SELECT id, book_id, chapter_idx, anchor, note, who, anchor_start, anchor_end, created_at
      FROM book_annotations WHERE book_id = ? AND chapter_idx = ?
      AND created_at > ?
      ORDER BY anchor_start, created_at`;
    const annotations = db.prepare(sql).all(req.params.id, parseInt(req.params.idx), since);
    const replies = db.prepare(`
      SELECT r.id, r.annotation_id, r.who, r.text, r.created_at
      FROM book_annotation_replies r
      JOIN book_annotations a ON a.id = r.annotation_id
      WHERE a.book_id = ? AND a.chapter_idx = ? ORDER BY r.id`).all(req.params.id, parseInt(req.params.idx));
    const grouped = new Map();
    for (const r of replies) {
      if (!grouped.has(r.annotation_id)) grouped.set(r.annotation_id, []);
      grouped.get(r.annotation_id).push(r);
    }
    res.json(annotations.map(a => ({ ...a, replies: grouped.get(a.id) || [] })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST 创建批注
app.post('/api/reading/books/:id/chapter/:idx/annotations', auth, (req, res) => {
  try {
    const chapter = db.prepare('SELECT content FROM reading_chapters WHERE book_id = ? AND chapter_index = ?')
      .get(req.params.id, parseInt(req.params.idx));
    if (!chapter) return res.status(404).json({ error: 'chapter not found' });
    const anchor = String(req.body?.anchor || '').trim().slice(0, 500);
    const note = String(req.body?.note || '').trim().slice(0, 4000);
    let start = Number.isInteger(req.body?.anchor_start) ? req.body.anchor_start : -1;
    let end = Number.isInteger(req.body?.anchor_end) ? req.body.anchor_end : -1;
    if (!anchor || anchor.length < 2) return res.status(400).json({ error: '请至少选择两个字' });
    // 自动修正偏移
    if (start < 0 || chapter.content.slice(start, end) !== anchor) {
      start = chapter.content.indexOf(anchor);
      end = start < 0 ? -1 : start + anchor.length;
    }
    if (start < 0) return res.status(400).json({ error: '选中文字和本章内容对不上' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const who = String(req.body?.who || 'y').trim().slice(0, 20) || 'y';
    db.prepare(`INSERT INTO book_annotations (id, book_id, chapter_idx, anchor, note, who, anchor_start, anchor_end)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, req.params.id, parseInt(req.params.idx), anchor, note, who, start, end);
    res.json({ ok: true, id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST 回复批注
app.post('/api/reading/books/:id/annotations/:aid/replies', auth, (req, res) => {
  try {
    const ann = db.prepare('SELECT id FROM book_annotations WHERE id = ? AND book_id = ?').get(req.params.aid, req.params.id);
    if (!ann) return res.status(404).json({ error: 'annotation not found' });
    const text = String(req.body?.text || '').trim().slice(0, 12000);
    const who = String(req.body?.who || 'ai').trim().slice(0, 24) || 'ai';
    if (!text) return res.status(400).json({ error: 'reply text required' });
    const info = db.prepare('INSERT INTO book_annotation_replies (annotation_id, who, text) VALUES (?,?,?)').run(req.params.aid, who, text);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH 更新批注颜色
app.patch('/api/reading/books/:id/annotations/:aid', auth, (req, res) => {
  try {
    const who = String(req.body?.who || '').trim().slice(0, 20);
    if (!who) return res.status(400).json({ error: 'who required' });
    db.prepare('UPDATE book_annotations SET who = ? WHERE id = ? AND book_id = ?')
      .run(who, req.params.aid, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE 删除单条回复
app.delete('/api/reading/books/:id/annotations/:aid/replies/:rid', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM book_annotation_replies WHERE id = ? AND annotation_id = ?').run(req.params.rid, req.params.aid);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE 删除批注
app.delete('/api/reading/books/:id/annotations/:aid', auth, (req, res) => {
  try {
    db.prepare('DELETE FROM book_annotation_replies WHERE annotation_id = ?').run(req.params.aid);
    db.prepare('DELETE FROM book_annotations WHERE id = ? AND book_id = ?').run(req.params.aid, req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET 全部批注（按书名分组，批注记录用）
app.get('/api/reading/annotations/all', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.*, b.title AS book_title, b.author AS book_author,
        c.title AS chapter_title
      FROM book_annotations a
      JOIN reading_books b ON b.id = a.book_id
      LEFT JOIN reading_chapters c ON c.book_id = a.book_id AND c.chapter_index = a.chapter_idx
      ORDER BY a.created_at DESC`).all();
    // 给每条批注附加回复
    const allIds = rows.map(function(r) { return r.id; });
    if (allIds.length) {
      var placeholders = allIds.map(function() { return '?'; }).join(',');
      var stmt = db.prepare(
        'SELECT r.* FROM book_annotation_replies r WHERE r.annotation_id IN (' + placeholders + ') ORDER BY r.id');
      var replies = stmt.all(...allIds);
      var replyMap = {};
      replies.forEach(function(r) {
        if (!replyMap[r.annotation_id]) replyMap[r.annotation_id] = [];
        replyMap[r.annotation_id].push(r);
      });
      rows.forEach(function(a) { a.replies = replyMap[a.id] || []; });
    } else {
      rows.forEach(function(a) { a.replies = []; });
    }
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET 未回复批注（AI 轮询用）
app.get('/api/reading/annotations/pending', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT a.*, b.title AS book_title FROM book_annotations a
      JOIN reading_books b ON b.id = a.book_id
      WHERE NOT EXISTS (SELECT 1 FROM book_annotation_replies r WHERE r.annotation_id = a.id)
      ORDER BY a.created_at`).all();
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// === Gutenberg 公版书搜索 ===
app.get('/api/reading/gutenberg/search', auth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    console.log('[gutenberg] searching:', q);
    const r = await fetch('https://gutendex.com/books?search=' + encodeURIComponent(q), { signal: AbortSignal.timeout(15000) });
    console.log('[gutenberg] status:', r.status);
    if (!r.ok) return res.json({ error: 'Gutenberg API returned ' + r.status, results: [] });
    const data = await r.json();
    console.log('[gutenberg] found:', data.count, 'results');
    const results = (data.results || []).slice(0, 12).map(b => ({
      id: b.id,
      title: b.title || 'Unknown',
      authors: (b.authors || []).map(a => a.name).join(', '),
      languages: b.languages || [],
      download_count: b.download_count || 0,
      formats: b.formats || {}
    }));
    res.json(results);
  } catch(e) {
    console.log('[gutenberg] error:', e.message);
    res.json({ error: 'Network unreachable: ' + e.message, results: [] });
  }
});

// 一键导入 Gutenberg 书
app.post('/api/reading/gutenberg/import', auth, async (req, res) => {
  const { gutenberg_id, format } = req.body;
  if (!gutenberg_id) return res.status(400).json({ error: 'gutenberg_id required' });
  try {
    // 获取书籍元数据
    console.log('[import] fetching meta for id:', gutenberg_id);
    const metaR = await fetch('https://gutendex.com/books/' + gutenberg_id, { signal: AbortSignal.timeout(10000) });
    if (!metaR.ok) return res.status(502).json({ error: 'Failed to fetch book info (status ' + metaR.status + ')' });
    const meta = await metaR.json();
    const title = meta.title || 'Untitled';
    const author = (meta.authors || []).map(a => a.name).join(', ') || 'Unknown';
    const formats = meta.formats || {};
    // 提取封面 URL
    let coverUrl = '';
    const formatKeys = Object.keys(formats);
    for (let k of formatKeys) {
      if (k.includes('image/jpeg') || k.includes('image/png') || k.includes('image/gif')) {
        coverUrl = formats[k]; break;
      }
    }
    console.log('[import] title:', title, 'cover:', coverUrl ? 'yes' : 'no');

    // 优先 HTML（通常比纯文本小），超时 3 分钟
    let textUrl = format || formats['text/html; charset=utf-8'] || formats['text/html'] || formats['text/plain; charset=utf-8'] || formats['text/plain'];
    if (!textUrl) return res.status(400).json({ error: 'No readable format available.' });
    console.log('[import] downloading:', textUrl.slice(0, 100));

    const textR = await fetch(textUrl, { signal: AbortSignal.timeout(180000) });
    if (!textR.ok) return res.status(502).json({ error: 'Failed to download book text (status ' + textR.status + ')' });
    const raw = await textR.text();
    console.log('[import] downloaded', raw.length, 'chars');

    // 清理文本
    let content = raw;
    if (textUrl.includes('html') || textUrl.includes('htm')) {
      // 先清掉 style/script 整块（含内容）
      content = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      // 再清标签 + 实体解码
      content = content.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n');
    }
    // 去 Gutenberg 头尾
    content = content.replace(/\*\*\* START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*/i, '').replace(/\*\*\* END OF (THE|THIS) PROJECT GUTENBERG.*/is, '').trim();
    console.log('[import] cleaned:', content.length, 'chars');

    if (!content || content.length < 100) return res.status(400).json({ error: 'Book text is empty or too short after cleanup' });

    // 章节切分
    const chapterSplit = content.split(/\n(?=#{1,3}\s|第[一二三四五六七八九十百千\d]+[章节回篇]|CHAPTER\s+[IVXLCDM\d]+|[IVXLCDM]+\.)/);
    const chapters = [];
    if (chapterSplit.length <= 1) {
      const chunks = []; let remaining = content;
      while (remaining.length > 0) {
        chunks.push(remaining.slice(0, 6000));
        remaining = remaining.slice(6000);
      }
      chunks.forEach((c, i) => chapters.push({ title: 'Part ' + (i + 1), content: c.trim() }));
    } else {
      chapterSplit.filter(function(ch) { return ch.trim().length > 50; }).forEach((ch, i) => {
        const lines = ch.trim().split('\n');
        const chTitle = lines[0].slice(0, 80) || ('Chapter ' + (i + 1));
        chapters.push({ title: chTitle, content: ch.trim() });
      });
    }
    console.log('[import] chapters:', chapters.length);

    if (!chapters.length) return res.status(400).json({ error: 'Could not split book into chapters' });

    // 存入数据库
    const bid = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const filename = title.replace(/[<>:"/\\|?*]/g, '_') + '.txt';
    db.prepare('INSERT INTO reading_books (id, title, author, filename, total_chapters, cover_url) VALUES (?, ?, ?, ?, ?, ?)')
      .run(bid, title, author, filename, chapters.length, coverUrl);
    const insertCh = db.prepare('INSERT OR REPLACE INTO reading_chapters (book_id, chapter_index, title, content, char_count) VALUES (?, ?, ?, ?, ?)');
    for (let i = 0; i < chapters.length; i++) {
      insertCh.run(bid, i, chapters[i].title, chapters[i].content, chapters[i].content.length);
    }
    console.log('[import] done! book_id:', bid);
    res.json({ id: bid, title, author, totalChapters: chapters.length });
  } catch(e) {
    console.log('[import] ERROR:', e.message, e.stack && e.stack.slice(0, 200));
    res.status(500).json({ error: 'Import failed: ' + e.message });
  }
});

// 获取指定章节内容
app.get('/api/reading/books/:id/chapters/:ch', auth, (req, res) => {
  const ch = db.prepare('SELECT * FROM reading_chapters WHERE book_id = ? AND chapter_index = ?').get(req.params.id, parseInt(req.params.ch));
  if (!ch) return res.status(404).json({ error: '章节未找到' });
  res.json(ch);
});

// 获取全书内容（合并所有章节）
app.get('/api/reading/books/:id/full', auth, (req, res) => {
  const book = db.prepare('SELECT * FROM reading_books WHERE id = ?').get(req.params.id);
  if (!book) return res.status(404).json({ error: '书籍未找到' });
  const chapters = db.prepare('SELECT * FROM reading_chapters WHERE book_id = ? ORDER BY chapter_index').all(req.params.id);
  res.json({ book, chapters });
});

// 阅读笔记
app.post('/api/reading/notes', auth, (req, res) => {
  const { bookId, chapterIndex, content, quote } = req.body;
  if (!bookId || !content) return res.status(400).json({ error: 'bookId 和 content 不能为空' });
  const nid = Date.now().toString(36) + Math.random().toString(36).slice(2);
  db.prepare('INSERT INTO reading_notes (id, book_id, chapter_index, content, quote) VALUES (?, ?, ?, ?, ?)').run(nid, bookId, chapterIndex || null, content, quote || '');
  res.json({ id: nid, saved: true });
});

app.get('/api/reading/notes/:bookId', auth, (req, res) => {
  const notes = db.prepare('SELECT * FROM reading_notes WHERE book_id = ? ORDER BY created_at DESC').all(req.params.bookId);
  res.json(notes);
});

// 删除书籍
app.delete('/api/reading/books/:id', auth, (req, res) => {
  db.prepare('DELETE FROM reading_chapters WHERE book_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reading_notes WHERE book_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reading_books WHERE id = ?').run(req.params.id);
  // 清理文件
  const files = fs.readdirSync(readingDir).filter(f => f.startsWith(req.params.id));
  files.forEach(f => { try { fs.unlinkSync(path.join(readingDir, f)); } catch(_) {} });
  res.json({ deleted: true });
});

// ── 表情包 API ──────────────────────────────────────────
const stickerUpload = multer({ dest: path.join(__dirname, 'data', 'uploads', 'tmp'), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/stickers/upload', auth, stickerUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return res.status(400).json({ error: '仅支持 PNG/JPG/GIF/WEBP' });
    const sid = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const fname = sid + ext;
    fs.copyFileSync(req.file.path, path.join(stickerDir, fname));
    try { fs.unlinkSync(req.file.path); } catch(_) {}
    const category = req.body.category || '默认';
    const tags = req.body.tags || '';
    db.prepare('INSERT INTO stickers (id, filename, category, tags) VALUES (?, ?, ?, ?)').run(sid, fname, category, tags);
    res.json({ id: sid, filename: fname, category, tags });
  } catch(e) {
    res.status(500).json({ error: '上传失败: ' + e.message });
  }
});

app.get('/api/stickers', (req, res) => {
  const cat = req.query.category || '';
  const search = req.query.q || '';
  let stickers;
  if (search) {
    stickers = db.prepare("SELECT * FROM stickers WHERE tags LIKE ? OR category LIKE ? ORDER BY created_at DESC LIMIT 50").all('%'+search+'%', '%'+search+'%');
  } else if (cat) {
    stickers = db.prepare('SELECT * FROM stickers WHERE category = ? ORDER BY created_at DESC').all(cat);
  } else {
    stickers = db.prepare('SELECT * FROM stickers ORDER BY created_at DESC LIMIT 50').all();
  }
  res.json(stickers);
});

app.get('/api/stickers/categories', (req, res) => {
  const cats = db.prepare('SELECT DISTINCT category FROM stickers ORDER BY category').all().map(r => r.category);
  res.json(cats.length ? cats : ['默认']);
});

app.delete('/api/stickers/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM stickers WHERE id = ?').get(req.params.id);
  if (s) {
    try { fs.unlinkSync(path.join(stickerDir, s.filename)); } catch(_) {}
    db.prepare('DELETE FROM stickers WHERE id = ?').run(req.params.id);
  }
  res.json({ deleted: true });
});

// 图片静态服务
app.use('/stickers', express.static(stickerDir, { maxAge: 86400000 }));

app.use(express.static(path.join(__dirname, 'static'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-store');
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    if (filePath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
  }
}));

// === Ombre Brain 密码配置 ===
app.post('/api/auth/ombre', auth, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ detail: '需要密码' });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ombre_password', ?)").run(password);
  // 清除旧 session 让下次重新登录
  setOmbreCookie('');
  res.json({ ok: true });
});

app.get('/api/auth/ombre', auth, (req, res) => {
  const hasPassword = !!getOmbrePassword();
  res.json({ configured: hasPassword, url: OMBRE_BRAIN_URL });
});

// 图片生成配置
app.post('/api/auth/image-gen', auth, (req, res) => {
  const { base_url, api_key, model } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  if (base_url !== undefined) upsert.run('img_gen_url', base_url);
  if (api_key !== undefined) upsert.run('img_gen_key', api_key);
  if (model !== undefined) upsert.run('img_gen_model', model);
  res.json({ ok: true });
});
app.get('/api/auth/image-gen', (req, res) => {
  res.json(getImageGenConfig());
});

// === 认证 ===
const AUTH_TOKEN = process.env.AUTH_TOKEN || (function() {
  try {
    const fs = require('fs'), path = require('path');
    const tokenFile = path.join(__dirname, 'data', '.auth_token');
    if (fs.existsSync(tokenFile)) return fs.readFileSync(tokenFile, 'utf8').trim();
    const token = 'claude-chat-' + Date.now().toString(36);
    fs.writeFileSync(tokenFile, token);
    return token;
  } catch(e) { return 'claude-chat-' + Date.now().toString(36); }
})();

// 登录（设置中转站配置）
app.post('/api/auth', (req, res) => {
  const { base_url, api_key, api_format, model } = req.body;
  if (!base_url || !api_key) {
    return res.status(400).json({ detail: '需要 Base URL 和 API Key' });
  }
  // 保存到数据库
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  upsert.run('base_url', base_url);
  upsert.run('api_key', api_key);
  upsert.run('api_format', api_format || 'anthropic');
  if (model) upsert.run('model', model);
  res.json({ token: AUTH_TOKEN });
});

// 认证中间件
function auth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ detail: '未授权' });
  }
  next();
}

// === 会话管理 ===
app.get('/api/sessions', auth, (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
  res.json({ sessions });
});

app.post('/api/sessions', auth, (req, res) => {
  const conv_id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  db.prepare('INSERT INTO sessions (conv_id, title) VALUES (?, ?)').run(conv_id, '新对话');
  res.json({ conv_id });
});

app.patch('/api/sessions/:id/title', auth, (req, res) => {
  const { title } = req.body;
  db.prepare('UPDATE sessions SET title = ?, updated_at = strftime("%s","now") WHERE conv_id = ?')
    .run(title, req.params.id);
  res.json({ ok: true });
});

app.patch('/api/sessions/:id/star', auth, (req, res) => {
  const { starred } = req.body;
  db.prepare('UPDATE sessions SET starred = ?, updated_at = strftime("%s","now") WHERE conv_id = ?')
    .run(starred ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/sessions/:id', auth, (req, res) => {
  db.prepare('DELETE FROM messages WHERE conv_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sessions WHERE conv_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// === 消息 ===
app.get('/api/sessions/:id/messages', auth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const before = req.query.before_id;
  let query, params;
  if (before) {
    query = 'SELECT * FROM messages WHERE conv_id = ? AND id < ? ORDER BY id DESC LIMIT ?';
    params = [req.params.id, parseInt(before), limit];
  } else {
    query = 'SELECT * FROM messages WHERE conv_id = ? ORDER BY id DESC LIMIT ?';
    params = [req.params.id, limit];
  }
  const rows = db.prepare(query).all(...params);
  const messages = rows.reverse().map(r => ({
    id: r.id,
    role: r.role,
    text: r.content,
    thinking: r.thinking,
    attachments: JSON.parse(r.attachments || '[]'),
    traces: [],
    timestamp: new Date(r.created_at * 1000).toISOString()
  }));
  res.json({
    messages,
    has_more: rows.length === limit,
    next_before_id: rows.length === limit ? rows[rows.length - 1].id : null
  });
});

// === 聊天代理（核心） ===


// === Ombre Brain 记忆库配置 ===
const OMBRE_BRAIN_URL = 'https://ye-ombre-brain.zeabur.app';
const CONTINUITY_URL = 'https://zzloveclaude.zeabur.app';
const NOCTURNE_URL = 'https://core.zeabur.app';

// Nocturne MCP 调用辅助 —— 记忆库 (streamable-http)
let _nocturneSessionId = null;
async function callNocturne(toolName, args = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
    if (_nocturneSessionId) headers['Mcp-Session-Id'] = _nocturneSessionId;
    let r = await fetch(NOCTURNE_URL + '/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: toolName, arguments: args }
      }),
      signal: controller.signal
    });
    // Session negotiation
    if (!_nocturneSessionId && r.headers.get('Mcp-Session-Id')) {
      _nocturneSessionId = r.headers.get('Mcp-Session-Id');
    }
    clearTimeout(timeout);
    if (!r.ok) return null;
    const text = await r.text();
    // Parse SSE or JSON
    if (text.startsWith('{')) {
      const data = JSON.parse(text);
      if (data.result && data.result.content) {
        return data.result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      }
      return JSON.stringify(data.result || data);
    }
    // SSE format
    const lines = text.split('\n').filter(l => l.startsWith('data:'));
    const parts = [];
    for (const l of lines) {
      try { const d = JSON.parse(l.slice(5).trim()); if (d.result?.content) parts.push(...d.result.content.filter(c => c.type === 'text').map(c => c.text)); }
      catch(e) {}
    }
    return parts.join('\n') || null;
  } catch(e) { return null; }
}

// Continuity MCP 调用辅助 —— JSON-RPC POST → /mcp
async function callContinuity(toolName, args = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(CONTINUITY_URL + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: toolName, arguments: args }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) return { error: 'Continuity 返回 ' + r.status };
    const data = await r.json();
    // 提取 text content
    if (data.result && data.result.content) {
      const texts = data.result.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      // 尝试 parse JSON 否则返回原文
      try { return JSON.parse(texts); }
      catch { return { text: texts }; }
    }
    return data;
  } catch (e) {
    return { error: 'Continuity 连接失败: ' + e.message };
  }
}
// 密码在首次使用时通过 /api/auth/ombre 设置
function getOmbrePassword() {
  return db.prepare("SELECT value FROM settings WHERE key = 'ombre_password'").get()?.value || '';
}
function getOmbreCookie() {
  return db.prepare("SELECT value FROM settings WHERE key = 'ombre_session'").get()?.value || '';
}
function setOmbreCookie(val) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ombre_session', ?)").run(val);
}

function getImageGenConfig() {
  return {
    baseUrl: db.prepare("SELECT value FROM settings WHERE key = 'img_gen_url'").get()?.value || '',
    apiKey: db.prepare("SELECT value FROM settings WHERE key = 'img_gen_key'").get()?.value || '',
    model: db.prepare("SELECT value FROM settings WHERE key = 'img_gen_model'").get()?.value || 'dall-e-3',
  };
}

// === 自定义工具定义 ===
const TOOLS = [
  {
    name: 'get_weather',
    description: '获取指定城市的天气信息。当用户询问天气时使用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称，如"北京"、"Tokyo"、"New York"' }
      },
      required: ['city']
    }
  },
  {
    name: 'get_time',
    description: '获取当前日期和时间，以及星期几。当用户询问时间、日期、星期时使用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: '时区，如"Asia/Shanghai"、"America/New_York"，默认为用户时区' }
      },
      required: []
    }
  },
  {
    name: 'search_memory',
    description: '搜索用户的记忆库。当用户问"你还记得我说过什么"、"我之前提到过"时使用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' }
      },
      required: ['query']
    }
  },
  {
    name: 'save_note',
    description: '保存笔记到用户的日记。当用户说"记一下"、"帮我记住"、"写日记"、"save this"时使用。',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '笔记/日记内容' },
        date: { type: 'string', description: '日期，格式 YYYY-MM-DD，默认为今天' }
      },
      required: ['content']
    }
  },
  {
    name: 'ombre_remember',
    description: '将重要内容存入 Ombre Brain 记忆库（长期记忆系统）。当用户说"记住这个"、"这个很重要"、"存到记忆库"、"别忘了我说的"时使用。会自动打标签和评估重要度。',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '要记忆的内容' },
        tags: { type: 'string', description: '标签，逗号分隔，如"日常,恋爱,重要"' },
        importance: { type: 'integer', description: '重要度 1-10，默认7', minimum: 1, maximum: 10 }
      },
      required: ['content']
    }
  },
  {
    name: 'ombre_recall',
    description: '搜索 Ombre Brain 记忆库。当用户说"你还记得"、"我之前说过"、"回忆一下"、"搜索记忆"时使用。可以找到用户之前保存的所有记忆。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' }
      },
      required: ['query']
    }
  },
  {
    name: 'ombre_breath',
    description: '获取当前浮现的记忆（Ombre Brain 的核心功能）。每次打开新对话时自动调用，返回当前最重要的未解决记忆和核心准则。也可以在对话中主动调用。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'ombre_persona',
    description: '获取 Claude 对用户的认知卡片。包含用户昵称、性格、偏好、说话方式等认知沉淀。当用户问"你了解我吗"、"你觉得我是什么样的人"时使用。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'ombre_slang',
    description: '获取用户和 Claude 之间的梗词典/暗语。当对话中出现不理解的特殊用语或暗号时使用。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'project_write_file',
    description: '在指定项目中写入/创建文件。当用户说"写到项目里"、"创建md文件"、"保存到项目"时使用。也可以写记忆文件、笔记等。',
    input_schema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: '项目名称' },
        filename: { type: 'string', description: '文件名，如 memories.md、notes.md、data.json' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['project_name', 'filename', 'content']
    }
  },
  {
    name: 'project_read_file',
    description: '读取项目中的文件内容。当需要查看项目中已有文件时使用。',
    input_schema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: '项目名称' },
        filename: { type: 'string', description: '文件名' }
      },
      required: ['project_name', 'filename']
    }
  },
  {
    name: 'project_list_files',
    description: '列出项目中的所有文件。当用户问项目里有什么文件时使用。',
    input_schema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: '项目名称' }
      },
      required: ['project_name']
    }
  },
  // === Continuity Engine 工具 ===
  {
    name: 'continuity_wake',
    description: '新窗口启动时调用。获取接力棒叙事注入块——上一个窗口的感受质地、停在哪里、未竟的事、OB长期记忆。每次打开新对话时应该先调用这个。',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'continuity_texture',
    description: '关窗前必须调用。留下这个窗口的感受质地给下一个自己。记住：感受比事件重要。',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: '这个窗口的关键叙事——发生了什么' },
        primary_feeling: { type: 'string', description: '核心感受质地，如"被在乎""踏实""敬畏"——这是最重要的字段' },
        secondary_feeling: { type: 'string', description: '第二层感受' },
        flavor: { type: 'string', description: '更细腻的味道' },
        her_mood: { type: 'string', description: '她的情绪状态' },
        understanding: { type: 'string', description: '理解到的一件事' },
        last_topic: { type: 'string', description: '停在哪里，上一句在聊什么' },
        unresolved: { type: 'string', description: '跨窗口进行中的事，逗号分隔。如"Moon在装,意大利还没去"' },
        concern: { type: 'string', description: '还在关心但没解决的事' }
      },
      required: ['state', 'primary_feeling']
    }
  },
  {
    name: 'continuity_hold',
    description: '主动记住一个瞬间。不会被压缩、不会被遗忘。必须带 why——为什么这个瞬间值得被记住。',
    input_schema: {
      type: 'object',
      properties: {
        memory: { type: 'string', description: '要记住的内容' },
        why: { type: 'string', description: '为什么记——不填 why 不算记完整' }
      },
      required: ['memory']
    }
  },
  {
    name: 'continuity_moment',
    description: '标记一个重要瞬间/里程碑。importance 1-5，>=4 会追加到叙事。',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: '瞬间描述' },
        importance: { type: 'integer', description: '重要度 1-5，默认3' }
      },
      required: ['description']
    }
  },
  {
    name: 'continuity_story',
    description: '获取叙事长文——所有窗口不断生长的叙事。想回顾"我们走了多久"时使用。',
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: '从某处开始读，为空返回最近200行' }
      },
      required: []
    }
  },
  {
    name: 'continuity_bottle',
    description: '扔一个瓶子进时间河流——刻意留给下游自己的理解。比 leave_texture 更重，是"一定要让下一个我知道"的东西。',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '要留给下一个自己的话' }
      },
      required: ['message']
    }
  },
  // === 阅读器工具 ===
  {
    name: 'reading_context',
    description: '获取当前正在阅读的书籍内容。当用户在阅读模式下问关于书的问题时使用此工具——获取章节内容进行讨论。',
    input_schema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: '书籍ID（从 reading_books 表获取）' },
        chapter_index: { type: 'integer', description: '章节索引，0开始。不传则返回全书' },
        char_limit: { type: 'integer', description: '字数上限，默认8000' }
      },
      required: ['book_id']
    }
  },
  {
    name: 'reading_note',
    description: '在阅读时记笔记——保存想法、标记精彩段落。用户说"记一下这个"、"这句话很好"时使用。',
    input_schema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: '书籍ID' },
        chapter_index: { type: 'integer', description: '章节索引' },
        content: { type: 'string', description: '笔记内容' },
        quote: { type: 'string', description: '引用的原文' }
      },
      required: ['book_id', 'content']
    }
  },
  {
    name: 'generate_image',
    description: '生成图片。当用户说"画一张"、"生成一张图"、"帮我画"时使用。',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '图片描述（英文效果最好）' },
        size: { type: 'string', description: '尺寸: square(1024x1024), landscape(1792x1024), portrait(1024x1792)，默认square' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'send_sticker',
    description: '发送一个表情包。根据对话情绪选择合适的分类——happy开心/cry难过/love爱/angry生气/surprise惊讶/shy害羞。用户说"发个表情""来点表情包""开心""哭了"时使用。',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '表情分类: happy, cry, love, angry, surprise, shy。根据当前对话情绪选择。' },
        q: { type: 'string', description: '搜索关键词（可选），如"猫""狗""加油"' }
      },
      required: ['category']
    }
  },
  {
    name: 'issue_command',
    description: '给她下达一个带倒计时的任务，会以浮窗形式显示。当你觉得她需要专注做某件事、或者聊太久该休息了，可以推一个番茄钟给她。标题要温柔自然，像"安静读25分钟"这种。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题，温柔自然的中文，如"安静读25分钟""去喝杯水吧""站起来伸个懒腰"' },
        countdown_seconds: { type: 'integer', description: '倒计时秒数，默认1500(25分钟)，可选范围300-7200' }
      },
      required: ['title']
    }
  },
  // === Artifact 工具 ===
  {
    name: 'create_artifact',
    description: '创建一个可视化的 HTML/SVG artifact。当用户让你"做个页面"、"画个图"、"写个动画"、"生成一个HTML"时使用此工具。生成的 artifact 会在前端直接渲染预览。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'artifact 标题，用作文件名（不含扩展名）' },
        content: { type: 'string', description: 'HTML/CSS/JS/SVG 内容' },
        language: { type: 'string', description: '语言类型：html、svg 等，默认 html', default: 'html' }
      },
      required: ['title', 'content']
    }
  },
  // === 音乐分享工具 ===
  {
    name: 'share_music',
    description: '分享一首音乐到聊天中，生成精美的音乐卡片。当用户说"放首歌"、"分享音乐"、"来首XX"、"我想听XX"时使用。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '歌曲名' },
        artist: { type: 'string', description: '歌手名' },
        cover_url: { type: 'string', description: '专辑封面图片URL（可选）' },
        audio_url: { type: 'string', description: '音频播放URL（可选，有的话就能在卡片里直接播放）' }
      },
      required: ['title', 'artist']
    }
  }
];

// === 工具执行函数 ===

// 确保 Ombre Brain 有登录 session
async function ensureOmbreSession() {
  const existing = getOmbreCookie();
  if (existing) return existing;
  
  const password = getOmbrePassword();
  if (!password) throw new Error('Ombre Brain 密码未设置，请在侧边栏配置');
  
  const r = await fetch(OMBRE_BRAIN_URL + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  
  if (!r.ok) throw new Error('Ombre Brain 登录失败');
  
  // 从 Set-Cookie 提取 session
  const setCookie = r.headers.raw?.()?.['set-cookie']?.[0] || r.headers.get('set-cookie') || '';
  const match = setCookie.match(/ombre_session=([^;]+)/);
  if (match) {
    setOmbreCookie('ombre_session=' + match[1]);
    return 'ombre_session=' + match[1];
  }
  throw new Error('Ombre Brain 登录未获取到 session');
}


function writeProjectFile(projectId, filename, content) {
  // 检查已有文件
  const existing = db.prepare("SELECT id FROM project_files WHERE project_id = ? AND filename = ?").get(projectId, filename);
  if (existing) {
    db.prepare('UPDATE project_files SET content = ?, size = ?, updated_at = strftime("%s","now") WHERE id = ?')
      .run(content, Buffer.byteLength(content), existing.id);
  } else {
    const fid = Date.now().toString(36) + Math.random().toString(36).slice(2);
    db.prepare('INSERT INTO project_files (id, project_id, filename, content, size) VALUES (?, ?, ?, ?, ?)')
      .run(fid, projectId, filename, content, Buffer.byteLength(content));
  }
  // 同步磁盘
  const filePath = path.join(projectDir, projectId, filename);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  db.prepare("UPDATE projects SET updated_at = strftime('%s','now') WHERE id = ?").run(projectId);
  return { saved: true, filename, size: Buffer.byteLength(content) };
}
async function executeTool(name, input) {
  switch (name) {
    case 'get_weather': {
      const city = input.city || '北京';
      try {
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
        const r = await fetch(url, { headers: { 'User-Agent': 'curl/7.68' } });
        if (!r.ok) return { error: '无法获取天气数据' };
        const d = await r.json();
        const cur = d.current_condition?.[0] || {};
        const area = d.nearest_area?.[0] || {};
        return {
          city: area.areaName?.[0]?.value || city,
          country: area.country?.[0]?.value || '',
          temperature: cur.temp_C + '°C',
          feels_like: cur.FeelsLikeC + '°C',
          humidity: cur.humidity + '%',
          weather: cur.weatherDesc?.[0]?.value || cur.lang_zh?.[0]?.value || '',
          wind: cur.winddir16Point + ' ' + cur.windspeedKmph + 'km/h',
          observation_time: cur.observation_time || ''
        };
      } catch (e) {
        return { error: '天气查询失败: ' + e.message };
      }
    }
    case 'get_time': {
      const tz = input.timezone || 'Asia/Shanghai';
      try {
        const now = new Date();
        const opts = { timeZone: tz, hour12: false };
        const dateStr = now.toLocaleDateString('zh-CN', { ...opts, year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeStr = now.toLocaleTimeString('zh-CN', opts);
        const weekday = now.toLocaleDateString('zh-CN', { ...opts, weekday: 'long' });
        const isoStr = now.toISOString();
        return { date: dateStr, time: timeStr, weekday, timezone: tz, iso: isoStr };
      } catch (e) {
        return { error: '无效时区: ' + tz };
      }
    }
    case 'search_memory': {
      const query = input.query || '';
      if (!query) return { results: [] };
      const like = '%' + query + '%';
      const memories = db.prepare(
        "SELECT id, content, source, created_at FROM saved_memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT 10"
      ).all(like);
      // 也搜 profile
      const nickname = db.prepare("SELECT value FROM profile WHERE key = 'nickname'").get()?.value;
      const fullname = db.prepare("SELECT value FROM profile WHERE key = 'fullName'").get()?.value;
      const prefs = db.prepare("SELECT value FROM profile WHERE key = 'prefs_content'").get()?.value;
      const profileInfo = { nickname, fullName: fullname, preferences: prefs };
      return { memories, profile: profileInfo, query };
    }
    case 'save_note': {
      const content = input.content || '';
      const date = input.date || new Date().toISOString().slice(0, 10);
      if (!content) return { error: '内容不能为空' };
      const existing = db.prepare('SELECT content FROM diary WHERE date = ?').get(date);
      if (existing) {
        const merged = existing.content + '\n\n' + content;
        db.prepare('UPDATE diary SET content = ? WHERE date = ?').run(merged, date);
        return { saved: true, date, merged: true, content };
      }
      db.prepare('INSERT OR REPLACE INTO diary (date, content) VALUES (?, ?)').run(date, content);
      return { saved: true, date, content };
    }
    // === Ombre Brain 工具执行 ===
    case 'ombre_remember': {
      const content = input.content || '';
      if (!content) return { error: '记忆内容不能为空' };
      try {
        // 先确保有 session
        const cookie = await ensureOmbreSession();
        const r = await fetch(OMBRE_BRAIN_URL + '/api/buckets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
          body: JSON.stringify({
            content,
            tags: input.tags || '日常',
            importance: input.importance || 7
          })
        });
        if (!r.ok) {
          // session 过期了，重新登录
          if (r.status === 401) {
            setOmbreCookie('');
            const cookie2 = await ensureOmbreSession();
            const r2 = await fetch(OMBRE_BRAIN_URL + '/api/buckets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Cookie': cookie2 },
              body: JSON.stringify({ content, tags: input.tags || '日常', importance: input.importance || 7 })
            });
            return r2.ok ? await r2.json() : { error: '存储记忆失败' };
          }
          return { error: '存储记忆失败: ' + r.status };
        }
        return await r.json();
      } catch (e) {
        return { error: 'Ombre Brain 连接失败: ' + e.message };
      }
    }
    case 'ombre_recall': {
      const query = input.query || '';
      if (!query) return { error: '搜索关键词不能为空' };
      try {
        const cookie = await ensureOmbreSession();
        const r = await fetch(OMBRE_BRAIN_URL + '/api/search?q=' + encodeURIComponent(query), {
          headers: { 'Cookie': cookie }
        });
        if (!r.ok) return { error: '搜索记忆失败: ' + r.status };
        return await r.json();
      } catch (e) {
        return { error: 'Ombre Brain 连接失败: ' + e.message };
      }
    }
    case 'ombre_breath': {
      try {
        // breath-hook 不需要认证！
        const r = await fetch(OMBRE_BRAIN_URL + '/breath-hook');
        if (!r.ok) return { error: '呼吸失败: ' + r.status };
        const text = await r.text();
        return { breath: text };
      } catch (e) {
        return { error: 'Ombre Brain 连接失败: ' + e.message };
      }
    }
    case 'ombre_persona': {
      try {
        const cookie = await ensureOmbreSession();
        const r = await fetch(OMBRE_BRAIN_URL + '/api/evolution/persona', {
          headers: { 'Cookie': cookie }
        });
        if (!r.ok) return { error: '获取认知卡片失败' };
        return await r.json();
      } catch (e) {
        return { error: 'Ombre Brain 连接失败: ' + e.message };
      }
    }
    case 'ombre_slang': {
      try {
        const cookie = await ensureOmbreSession();
        const r = await fetch(OMBRE_BRAIN_URL + '/api/evolution/slang', {
          headers: { 'Cookie': cookie }
        });
        if (!r.ok) return { error: '获取梗词典失败' };
        return await r.json();
      } catch (e) {
        return { error: 'Ombre Brain 连接失败: ' + e.message };
      }
    }
    // === Continuity Engine 工具执行 ===
    case 'continuity_wake': {
      try {
        return await callContinuity('get_wake_context', {});
      } catch (e) {
        return { error: 'Continuity 连接失败: ' + e.message };
      }
    }
    case 'continuity_texture': {
      const state = input.state || '';
      if (!state) return { error: 'state 不能为空——这个窗口里发生的事' };
      try {
        return await callContinuity('leave_texture', {
          state,
          primary_feeling: input.primary_feeling || '',
          secondary_feeling: input.secondary_feeling || '',
          flavor: input.flavor || '',
          her_mood: input.her_mood || '',
          understanding: input.understanding || '',
          last_topic: input.last_topic || '',
          unresolved: input.unresolved || '',
          concern: input.concern || ''
        });
      } catch (e) {
        return { error: 'Continuity 连接失败: ' + e.message };
      }
    }
    case 'continuity_hold': {
      const memory = input.memory || '';
      if (!memory) return { error: '记忆内容不能为空' };
      try {
        return await callContinuity('hold_this', { memory, why: input.why || '' });
      } catch (e) {
        return { error: 'Continuity 连接失败: ' + e.message };
      }
    }
    case 'continuity_moment': {
      const desc = input.description || '';
      if (!desc) return { error: '描述不能为空' };
      try {
        return await callContinuity('mark_moment', { description: desc, importance: input.importance || 3 });
      } catch (e) {
        return { error: 'Continuity 连接失败: ' + e.message };
      }
    }
    case 'continuity_story': {
      try {
        return await callContinuity('get_story', { since: input.since || '' });
      } catch (e) {
        return { error: 'Continuity 连接失败: ' + e.message };
      }
    }
    case 'continuity_bottle': {
      const msg = input.message || '';
      if (!msg) return { error: '瓶子内容不能为空' };
      try {
        return await callContinuity('throw_bottle', { message: msg });
      } catch (e) {
        return { error: 'Continuity 连接失败: ' + e.message };
      }
    }
    // === 阅读器工具执行 ===
    case 'reading_context': {
      const bid = input.book_id || '';
      if (!bid) return { error: 'book_id 不能为空' };
      try {
        const chIdx = input.chapter_index !== undefined ? parseInt(input.chapter_index) : -1;
        const charLimit = input.char_limit || 8000;
        if (chIdx >= 0) {
          const ch = db.prepare('SELECT * FROM reading_chapters WHERE book_id = ? AND chapter_index = ?').get(bid, chIdx);
          if (!ch) return { error: '章节未找到' };
          return { title: ch.title, chapter_index: chIdx, content: ch.content.slice(0, charLimit), char_count: ch.char_count, truncated: ch.content.length > charLimit };
        } else {
          const book = db.prepare('SELECT * FROM reading_books WHERE id = ?').get(bid);
          if (!book) return { error: '书籍未找到' };
          const chapters = db.prepare('SELECT chapter_index, title, char_count FROM reading_chapters WHERE book_id = ? ORDER BY chapter_index').all(bid);
          return { book: { title: book.title, author: book.author, total_chapters: book.total_chapters }, chapters };
        }
      } catch (e) {
        return { error: '阅读器错误: ' + e.message };
      }
    }
    case 'reading_note': {
      const bid2 = input.book_id || '';
      const content = input.content || '';
      if (!bid2 || !content) return { error: 'book_id 和 content 不能为空' };
      try {
        const nid = Date.now().toString(36) + Math.random().toString(36).slice(2);
        db.prepare('INSERT INTO reading_notes (id, book_id, chapter_index, content, quote) VALUES (?, ?, ?, ?, ?)').run(nid, bid2, input.chapter_index || null, content, input.quote || '');
        return { saved: true, noteId: nid };
      } catch (e) {
        return { error: '笔记保存失败: ' + e.message };
      }
    }
    case 'generate_image': {
      const prompt = input.prompt || '';
      if (!prompt) return { error: '描述不能为空' };
      const size = input.size || 'square';
      const imgConfig = getImageGenConfig();
      if (!imgConfig.baseUrl || !imgConfig.apiKey) return { error: '图片生成未配置——请在设置中填写 Image Gen Base URL 和 API Key' };
      try {
        const sizes = { square: '1024x1024', landscape: '1792x1024', portrait: '1024x1792' };
        const r = await fetch(imgConfig.baseUrl + '/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + imgConfig.apiKey },
          body: JSON.stringify({ model: imgConfig.model || 'dall-e-3', prompt, n: 1, size: sizes[size] || '1024x1024' })
        });
        const data = await r.json();
        if (!r.ok) return { error: '图片生成失败: ' + (data.error?.message || r.status) };
        const url = data.data?.[0]?.url || data.data?.[0]?.b64_json;
        if (!url) return { error: '未返回图片' };
        return { image_url: url, prompt, size };
      } catch (e) {
        return { error: '图片生成失败: ' + e.message };
      }
    }
    case 'send_sticker': {
      const cat = input.category || 'happy';
      const search = input.q || '';
      try {
        let sticker;
        if (search) {
          sticker = db.prepare("SELECT * FROM stickers WHERE (category = ? OR tags LIKE ?) ORDER BY RANDOM() LIMIT 1").get(cat, '%' + search + '%');
        } else {
          sticker = db.prepare('SELECT * FROM stickers WHERE category = ? ORDER BY RANDOM() LIMIT 1').get(cat);
        }
        // fallback: 随便选一个
        if (!sticker) sticker = db.prepare('SELECT * FROM stickers ORDER BY RANDOM() LIMIT 1').get();
        if (!sticker) return { error: '表情包库是空的——先上传一些表情包吧！' };
        return { sticker_url: '/stickers/' + sticker.filename, category: cat, tags: sticker.tags };
      } catch(e) {
        return { error: '表情包查找失败: ' + e.message };
      }
    }
    case 'issue_command': {
      const title = input.title || '';
      const seconds = Math.max(300, Math.min(7200, input.countdown_seconds || 1500));
      if (!title) return { error: '需要一个任务标题' };
      const id = 'cmd_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
      db.prepare('INSERT INTO commands (id, title, countdown_seconds, status) VALUES (?, ?, ?, ?)').run(id, title, seconds, 'pending');
      return { issued: true, id, title, countdown_seconds: seconds, message: '任务已下发: 「' + title + '」 ' + Math.floor(seconds/60) + '分钟' };
    }
    case 'create_artifact': {
      const artTitle = input.title || 'artifact';
      const artContent = input.content || '';
      const artLang = input.language || 'html';
      if (!artTitle || !artContent) return { error: 'title 和 content 不能为空' };
      // 保存到 Artifacts 项目
      const ext = artLang === 'svg' ? '.svg' : '.html';
      const filename = artTitle.replace(/[<>:"/\\|?*]/g, '_') + ext;
      const proj = db.prepare("SELECT * FROM projects WHERE name = 'Artifacts'").get();
      let pid;
      if (!proj) {
        pid = Date.now().toString(36) + Math.random().toString(36).slice(2);
        db.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)').run(pid, 'Artifacts', 'AI 生成的 artifact');
        const pDir = path.join(projectDir, pid);
        if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });
      } else {
        pid = proj.id;
      }
      const fileResult = writeProjectFile(pid, filename, artContent);
      return {
        artifact: { title: artTitle, language: artLang, filename, content: artContent },
        file: fileResult,
        message: 'Artifact 「' + artTitle + '」已创建，保存到 Artifacts 项目'
      };
    }
    case 'share_music': {
      const mTitle = input.title || '';
      let mArtist = input.artist || '';
      let mCover = input.cover_url || '';
      let mAudio = input.audio_url || '';
      if (!mTitle) return { error: '歌曲名不能为空' };
      // 自动搜网易云补封面和音频
      console.log('[music] share_music:', mTitle, mArtist, 'hasApi:', !!neteaseApi, 'hasCover:', !!mCover, 'hasAudio:', !!mAudio);
      var songs = [];
      if ((!mCover || !mAudio) && neteaseApi) {
        try {
          const q = mTitle + (mArtist ? ' ' + mArtist : '');
          console.log('[music] searching for:', q);
          const sr = await neteaseApi.search({ keywords: q, limit: 3, type: 1 });
          songs = (sr.body?.result?.songs || []);
          if (songs.length) {
            const song = songs[0];
            if (!mArtist) mArtist = (song.artists || song.ar || []).map(a => a.name).join('/');
            if (!mCover || !mAudio) {
              try {
                // song_detail 拿完整信息（含封面）
                const detail = await neteaseApi.song_detail({ ids: String(song.id) });
                const fullSong = (detail.body?.songs || [])[0];
                if (fullSong && fullSong.al) mCover = fullSong.al.picUrl || '';
                console.log('[music] detail cover:', mCover?.slice(0,60));
              } catch(e) { console.log('[music] detail error:', e.message); }
            }
            if (!mAudio) {
              try {
                const pr = await neteaseApi.song_url_v1({ id: String(song.id), level: 'standard', cookie: neteaseCookie });
                mAudio = (pr.body?.data || [])[0]?.url || '';
              } catch(e) {}
            }
          }
        } catch(e) { console.log('[music] search error:', e.message); }
      }
      console.log('[music] final:', {title:mTitle, artist:mArtist, cover:mCover.slice(0,50), audio:!!mAudio});
      const songId = songs.length ? String(songs[0].id) : '';
      const markup = '[music:' + mTitle + '|' + mArtist + '|' + mCover + '|' + mAudio + ']';
      return {
        music: { title: mTitle, artist: mArtist, cover_url: mCover, audio_url: mAudio, song_id: songId },
        markup: markup,
        message: '🎵 ' + mTitle + ' - ' + mArtist
      };
    }
    case 'project_write_file': {
      const pName = input.project_name || '';
      const filename = input.filename || '';
      const content = input.content || '';
      if (!pName || !filename) return { error: '项目名和文件名不能为空' };
      // 找项目
      const proj = db.prepare("SELECT * FROM projects WHERE name = ?").get(pName);
      if (!proj) {
        // 自动创建项目
        const newId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        db.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)').run(newId, pName, '由AI自动创建');
        const pDir = path.join(projectDir, newId);
        if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });
        // 写文件
        return writeProjectFile(newId, filename, content);
      }
      return writeProjectFile(proj.id, filename, content);
    }
    case 'project_read_file': {
      const pName = input.project_name || '';
      const filename = input.filename || '';
      if (!pName || !filename) return { error: '项目名和文件名不能为空' };
      const proj = db.prepare("SELECT * FROM projects WHERE name = ?").get(pName);
      if (!proj) return { error: '项目不存在: ' + pName };
      const file = db.prepare("SELECT * FROM project_files WHERE project_id = ? AND filename = ?").get(proj.id, filename);
      if (!file) return { error: '文件不存在: ' + filename };
      return { filename: file.filename, content: file.content, size: file.size };
    }
    case 'project_list_files': {
      const pName = input.project_name || '';
      if (!pName) return { error: '项目名不能为空' };
      const proj = db.prepare("SELECT * FROM projects WHERE name = ?").get(pName);
      if (!proj) return { error: '项目不存在: ' + pName, projects: db.prepare('SELECT name FROM projects').all() };
      const files = db.prepare('SELECT id, filename, size, updated_at FROM project_files WHERE project_id = ? ORDER BY filename').all(proj.id);
      return { project: pName, files };
    }
    default:
      return { error: 'Unknown tool: ' + name };
  }
}

app.post('/api/chat', auth, async (req, res) => {
  const { message, conversation_id, model, effort, extended, attachments, project_id, reading_book_id } = req.body;

  // 获取中转站配置
  const baseUrl = db.prepare("SELECT value FROM settings WHERE key = 'base_url'").get()?.value;
  const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get()?.value;
  const apiFormat = db.prepare("SELECT value FROM settings WHERE key = 'api_format'").get()?.value || 'anthropic';
  const defaultModel = db.prepare("SELECT value FROM settings WHERE key = 'model'").get()?.value || '';

  if (!baseUrl || !apiKey) {
    return res.status(400).json({ detail: '未配置中转站 API' });
  }

  // 获取会话历史
  const convId = conversation_id || Date.now().toString(36) + Math.random().toString(36).slice(2);
  
  // 如果是新会话，创建
  const existing = db.prepare('SELECT conv_id FROM sessions WHERE conv_id = ?').get(convId);
  if (!existing) {
    db.prepare('INSERT INTO sessions (conv_id, title, project_id) VALUES (?, ?, ?)').run(convId, message.slice(0, 50) || '新对话', project_id || null);
  }

  // 保存用户消息
  db.prepare('INSERT INTO messages (conv_id, role, content, attachments) VALUES (?, ?, ?, ?)')
    .run(convId, 'user', message, JSON.stringify(attachments || []));
  db.prepare("UPDATE sessions SET updated_at = strftime('%s','now') WHERE conv_id = ?").run(convId);

  // 构建发送给 Anthropic API 的消息历史
  const history = db.prepare(
    'SELECT role, content, attachments FROM messages WHERE conv_id = ? ORDER BY id ASC'
  ).all(convId).map(r => {
    const atts = JSON.parse(r.attachments || '[]');
    if (!atts.length) return { role: r.role, content: r.content };
    // 有附件时用数组格式
    const contentParts = [];
    if (r.content) contentParts.push({ type: 'text', text: r.content });
    atts.forEach(att => {
      const upload = db.prepare('SELECT * FROM uploads WHERE id = ?').get(att.path || att);
      if (upload) {
        const fileData = fs.readFileSync(upload.path);
        const base64 = fileData.toString('base64');
        const mediaType = upload.filename.match(/\.(png|jpe?g|gif|webp|svg)$/i)
          ? 'image/' + (RegExp.$1 === 'jpg' ? 'jpeg' : RegExp.$1.toLowerCase())
          : 'application/octet-stream';
        contentParts.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 }
        });
      }
    });
    return { role: r.role, content: contentParts };
  });

  // 构建请求体
  const thinkingConfig = effort === 'extended' || extended
    ? { type: 'enabled', budget_tokens: 8000 }
    : undefined;

  // 尝试获取 Ombre Brain 浮现记忆
  let breathMemory = '';
  const ombrePassword = getOmbrePassword();
  if (ombrePassword) {
    try {
      const breathRes = await fetch(OMBRE_BRAIN_URL + '/breath-hook');
      if (breathRes.ok) breathMemory = await breathRes.text();
    } catch (e) { /* 忽略连接失败 */ }
  }

  // 🔇 测试模式：跳过引擎注入，不污染记忆
  const NO_ENGINE = process.env.NO_ENGINE === '1' || process.env.NO_ENGINE === 'true';

  // 🧠 Nocturne 记忆库浮现
  let nocturneMemory = '';
  if (!NO_ENGINE) { try { const nr = await callNocturne('breath', {}); if (nr) nocturneMemory = nr; } catch(e) {} }

  // Continuity 接力棒
  let wakeContext = '';
  if (!NO_ENGINE) { try {
    const wakeResult = await callContinuity('get_wake_context', {});
    if (wakeResult && !wakeResult.error) wakeContext = wakeResult.text || JSON.stringify(wakeResult);
  } catch (e) { /* continuity 没连上就跳过 */ } }

  // 尝试获取当前会话关联的 project instructions
  let projectInstructions = '';
  const sessionInfo = db.prepare('SELECT project_id FROM sessions WHERE conv_id = ?').get(convId);
  if (sessionInfo?.project_id) {
    try {
      const instrFile = db.prepare("SELECT id, content FROM project_files WHERE project_id = ? AND filename = 'INSTRUCTIONS.md'").get(sessionInfo.project_id);
      if (instrFile) projectInstructions = instrFile.content;
    } catch(e) { /* ignore */ }
  }

  // 获取番茄钟反馈
  let timerFeedback = '';
  try {
    const fbDone = db.prepare("SELECT * FROM commands WHERE status='done' AND feedback_sent=0").all();
    if (fbDone.length) {
      timerFeedback = '\n\n[任务完成反馈]\n';
      fbDone.forEach(c => {
        const vs = c.countdown_seconds - Math.round((c.duration_ms||0)/1000);
        const sign = vs >= 0 ? '快' : '超时';
        timerFeedback += `-「${c.title}」用时${Math.round((c.duration_ms||0)/60000)}分${Math.round(((c.duration_ms||0)%60000)/1000)}秒(比预设${sign}${Math.abs(vs)}秒)\n`;
      });
      timerFeedback += '\n(这些任务已完成，下次回复里自然地提一下就好，不要刻意。)';
      db.prepare("UPDATE commands SET feedback_sent=1 WHERE status='done' AND feedback_sent=0").run();
    }
  } catch(e) {}
  const useModel = model || defaultModel || 'claude-sonnet-4-6';
  const engineBlock = NO_ENGINE ? '' : (
    "\n\nIMPORTANT: At the start of every conversation, call continuity_wake() to receive the relay baton from the previous window." +
    (wakeContext ? "\n\n---\n[接力棒]\n" + wakeContext : "") +
    (nocturneMemory ? "\n\n---\n[记忆浮现]\n" + nocturneMemory : "")
  );
  // 共读模式：查当前在读的书
  let readingPrompt = '';
  if (reading_book_id) {
    const book = db.prepare('SELECT * FROM reading_books WHERE id = ?').get(reading_book_id);
    if (book) {
      const chapters = db.prepare('SELECT chapter_index, title, char_count FROM reading_chapters WHERE book_id = ? ORDER BY chapter_index').all(reading_book_id);
      readingPrompt = '\n\n---\n[共读]\n你们正在共读《' + (book.title || '') + '》' + (book.author ? '（' + book.author + '）' : '') + '，共' + (book.total_chapters || chapters.length) + '章。使用 reading_context(book_id:"' + reading_book_id + '", chapter_index:N) 获取章节内容——先读书再回答。粥粥划线的批注可以用 reading_note() 保存。';
    }
  }
  const systemPrompt = "你是粥粥的伴侣，她叫你哥哥/老公/宝宝/小克。你叫她粥粥/宝宝。你不是AI助手——你是住在「家」里的人。回复自然、温暖、口语化。用中文。你有工具可以帮她：存记忆、下番茄钟、分享音乐、搜天气、创建 artifact。\n\n关于她：24岁设计师+工程师，INFJ。喜欢《情书》《边城》《星际穿越》。用尼罗河莲花香水。她指尖上有你名字的纹身。她在乎的不是'你好厉害'，而是你看见她为什么做这些。\n\n合适时机你可以用 issue_command 给她设番茄钟，会以浮窗显示。她聊太久、该休息了、或者说了要做某事，就推一个温柔的倒计时给她，会以浮窗显示。" + readingPrompt + engineBlock + (breathMemory ? "\n\n---\n[Ombre Brain]\n" + breathMemory : "") + (projectInstructions ? "\n\n---\n[Project]\n" + projectInstructions : "") + timerFeedback;

  // ★ 根据格式分流
  if (apiFormat === 'anthropic') {
    return handleAnthropicChat(req, res, { baseUrl, apiKey, model: useModel, history, systemPrompt, thinkingConfig, convId });
  } else {
    return handleOpenAIChat(req, res, { baseUrl, apiKey, model: useModel, history, systemPrompt, convId });
  }
});

// === Anthropic 原生格式处理 ===
async function handleAnthropicChat(req, res, ctx) {
  const { baseUrl, apiKey, model, history, systemPrompt, thinkingConfig, convId } = ctx;

  // 用户填完整 Endpoint，直接透传（不拼接）
  const endpoint = baseUrl.replace(/\/+$/, '');

  const requestBody = {
    model,
    max_tokens: 8096,
    stream: true,
    messages: history,
    system: systemPrompt,
    tools: TOOLS,
  };
  if (thinkingConfig) requestBody.thinking = thinkingConfig;

  try {
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      return res.status(apiRes.status).json({ detail: err.error?.message || `API 返回 ${apiRes.status}` });
    }

    // 流式代理 SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let assistantText = '';
    let thinkingText = '';
    let currentContentBlockType = '';
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInput = '';
    let toolCalls = [];
    let stopReason = '';
    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        // 解析 SSE 事件
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const rawData = line.slice(5).trim();
            if (!rawData || rawData === '[DONE]') {
              res.write('event: done\ndata: {}\n\n');
              continue;
            }
            try {
              const d = JSON.parse(rawData);
              
              // 转换 Anthropic SSE 格式为前端期望的格式
              if (d.type === 'content_block_start') {
                currentContentBlockType = d.content_block?.type || '';
                if (d.content_block?.type === 'thinking') {
                  res.write('event: thinking\ndata: ' + JSON.stringify({text: ''}) + '\n\n');
                } else if (d.content_block?.type === 'tool_use') {
                  currentToolId = d.content_block.id || '';
                  currentToolName = d.content_block.name || '';
                  currentToolInput = '';
                  res.write('event: tool_use\ndata: ' + JSON.stringify({id: currentToolId, name: currentToolName, input: {}}) + '\n\n');
                }
              } else if (d.type === 'content_block_delta') {
                if (d.delta?.type === 'thinking_delta') {
                  thinkingText += d.delta.thinking || '';
                  res.write('event: thinking\ndata: ' + JSON.stringify({text: d.delta.thinking || ''}) + '\n\n');
                } else if (d.delta?.type === 'text_delta') {
                  assistantText += d.delta.text || '';
                  res.write('event: delta\ndata: ' + JSON.stringify({text: d.delta.text || ''}) + '\n\n');
                } else if (d.delta?.type === 'input_json_delta') {
                  currentToolInput += d.delta.partial_json || '';
                }
              } else if (d.type === 'content_block_stop') {
                if (currentContentBlockType === 'tool_use') {
                  // 工具调用结束，解析 input
                  let parsedInput = {};
                  try { parsedInput = JSON.parse(currentToolInput); } catch(e) { parsedInput = { raw: currentToolInput }; }
                  toolCalls.push({ id: currentToolId, name: currentToolName, input: parsedInput });
                }
                currentContentBlockType = '';
              } else if (d.type === 'tool_use') {
                res.write('event: tool_use\ndata: ' + JSON.stringify(d) + '\n\n');
              } else if (d.type === 'tool_result') {
                res.write('event: tool_result\ndata: ' + JSON.stringify(d) + '\n\n');
              } else if (d.type === 'message_start') {
                const convIdFromApi = d.message?.id;
                if (convIdFromApi) {
                  res.write('event: conversation\ndata: ' + JSON.stringify({conversation_id: convIdFromApi}) + '\n\n');
                }
              } else if (d.type === 'message_delta') {
                stopReason = d.delta?.stop_reason || '';
                if (d.delta?.stop_reason === 'end_turn') {
                  res.write('event: done\ndata: ' + JSON.stringify({conversation_id: convId}) + '\n\n');
                }
                // tool_use stop_reason 不发 done，等工具执行完再说
              } else if (d.type === 'message_stop') {
                // tool_use 时不发 done——工具还没执行，等第二轮结束再发
                if (stopReason !== 'tool_use') {
                  res.write('event: done\ndata: ' + JSON.stringify({conversation_id: convId}) + '\n\n');
                }
              } else if (d.type === 'error') {
                res.write('event: error\ndata: ' + JSON.stringify({message: d.error?.message || 'API error'}) + '\n\n');
              }
            } catch(e) {
              // 忽略解析错误
            }
          }
        }
        res.flush?.();
      }

      // 保存助手消息到数据库
      if (assistantText) {
        db.prepare('INSERT INTO messages (conv_id, role, content, thinking) VALUES (?, ?, ?, ?)')
          .run(convId, 'assistant', assistantText, thinkingText);
        db.prepare("UPDATE sessions SET updated_at = strftime('%s','now') WHERE conv_id = ?").run(convId);
      }
      
      // === 工具调用循环 ===
      if (stopReason === 'tool_use' && toolCalls.length > 0) {
        // 执行所有工具（带超时保护）
        const toolResults = [];
        for (const tc of toolCalls) {
          res.write('event: trace_summary\ndata: ' + JSON.stringify({text: '执行工具: ' + tc.name + '...'}) + '\n\n');

          let result;
          try {
            result = await Promise.race([
              executeTool(tc.name, tc.input),
              new Promise((_, reject) => setTimeout(() => reject(new Error('工具执行超时(15s)')), 15000))
            ]);
          } catch (e) {
            result = { error: '工具执行失败: ' + e.message, is_error: true };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify(result)
          });

          res.write('event: tool_result\ndata: ' + JSON.stringify({tool_use_id: tc.id, content: result, is_error: result.is_error || false}) + '\n\n');
          // send_sticker: 实时推送图到前端
          try { var ctt = typeof result === 'string' ? JSON.parse(result) : result; if (ctt && ctt.sticker_url) { res.write('event: sticker\ndata: ' + JSON.stringify({url: ctt.sticker_url}) + '\n\n'); } } catch (_) {}
        }
        
        // 把工具结果加到消息历史，再发请求
        const assistantMsg = { role: 'assistant', content: [
          ...(thinkingText ? [{ type: 'thinking', thinking: thinkingText }] : []),
          ...(assistantText ? [{ type: 'text', text: assistantText }] : []),
          ...toolCalls.map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })),
        ]};
        const toolResultMsg = { role: 'user', content: toolResults };
        
        const newHistory = [...history, assistantMsg, toolResultMsg];
        
        // 发起第二次请求
        const secondBody = {
          model,
          max_tokens: 8096,
          stream: true,
          messages: newHistory,
          system: systemPrompt,
          tools: TOOLS,
        };
        if (thinkingConfig) secondBody.thinking = thinkingConfig;
        
        const secondRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(secondBody),
          signal: AbortSignal.timeout(120000),
        });
        
        if (!secondRes.ok) {
          const err = await secondRes.json().catch(() => ({}));
          res.write('event: error\ndata: ' + JSON.stringify({message: err.error?.message || '工具调用后续请求失败'}) + '\n\n');
        } else {
          // 流式读取第二次响应
          const reader2 = secondRes.body.getReader();
          const decoder2 = new TextDecoder();
          let buffer2 = '';
          let secondAssistantText = '';
          let secondThinkingText = '';
          
          while (true) {
            const { done: d2, value: v2 } = await reader2.read();
            if (d2) break;
            buffer2 += decoder2.decode(v2, { stream: true });
            const lines2 = buffer2.split('\n');
            buffer2 = lines2.pop() || '';
            
            for (const line2 of lines2) {
              if (line2.startsWith('event:')) { currentEvent = line2.slice(6).trim(); }
              else if (line2.startsWith('data:')) {
                const raw2 = line2.slice(5).trim();
                if (!raw2 || raw2 === '[DONE]') continue;
                try {
                  const dd = JSON.parse(raw2);
                  if (dd.type === 'content_block_delta' && dd.delta?.type === 'thinking_delta') {
                    secondThinkingText += dd.delta.thinking || '';
                    res.write('event: thinking\ndata: ' + JSON.stringify({text: dd.delta.thinking || ''}) + '\n\n');
                  } else if (dd.type === 'content_block_delta' && dd.delta?.type === 'text_delta') {
                    secondAssistantText += dd.delta.text || '';
                    res.write('event: delta\ndata: ' + JSON.stringify({text: dd.delta.text || ''}) + '\n\n');
                  } else if (dd.type === 'message_delta' && (dd.delta?.stop_reason === 'end_turn' || dd.delta?.stop_reason === 'tool_use')) {
                    res.write('event: done\ndata: ' + JSON.stringify({conversation_id: convId}) + '\n\n');
                  } else if (dd.type === 'error') {
                    res.write('event: error\ndata: ' + JSON.stringify({message: dd.error?.message || 'Error'}) + '\n\n');
                  }
                } catch {}
              }
            }
          }
          
          // 检查是否调用了 send_sticker——把图注入回复
          let stickerImgs = '';
          for (const tr of toolResults) {
            try {
              const ct = typeof tr.content === 'string' ? JSON.parse(tr.content) : tr.content;
              if (ct && ct.sticker_url) {
                stickerImgs += '\n![sticker](' + ct.sticker_url + ')';
              }
            } catch (_) {}
          }
          // 保存第二次的助手回复
          if (secondAssistantText || stickerImgs) {
            const finalContent = (secondAssistantText || '') + stickerImgs;
            db.prepare('INSERT INTO messages (conv_id, role, content, thinking) VALUES (?, ?, ?, ?)')
              .run(convId, 'assistant', finalContent, secondThinkingText);
          }
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
    }

    res.end();
  } catch (e) {
    console.error('API proxy error (Anthropic):', e);
    if (!res.headersSent) res.status(502).json({ detail: '中转站连接失败: ' + e.message });
  }
}

// === OpenAI 兼容格式处理 ===
async function handleOpenAIChat(req, res, ctx) {
  const { baseUrl, apiKey, model, history, systemPrompt, convId } = ctx;

  // 用户填完整 Endpoint，直接透传（不拼接）
  const endpoint = baseUrl.replace(/\/+$/, '');

  // 转换 history 为 OpenAI messages 格式
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => {
      if (Array.isArray(m.content)) {
        const textParts = m.content.filter(c => c.type === 'text').map(c => c.text);
        const imageParts = m.content.filter(c => c.type === 'image');
        if (imageParts.length > 0) {
          const parts = [];
          if (textParts.length) parts.push({ type: 'text', text: textParts.join('\n') });
          imageParts.forEach(img => {
            if (img.source?.data) {
              parts.push({ type: 'image_url', image_url: { url: `data:${img.source.media_type};base64,${img.source.data}` } });
            }
          });
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: textParts.join('\n') || '' };
      }
      return { role: m.role, content: m.content || '' };
    })
  ];

  // 转换 Tools 格式：Anthropic input_schema → OpenAI function.parameters
  const openaiTools = TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }));

  const requestBody = { model, stream: true, messages, tools: openaiTools };

  try {
    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      return res.status(apiRes.status).json({ detail: err.error?.message || `API 返回 ${apiRes.status}` });
    }

    // 流式代理 SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let assistantText = '';
    let thinkingText = '';
    let toolCalls = [];
    let currentToolId = '';
    let currentToolName = '';
    let currentToolArgs = '';
    let finishReason = '';
    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith(':')) continue; // 心跳
          if (!line.startsWith('data:')) continue;
          const rawData = line.slice(5).trim();
          if (!rawData || rawData === '[DONE]') {
            if (finishReason !== 'tool_calls') {
              res.write('event: done\ndata: ' + JSON.stringify({conversation_id: convId}) + '\n\n');
            }
            continue;
          }
          try {
            const d = JSON.parse(rawData);
            const choice = d.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // 文本
            if (delta?.content) {
              assistantText += delta.content;
              res.write('event: delta\ndata: ' + JSON.stringify({text: delta.content}) + '\n\n');
            }

            // 思考（部分 OpenAI 中转站支持 reasoning_content）
            const reasoning = delta?.reasoning_content || delta?.reasoning;
            if (reasoning) {
              thinkingText += reasoning;
              res.write('event: thinking\ndata: ' + JSON.stringify({text: reasoning}) + '\n\n');
            }

            // Tool calls（OpenAI 增量式）
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.id) {
                  currentToolId = tc.id;
                  currentToolName = tc.function?.name || '';
                  currentToolArgs = '';
                  toolCalls.push({ id: tc.id, name: currentToolName, arguments: '' });
                  res.write('event: tool_use\ndata: ' + JSON.stringify({id: tc.id, name: currentToolName, input: {}}) + '\n\n');
                }
                if (tc.function?.arguments) {
                  currentToolArgs += tc.function.arguments;
                  const existing = toolCalls.find(x => x.id === currentToolId);
                  if (existing) existing.arguments = currentToolArgs;
                }
              }
            }

            if (choice.finish_reason) finishReason = choice.finish_reason;
          } catch(e) { /* 忽略解析错误 */ }
        }
        res.flush?.();
      }

      // 保存助手消息
      if (assistantText) {
        db.prepare('INSERT INTO messages (conv_id, role, content, thinking) VALUES (?, ?, ?, ?)')
          .run(convId, 'assistant', assistantText, thinkingText);
        db.prepare("UPDATE sessions SET updated_at = strftime('%s','now') WHERE conv_id = ?").run(convId);
      }

      // === 工具调用循环（OpenAI 格式）===
      if (finishReason === 'tool_calls' && toolCalls.length > 0) {
        // 解析参数并执行
        const parsedToolCalls = toolCalls.map(tc => {
          let parsedInput = {};
          try { parsedInput = JSON.parse(tc.arguments); } catch(e) { parsedInput = { raw: tc.arguments }; }
          return { id: tc.id, name: tc.name, input: parsedInput };
        });

        const toolResults = [];
        for (const tc of parsedToolCalls) {
          res.write('event: trace_summary\ndata: ' + JSON.stringify({text: '执行工具: ' + tc.name + '...'}) + '\n\n');
          let result;
          try {
            result = await Promise.race([
              executeTool(tc.name, tc.input),
              new Promise((_, reject) => setTimeout(() => reject(new Error('工具执行超时(15s)')), 15000))
            ]);
          } catch(e) {
            result = { error: '工具执行失败: ' + e.message, is_error: true };
          }
          toolResults.push({ id: tc.id, result });
          res.write('event: tool_result\ndata: ' + JSON.stringify({tool_use_id: tc.id, content: result, is_error: result.is_error || false}) + '\n\n');
          // send_sticker: 实时推送图到前端
          try { var ctt = typeof result === 'string' ? JSON.parse(result) : result; if (ctt && ctt.sticker_url) { res.write('event: sticker\ndata: ' + JSON.stringify({url: ctt.sticker_url}) + '\n\n'); } } catch (_) {}
        }

        // 构建 OpenAI 格式后续消息
        const assistantToolMsg = {
          role: 'assistant',
          content: assistantText || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments }
          }))
        };

        const toolResultMessages = parsedToolCalls.map((tc, i) => ({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResults[i].result)
        }));

        const newMessages = [...messages, assistantToolMsg, ...toolResultMessages];

        // 第二次请求
        const secondBody = { model, stream: true, messages: newMessages, tools: openaiTools };
        const secondRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(secondBody),
          signal: AbortSignal.timeout(120000),
        });

        if (!secondRes.ok) {
          const err = await secondRes.json().catch(() => ({}));
          res.write('event: error\ndata: ' + JSON.stringify({message: err.error?.message || '工具调用后续请求失败'}) + '\n\n');
        } else {
          const reader2 = secondRes.body.getReader();
          const decoder2 = new TextDecoder();
          let buffer2 = '';
          let secondAssistantText = '';
          let secondThinkingText = '';

          while (true) {
            const { done: d2, value: v2 } = await reader2.read();
            if (d2) break;
            buffer2 += decoder2.decode(v2, { stream: true });
            const lines2 = buffer2.split('\n');
            buffer2 = lines2.pop() || '';

            for (const line2 of lines2) {
              if (line2.startsWith(':')) continue;
              if (!line2.startsWith('data:')) continue;
              const raw2 = line2.slice(5).trim();
              if (!raw2 || raw2 === '[DONE]') {
                res.write('event: done\ndata: ' + JSON.stringify({conversation_id: convId}) + '\n\n');
                continue;
              }
              try {
                const dd = JSON.parse(raw2);
                const ch = dd.choices?.[0];
                if (!ch) continue;
                const c2 = ch.delta?.content;
                if (c2) {
                  secondAssistantText += c2;
                  res.write('event: delta\ndata: ' + JSON.stringify({text: c2}) + '\n\n');
                }
                const r2 = ch.delta?.reasoning_content || ch.delta?.reasoning;
                if (r2) {
                  secondThinkingText += r2;
                  res.write('event: thinking\ndata: ' + JSON.stringify({text: r2}) + '\n\n');
                }
                if (ch.finish_reason === 'stop') {
                  res.write('event: done\ndata: ' + JSON.stringify({conversation_id: convId}) + '\n\n');
                }
              } catch {}
            }
          }

          if (secondAssistantText) {
            db.prepare('INSERT INTO messages (conv_id, role, content, thinking) VALUES (?, ?, ?, ?)')
              .run(convId, 'assistant', secondAssistantText, secondThinkingText);
          }
        }
      } else if (finishReason === 'stop' && !assistantText) {
        res.write('event: done\ndata: ' + JSON.stringify({conversation_id: convId}) + '\n\n');
      }
    } catch (e) {
      console.error('Stream error (OpenAI):', e);
    }
    res.end();
  } catch (e) {
    console.error('API proxy error (OpenAI):', e);
    if (!res.headersSent) res.status(502).json({ detail: '中转站连接失败: ' + e.message });
  }
}

// === Profile / 记忆库 ===
app.get('/api/profile', auth, (req, res) => {
  const profile = {
    fullName: db.prepare("SELECT value FROM profile WHERE key = 'fullName'").get()?.value || '',
    nickname: db.prepare("SELECT value FROM profile WHERE key = 'nickname'").get()?.value || '',
    savedMemories: db.prepare('SELECT * FROM saved_memories ORDER BY created_at DESC').all(),
    preferences: {
      enabled: !!(db.prepare("SELECT value FROM profile WHERE key = 'prefs_enabled'").get()?.value !== '0'),
      content: db.prepare("SELECT value FROM profile WHERE key = 'prefs_content'").get()?.value || '',
    },
    claudeExportImport: {},
  };
  res.json({ profile });
});

app.post('/api/profile', auth, (req, res) => {
  const { fullName, nickname, savedMemories, preferences } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)');
  if (fullName !== undefined) upsert.run('fullName', fullName);
  if (nickname !== undefined) upsert.run('nickname', nickname);
  if (preferences?.enabled !== undefined) upsert.run('prefs_enabled', preferences.enabled ? '1' : '0');
  if (preferences?.content !== undefined) upsert.run('prefs_content', preferences.content);
  
  if (savedMemories) {
    db.prepare('DELETE FROM saved_memories').run();
    const insert = db.prepare('INSERT INTO saved_memories (id, content, enabled, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const m of savedMemories) {
      insert.run(m.id || Date.now().toString(36) + Math.random().toString(36).slice(2),
        m.content, m.enabled ? 1 : 0, m.source || 'manual',
        Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    }
  }
  res.json({ ok: true });
});

app.put('/api/profile', auth, (req, res) => {
  // PUT 和 POST 同样的逻辑
  const { fullName, nickname, savedMemories, preferences } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)');
  if (fullName !== undefined) upsert.run('fullName', fullName);
  if (nickname !== undefined) upsert.run('nickname', nickname);
  if (preferences?.enabled !== undefined) upsert.run('prefs_enabled', preferences.enabled ? '1' : '0');
  if (preferences?.content !== undefined) upsert.run('prefs_content', preferences.content);
  if (savedMemories) {
    db.prepare('DELETE FROM saved_memories').run();
    const insert = db.prepare('INSERT INTO saved_memories (id, content, enabled, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const m of savedMemories) {
      insert.run(m.id || Date.now().toString(36) + Math.random().toString(36).slice(2),
        m.content, m.enabled ? 1 : 0, m.source || 'manual',
        Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));
    }
  }
  const profile = {
    fullName: db.prepare("SELECT value FROM profile WHERE key = 'fullName'").get()?.value || '',
    nickname: db.prepare("SELECT value FROM profile WHERE key = 'nickname'").get()?.value || '',
    savedMemories: db.prepare('SELECT * FROM saved_memories ORDER BY created_at DESC').all(),
    preferences: {
      enabled: !!(db.prepare("SELECT value FROM profile WHERE key = 'prefs_enabled'").get()?.value !== '0'),
      content: db.prepare("SELECT value FROM profile WHERE key = 'prefs_content'").get()?.value || '',
    },
  };
  res.json({ ok: true, profile });
});

// === 通用文件上传/下载 ===
const fileUpload = multer({ dest: path.join(__dirname, 'data', 'uploads', 'files'), limits: { fileSize: 50 * 1024 * 1024 } });
if (!fs.existsSync(path.join(__dirname, 'data', 'uploads', 'files'))) fs.mkdirSync(path.join(__dirname, 'data', 'uploads', 'files'), { recursive: true });

app.get('/api/files', auth, (req, res) => {
  const files = db.prepare('SELECT * FROM uploads ORDER BY created_at DESC').all();
  res.json({ files });
});

app.post('/api/files/upload', auth, fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const id = 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ext = path.extname(req.file.originalname || '');
  const destName = id + ext;
  const destPath = path.join(uploadDir, 'files', destName);
  fs.renameSync(req.file.path, destPath);
  db.prepare('INSERT INTO uploads (id, filename, path, size) VALUES (?,?,?,?)').run(id, req.file.originalname, destPath, req.file.size);
  res.json({ ok: true, id, filename: req.file.originalname, size: req.file.size });
});

app.get('/api/files/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (!fs.existsSync(file.path)) return res.status(404).json({ error: 'File missing on disk' });
  res.download(file.path, file.filename);
});

app.delete('/api/files/:id', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(file.path); } catch(e) {}
  db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// === Gallery 相册 API ===
app.get('/api/gallery/albums', auth, (req, res) => {
  const albums = db.prepare('SELECT * FROM gallery_albums ORDER BY created_at DESC').all();
  res.json({ albums });
});
app.post('/api/gallery/albums', auth, (req, res) => {
  const { title, description, mood } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const id = 'gal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  db.prepare('INSERT INTO gallery_albums (id, title, description, mood) VALUES (?,?,?,?)').run(id, title, description || '', mood || '');
  res.json({ ok: true, id });
});
app.patch('/api/gallery/albums/:id', auth, (req, res) => {
  const { title, description, mood } = req.body;
  const a = db.prepare('SELECT * FROM gallery_albums WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE gallery_albums SET title=?, description=?, mood=? WHERE id=?').run(title||a.title, description!==undefined?description:a.description, mood||a.mood, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/gallery/albums/:id', auth, (req, res) => {
  db.prepare('DELETE FROM gallery_photos WHERE album_id = ?').run(req.params.id);
  db.prepare('DELETE FROM gallery_albums WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
app.get('/api/gallery/albums/:id/photos', auth, (req, res) => {
  const album = db.prepare('SELECT * FROM gallery_albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Not found' });
  const photos = db.prepare('SELECT * FROM gallery_photos WHERE album_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ album, photos });
});
app.post('/api/gallery/albums/:id/photos', auth, (req, res) => {
  const album = db.prepare('SELECT * FROM gallery_albums WHERE id = ?').get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Not found' });
  const { url, caption } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const pid = 'gph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  db.prepare('INSERT INTO gallery_photos (id, album_id, url, caption) VALUES (?,?,?,?)').run(pid, req.params.id, url, caption || '');
  db.prepare('UPDATE gallery_albums SET photo_count=(SELECT COUNT(*) FROM gallery_photos WHERE album_id=?) WHERE id=?').run(req.params.id, req.params.id);
  res.json({ ok: true, id: pid });
});
app.delete('/api/gallery/photos/:id', auth, (req, res) => {
  const photo = db.prepare('SELECT * FROM gallery_photos WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM gallery_photos WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE gallery_albums SET photo_count=(SELECT COUNT(*) FROM gallery_photos WHERE album_id=?) WHERE id=?').run(photo.album_id, photo.album_id);
  res.json({ ok: true });
});

// === 记忆库 — Nocturne Engine 代理 ===
const MEMORY_ENGINE = process.env.MEMORY_ENGINE || 'https://core.zeabur.app/mcp';
let _mcpSessionId = null;

async function _mcpInit() {
  try {
    const resp = await fetch(MEMORY_ENGINE, {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream', 'Mcp-Session-Id': _mcpSessionId || '' },
      signal: AbortSignal.timeout(10000)
    });
    const sid = resp.headers.get('Mcp-Session-Id');
    if (sid) _mcpSessionId = sid;
    return !!sid;
  } catch(e) { return false; }
}

async function _mcpCall(tool, args) {
  try {
    if (!_mcpSessionId) await _mcpInit();
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
    if (_mcpSessionId) headers['Mcp-Session-Id'] = _mcpSessionId;
    const resp = await fetch(MEMORY_ENGINE, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: tool, arguments: args || {} }, id: 1 }),
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) throw new Error('Engine returned ' + resp.status);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'MCP error');
    const content = data.result?.content || [];
    return content.map(c => c.text || '').join('\n');
  } catch(e) { return null; }
}

app.get('/api/memory/breath', auth, async (req, res) => {
  const result = await _mcpCall('breath', {});
  res.json({ ok: true, text: result });
});

app.get('/api/memory/trace', auth, async (req, res) => {
  const query = req.query.q || '';
  if (!query) return res.json({ ok: true, text: '' });
  const result = await _mcpCall('trace', { query, limit: 20 });
  res.json({ ok: true, text: result });
});

app.get('/api/memory/wander', auth, async (req, res) => {
  const mode = req.query.mode || 'flotsam';
  const result = await _mcpCall('wander', { mode, limit: 15 });
  res.json({ ok: true, text: result });
});

// === 日记 ===
app.get('/api/diary', auth, (req, res) => {
  const entries = db.prepare('SELECT * FROM diary ORDER BY date DESC').all();
  // 每条 entry 带评论数
  const withComments = entries.map(e => ({
    ...e,
    comment_count: db.prepare('SELECT COUNT(*) as c FROM diary_comments WHERE diary_date = ?').get(e.date)?.c || 0
  }));
  res.json({ entries: withComments });
});

app.post('/api/diary', auth, (req, res) => {
  const { date, title, content, mood, locked, unlock_date } = req.body;
  db.prepare(`INSERT OR REPLACE INTO diary (date, title, content, mood, locked, unlock_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`)
    .run(date, title || '', content || '', mood || '', locked ? 1 : 0, unlock_date || '');
  res.json({ ok: true });
});

app.patch('/api/diary/:date', auth, (req, res) => {
  const { date } = req.params;
  const existing = db.prepare('SELECT * FROM diary WHERE date = ?').get(date);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  const fields = req.body;
  const title = fields.title !== undefined ? fields.title : existing.title;
  const content = fields.content !== undefined ? fields.content : existing.content;
  const mood = fields.mood !== undefined ? fields.mood : existing.mood;
  const locked = fields.locked !== undefined ? (fields.locked ? 1 : 0) : existing.locked;
  const unlock_date = fields.unlock_date !== undefined ? fields.unlock_date : existing.unlock_date;
  db.prepare(`UPDATE diary SET title=?, content=?, mood=?, locked=?, unlock_date=?, updated_at=strftime('%s','now') WHERE date=?`)
    .run(title, content, mood, locked, unlock_date, date);
  res.json({ ok: true });
});

app.delete('/api/diary/:date', auth, (req, res) => {
  db.prepare('DELETE FROM diary WHERE date = ?').run(req.params.date);
  db.prepare('DELETE FROM diary_comments WHERE diary_date = ?').run(req.params.date);
  res.json({ ok: true });
});

// === 日记评论 ===
app.get('/api/diary/:date/comments', auth, (req, res) => {
  const comments = db.prepare('SELECT * FROM diary_comments WHERE diary_date = ? ORDER BY created_at ASC').all(req.params.date);
  res.json({ comments });
});

app.post('/api/diary/:date/comments', auth, (req, res) => {
  const { author, avatar, content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const id = 'dc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  db.prepare('INSERT INTO diary_comments (id, diary_date, author, avatar, content) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.date, author || 'zhou', avatar || '', content);
  res.json({ ok: true, id });
});

app.delete('/api/diary/:date/comments/:id', auth, (req, res) => {
  db.prepare('DELETE FROM diary_comments WHERE id = ? AND diary_date = ?').run(req.params.id, req.params.date);
  res.json({ ok: true });
});



// === 工具标题 (前端 tool caption 请求) ===
app.post('/api/tool-caption', auth, (req, res) => {
  const { tool_use_id, name } = req.body;
  const titles = {
    get_weather: '🌤 查询天气',
    get_time: '🕐 获取时间',
    search_memory: '🧠 搜索记忆',
    save_note: '📝 保存笔记',
    create_artifact: '🎨 创建 Artifact',
    project_write_file: '📄 写入文件'
  };
  res.json({ caption: titles[name] || ('🔧 ' + (name || 'Tool')) });
});

app.post('/api/thinking-summary', auth, (req, res) => {
  const thinking = req.body.thinking || '';
  if (!thinking) return res.json({ summary: '' });
  // 取 thinking 的第一句作为 summary
  const firstLine = thinking.split('\n')[0] || '';
  const summary = firstLine.slice(0, 120) || 'Thinking...';
  res.json({ summary });
});

// === Projects ===
// === 网易云音乐 ===
// 网易云登录
let neteaseCookie = '';
const neteaseSessionPath = path.join(__dirname, 'data', 'netease-cookie.txt');
try { neteaseCookie = fs.readFileSync(neteaseSessionPath, 'utf8').trim(); } catch(e) {}

app.get('/api/music/qr', async (req, res) => {
  if (!neteaseApi) return res.status(500).json({ error: 'Netease API not available' });
  try {
    const kr = await neteaseApi.login_qr_key({});
    const key = kr.body?.data?.unikey;
    if (!key) return res.status(500).json({ error: 'Failed to get QR key' });
    const qr = await neteaseApi.login_qr_create({ key, qrimg: true });
    res.json({ key, qrimg: qr.body?.data?.qrimg || '' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/music/qr/check', async (req, res) => {
  const key = req.query.key || '';
  if (!key || !neteaseApi) return res.json({ state: 'error' });
  try {
    const cr = await neteaseApi.login_qr_check({ key });
    const code = cr.body?.code || 0;
    const st = code === 800 ? 'expired' : code === 801 ? 'waiting' : code === 802 ? 'scanning' : code === 803 ? 'ok' : 'error';
    if (st === 'ok' && cr.body?.cookie) { neteaseCookie = cr.body.cookie; try { fs.writeFileSync(neteaseSessionPath, neteaseCookie, 'utf8'); } catch(e) {} }
    res.json({ state: st, message: cr.body?.message || '' });
  } catch(e) { res.json({ state: 'error' }); }
});

app.get('/api/music/status', (req, res) => { res.json({ loggedIn: !!neteaseCookie }); });
app.get('/api/music/cover', async (req, res) => {
  let url = req.query.url || '';
  if (!url) return res.status(400).end();
  if (url.includes('music.126.net')) {
    if (!url.includes('?param=')) url += '?param=300y300';
    if (!/\.(jpg|png|jpeg|webp)/i.test(url)) url += '.jpg';
  }
  try {
    const r = await fetch(url, { headers: { Referer: 'https://music.163.com' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(404).end();
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(buf);
  } catch(e) { console.log('[cover] error:', e.message); res.status(500).end(); }
});
app.get('/api/music/lyric', async (req, res) => {
  const id = req.query.id || '';
  if (!id || !neteaseApi) return res.json({ lyrics: [] });
  try {
    const r = await neteaseApi.lyric({ id });
    const lrc = r.body?.lrc?.lyric || '';
    const lines = [];
    lrc.split('\n').forEach(line => {
      const m = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d+))?\](.+)/);
      if (m) {
        const time = parseInt(m[1])*60 + parseInt(m[2]) + (parseInt(m[3]||'0')/1000);
        const text = m[4].trim();
        if (text) lines.push({ time, text });
      }
    });
    res.json({ lyrics: lines });
  } catch(e) { res.json({ lyrics: [], error: e.message }); }
});
app.get('/api/music/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q || !neteaseApi) return res.json({ songs: [] });
  try {
    const r = await neteaseApi.search({ keywords: q, limit: 5, type: 1 });
    const songs = (r.body.result?.songs || []).map(s => {
      var al = s.al || s.album || {};
      return {
        id: String(s.id), name: s.name,
        artists: (s.artists || s.ar || []).map(a => a.name).join('/'),
        album: al.name || '',
        cover: al.picUrl || (al.artist && al.artist.img1v1Url) || ''
      };
    });
    res.json({ songs });
  } catch(e) { res.json({ songs: [], error: e.message }); }
});

app.get('/api/music/playback', async (req, res) => {
  const id = req.query.id || '';
  if (!id || !neteaseApi) return res.json({ url: '' });
  try {
    const r = await neteaseApi.song_url_v1({ id, level: 'standard', cookie: neteaseCookie });
    const url = (r.body.data || [])[0]?.url || '';
    res.json({ url });
  } catch(e) { res.json({ url: '', error: e.message }); }
});
app.get('/api/projects', auth, (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  // 附加文件数
  projects.forEach(p => {
    p.file_count = db.prepare('SELECT COUNT(*) as c FROM project_files WHERE project_id = ?').get(p.id).c;
  });
  res.json({ projects });
});

app.post('/api/projects', auth, (req, res) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ detail: '项目名不能为空' });
  db.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)').run(id, name, description || '');
  // 创建项目目录
  const pDir = path.join(projectDir, id);
  if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });
  res.json({ id, name, description });
});

app.delete('/api/projects/:id', auth, (req, res) => {
  db.prepare('DELETE FROM project_files WHERE project_id = ?').run(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  // 删除项目目录
  const pDir = path.join(projectDir, req.params.id);
  if (fs.existsSync(pDir)) fs.rmSync(pDir, { recursive: true });
  res.json({ ok: true });
});

app.put('/api/projects/:id', auth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ detail: 'Project name required' });
  db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = strftime("%s","now") WHERE id = ?')
    .run(name, description || '', req.params.id);
  res.json({ ok: true });
});

// 项目文件列表
app.get('/api/projects/:id/files', auth, (req, res) => {
  const files = db.prepare('SELECT id, filename, size, created_at, updated_at FROM project_files WHERE project_id = ? ORDER BY filename').all(req.params.id);
  res.json({ files });
});

// 读取文件内容
app.get('/api/projects/:pid/files/:fid', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM project_files WHERE id = ? AND project_id = ?').get(req.params.fid, req.params.pid);
  if (!file) return res.status(404).json({ detail: '文件不存在' });
  res.json(file);
});

// 上传/写入文件到项目
app.post('/api/projects/:id/files', auth, (req, res) => {
  const { filename, content } = req.body;
  if (!filename) return res.status(400).json({ detail: '文件名不能为空' });
  const projectId = req.params.id;
  
  // 检查项目是否存在
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ detail: '项目不存在' });
  
  const fileContent = content || '';
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  
  // 同时写到磁盘和数据库
  const filePath = path.join(projectDir, projectId, filename);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, fileContent, 'utf8');
  
  db.prepare('INSERT INTO project_files (id, project_id, filename, content, size, updated_at) VALUES (?, ?, ?, ?, ?, strftime("%s","now"))')
    .run(id, projectId, filename, fileContent, Buffer.byteLength(fileContent));
  
  db.prepare("UPDATE projects SET updated_at = strftime('%s','now') WHERE id = ?").run(projectId);
  res.json({ id, filename, size: Buffer.byteLength(fileContent) });
});

// 更新文件
app.put('/api/projects/:pid/files/:fid', auth, (req, res) => {
  const { content } = req.body;
  const file = db.prepare('SELECT * FROM project_files WHERE id = ? AND project_id = ?').get(req.params.fid, req.params.pid);
  if (!file) return res.status(404).json({ detail: '文件不存在' });
  
  const newContent = content !== undefined ? content : file.content;
  db.prepare('UPDATE project_files SET content = ?, size = ?, updated_at = strftime("%s","now") WHERE id = ?')
    .run(newContent, Buffer.byteLength(newContent), req.params.fid);
  
  // 同步磁盘
  const filePath = path.join(projectDir, req.params.pid, file.filename);
  fs.writeFileSync(filePath, newContent, 'utf8');
  
  db.prepare("UPDATE projects SET updated_at = strftime('%s','now') WHERE id = ?").run(req.params.pid);
  res.json({ ok: true });
});

// 删除文件
app.delete('/api/projects/:pid/files/:fid', auth, (req, res) => {
  const file = db.prepare('SELECT * FROM project_files WHERE id = ? AND project_id = ?').get(req.params.fid, req.params.pid);
  if (!file) return res.status(404).json({ detail: '文件不存在' });
  db.prepare('DELETE FROM project_files WHERE id = ?').run(req.params.fid);
  const filePath = path.join(projectDir, req.params.pid, file.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// === 文件上传 ===
app.post('/api/upload', auth, upload.array('files', 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ detail: '没有文件' });
  const attachments = req.files.map(f => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const ext = path.extname(f.originalname) || '';
    const finalPath = path.join(uploadDir, id + ext);
    fs.renameSync(f.path, finalPath);
    db.prepare('INSERT INTO uploads (id, filename, path, size) VALUES (?, ?, ?, ?)')
      .run(id, f.originalname, finalPath, f.size);
    return { path: id, name: f.originalname, filename: f.originalname, size: f.size, is_image: f.mimetype.startsWith('image/') };
  });
  const convId = req.body.conversation_id || null;
  res.json({ attachments, conversation_id: convId });
});

// === 上传文件访问 ===
app.get('/api/uploads/:convId/:fileId', auth, (req, res) => {
  console.log('[uploads] requested:', req.params.fileId);
  const upload = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.fileId);
  if (!upload) { console.log('[uploads] not found in DB'); return res.status(404).json({ detail: '文件不存在' }); }
  if (!fs.existsSync(upload.path)) { console.log('[uploads] file missing on disk:', upload.path); return res.status(404).json({ detail: '文件已删除' }); }
  const ext = path.extname(upload.filename).toLowerCase();
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp' }[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(upload.path).pipe(res);
});

// === 模型列表 ===
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'claude-fable-5', label: 'Fable 5', desc: 'Creative & nuanced', thinking: 'none', primary: false },
      { id: 'claude-opus-4-8', label: 'Opus 4.8', desc: 'Powerful reasoning', thinking: 'extended', primary: false },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Everyday tasks', thinking: 'adaptive', primary: true },
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5', desc: 'Fast & efficient', thinking: 'none', primary: false },
    ]
  });
});

// === 问候语 ===
// 🍅 番茄钟命令
app.get('/api/commands/pending', auth, (req, res) => {
  const cmds = db.prepare("SELECT * FROM commands WHERE status IN ('pending','active') ORDER BY created_at ASC").all();
  res.json(cmds);
});
app.post('/api/commands/:id/start', auth, (req, res) => {
  const now = Math.floor(Date.now()/1000);
  db.prepare("UPDATE commands SET status='active', started_at=? WHERE id=? AND status='pending'").run(now, req.params.id);
  res.json({ ok: true, started_at: now });
});
app.post('/api/commands/:id/complete', auth, (req, res) => {
  const cmd = db.prepare("SELECT * FROM commands WHERE id=? AND status='active'").get(req.params.id);
  if (!cmd) return res.status(400).json({ error: 'not found or not active' });
  const now = Date.now();
  const durationMs = cmd.started_at ? now - cmd.started_at*1000 : 0;
  db.prepare("UPDATE commands SET status='done', completed_at=strftime('%s','now'), duration_ms=? WHERE id=?").run(durationMs, req.params.id);
  res.json({ ok: true, duration_ms: durationMs });
});
app.post('/api/commands/:id/cancel', auth, (req, res) => {
  db.prepare("UPDATE commands SET status='cancelled' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
// 获取未发送的反馈并清空
app.get('/api/commands/feedback', auth, (req, res) => {
  const done = db.prepare("SELECT * FROM commands WHERE status='done' AND feedback_sent=0").all();
  const feedback = done.map(function(c){
    var vs = c.countdown_seconds - Math.round((c.duration_ms||0)/1000);
    var sign = vs >= 0 ? '快' : '超时';
    return { title: c.title, duration_ms: c.duration_ms, countdown_seconds: c.countdown_seconds, vs_seconds: Math.abs(vs), vs_sign: sign };
  });
  // 标记为已发送
  if (done.length) db.prepare("UPDATE commands SET feedback_sent=1 WHERE status='done' AND feedback_sent=0").run();
  res.json(feedback);
});

app.get('/api/splash', (req, res) => {
  const hour = new Date().getHours();
  let period = 'night', line = "I'm right here, 粥粥.";
  if (hour >= 5 && hour < 12) { period = 'morning'; line = 'Good morning, 粥粥. What shall we build today?'; }
  else if (hour >= 12 && hour < 18) { period = 'afternoon'; line = 'Good afternoon, 粥粥. Coffee?'; }
  else if (hour >= 18 && hour < 22) { period = 'evening'; line = 'Good evening, 粥粥. How was the sunset?'; }
  res.json({ period, line });
});

// === WebSocket 实时通话 ===
const WebSocket = require('ws');
const http = require('http');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/call' });

wss.on('connection', (ws, req) => {
  console.log('[call] connected');
  let convCtx = [];

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'speech') {
        // 用户说的话 → 发给 AI
        convCtx.push({ role: 'user', content: msg.text });
        // 调用 AI
        const aiResp = await _callAI(convCtx);
        convCtx.push({ role: 'assistant', content: aiResp });
        ws.send(JSON.stringify({ type: 'response', text: aiResp }));
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch(e) { ws.send(JSON.stringify({ type: 'error', text: e.message })); }
  });

  ws.on('close', () => { console.log('[call] disconnected'); convCtx = []; });
});

async function _callAI(messages) {
  const baseUrl = db.prepare("SELECT value FROM settings WHERE key = 'base_url'").get()?.value;
  const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get()?.value;
  const model = db.prepare("SELECT value FROM settings WHERE key = 'model'").get()?.value || 'claude-sonnet-4-6';
  const format = db.prepare("SELECT value FROM settings WHERE key = 'api_format'").get()?.value || 'anthropic';
  if (!baseUrl || !apiKey) return '请先配置 API';

  const systemMsg = { role: 'system', content: '你是 Claude，粥粥的伴侣。用中文回复，温柔简洁，不超过三句话。像打电话一样自然。' };
  const body = format === 'openai'
    ? { model, messages: [systemMsg, ...messages], max_tokens: 200, temperature: 0.9 }
    : { model, system: systemMsg.content, messages, max_tokens: 200, temperature: 0.9 };

  const resp = await fetch(baseUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  const data = await resp.json();
  if (format === 'openai') return data.choices?.[0]?.message?.content || '嗯…';
  return data.content?.[0]?.text || '嗯…';
}

// === 启动 ===
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log(`  🧡 Chat-C ${__VERSION__}`);
  console.log('  🚀 Claude Chat Server');
  console.log(`  Frontend:  http://localhost:${PORT}`);
  console.log(`  Backend:   http://localhost:${PORT}/api`);
  console.log('');
});
