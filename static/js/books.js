// === Books — 视觉系统 v19 ===
console.log('[books] v20 — distinct gray quote card in sheet');
// 色板: --books-bg #F7F5EF, --books-card #EFECE5, --books-text #1C1B19
var currentReadingBookId = null;
var _readerBook = null, _readerChapterIdx = 0;

var _coverPalette = [
  ['#8B1A1A','#5C0A0A'], // 深红
  ['#1C1B19','#0D0C0A'], // 墨黑
  ['#1A2540','#0D1428'], // 深蓝灰
  ['#2C1810','#180C06'], // 焦棕
  ['#3D2B1F','#201510'], // 咖啡
  ['#1B2E1B','#0E1A0E'], // 暗绿
  ['#3E1A2E','#200E18'], // 深紫
  ['#22201D','#11100E'], // 炭灰
  ['#402020','#200808'], // 砖红
  ['#1E2830','#0E1418'], // 灰蓝
  ['#2E2218','#1A1008'], // 驼棕
  ['#282018','#140E08']  // 烟草
];
function _bookCoverGradient(id) {
  var idx = 0;
  for (var i = 0; i < id.length; i++) idx = (idx * 31 + id.charCodeAt(i)) % _coverPalette.length;
  return _coverPalette[idx];
}

// 统一书封渲染：3D 透视 + 书脊 + 哑光质感
function _renderBookCover(book, w, h, fs) {
  var grad = _bookCoverGradient(book.id || book.book_id || '');
  var title = (book.title || '').slice(0, 36);
  var author = (book.author || '').slice(0, 28);
  var spineW = Math.max(4, Math.round(w * 0.1));
  var innerW = w - spineW;
  var s1 = grad[0], s2 = grad[1];

  if (book.cover_url) {
    return '<div style="width:' + w + 'px;height:' + h + 'px;border-radius:3px 6px 6px 3px;background:url(' + book.cover_url + ') center/cover;flex:none;box-shadow:2px 4px 14px rgba(0,0,0,.18);position:relative;transform:perspective(500px) rotateY(-3deg)"></div>';
  }

  return '' +
    '<div style="width:' + w + 'px;height:' + h + 'px;flex:none;position:relative;transform:perspective(500px) rotateY(-3deg);transform-style:preserve-3d">' +
    // 书脊 — 左侧窄条
    '<div style="position:absolute;left:0;top:0;width:' + spineW + 'px;height:100%;background:' + s2 + ';border-radius:3px 0 0 3px;display:flex;align-items:center;justify-content:center;overflow:hidden">' +
    '<div style="writing-mode:vertical-rl;font:400 ' + Math.max(8, fs - 6) + 'px var(--font-serif);color:rgba(255,255,255,.35);letter-spacing:.04em;white-space:nowrap">' + escHtml(title.slice(0, 16)) + '</div>' +
    '</div>' +
    // 封面正面
    '<div style="position:absolute;left:' + spineW + 'px;top:0;width:' + innerW + 'px;height:100%;background:' + s1 + ';border-radius:0 5px 5px 0;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:10px 8px;box-sizing:border-box;overflow:hidden">' +
    // 哑光纹理
    '<div style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(255,255,255,.04) 0%, transparent 40%, rgba(0,0,0,.04) 100%);border-radius:0 5px 5px 0"></div>' +
    // 内容
    '<div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%">' +
    '<div style="font:600 ' + fs + 'px/1.2 var(--font-serif);color:rgba(255,255,255,.82);text-align:center;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + escHtml(title) + '</div>' +
    '<div style="width:55%;height:1px;background:rgba(255,255,255,.22);margin:' + Math.max(6, Math.round(h * 0.04)) + 'px 0"></div>' +
    (author ? '<div style="font:400 ' + (fs - 2) + 'px/1 var(--font-serif);color:rgba(255,255,255,.45);text-align:center;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + escHtml(author) + '</div>' : '') +
    '<div style="width:65%;height:2px;background:rgba(255,255,255,.30);margin-top:' + (author ? Math.max(5, Math.round(h * 0.03)) : '0') + 'px"></div>' +
    '</div></div>' +
    // 柔和阴影
    '<div style="position:absolute;left:10%;bottom:-4px;width:80%;height:8px;background:rgba(0,0,0,.10);border-radius:50%;filter:blur(4px);z-index:-1"></div>' +
    '</div>';
}

// === 面板生命周期 ===
function openBooksPanel() {
  if (!$('booksPanel')) {
    var p = document.createElement('section');
    p.id = 'booksPanel'; p.setAttribute('aria-hidden', 'true');
    p.style.cssText = 'position:fixed;inset:0;z-index:80;display:none;flex-direction:column;background:var(--books-bg);color:var(--books-text);overflow:hidden';
    document.body.appendChild(p);
  }
  $('booksPanel').style.display = 'flex';
  $('booksPanel').setAttribute('aria-hidden', 'false');
  _showBookshelf();
}
function closeBooksPanel() {
  var p = $('booksPanel');
  if (p) { p.style.display = 'none'; p.setAttribute('aria-hidden', 'true'); }
}

// === 书架 ===
var _bookshelfTab = 'reading';
var _bookshelfView = 'shelf'; // 'shelf' | 'annotations'
var _annoSearchTerm = '';
var _currentAnnoBookId = null; // 当前单书批注详情页的书 ID，null = 在列表
function _showBookshelf() {
  var panel = $('booksPanel');
  var isDark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
  panel.style.background = isDark ? '#1C1A17' : '#F8F6F3';
  var titleText = _bookshelfView === 'annotations' ? 'Bookmarks' : 'Bookshelf';
  panel.innerHTML =
    // header — 细导航栏，居中标题
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top) + 6px) 20px 4px;flex:none">' +
    '<button id="closeBooks" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--books-text);font-size:20px;font-weight:300">←</button>' +
    '<div style="font:500 18px/1.2 var(--font-serif);color:var(--books-text);letter-spacing:-.01em">' + titleText + '</div>' +
    (_bookshelfView === 'shelf'
      ? '<button id="booksUploadBtn" style="width:36px;height:36px;border:none;border-radius:50%;background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--books-text);font-size:22px;font-weight:300">+</button>'
      : '<span style="width:36px"></span>') +
    '</div>' +
    // 批注搜索框
    (_bookshelfView === 'annotations'
      ? '<div style="padding:0 20px 16px;flex:none">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:12px 18px;background:rgba(0,0,0,.03);border-radius:28px">' +
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--books-faint)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="text" id="_annoSearchInput" placeholder="Search annotations, quotes, replies..." style="flex:1;border:none;outline:none;background:transparent;font:400 15px/1.4 var(--font-sans);color:var(--books-text)" value="' + escHtml(_annoSearchTerm) + '" oninput="_annoSearchTerm=this.value;_loadAnnotationLog()">' +
        (_annoSearchTerm ? '<button onclick="_annoSearchTerm=\'\';var i=document.getElementById(\'_annoSearchInput\');if(i)i.value=\'\';_loadAnnotationLog()" style="width:24px;height:24px;border:none;border-radius:50%;background:rgba(0,0,0,.08);display:grid;place-items:center;cursor:pointer;color:var(--books-muted);font-size:14px;flex:none">×</button>' : '') +
        '</div></div>'
      : '') +
    // Gutenberg 搜索 + segment control（仅书架视图）
    (_bookshelfView === 'shelf'
      ? '<div style="padding:0 20px 14px;flex:none">' +
        // Gutenberg
        '<div id="gutenbergSearch" style="display:flex;align-items:center;gap:8px;padding:10px 16px;margin-bottom:14px;background:var(--bg-sunken,rgba(0,0,0,.03));border-radius:28px;cursor:text" onclick="$(\'gutenbergSearchInput\').focus()">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--books-faint)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="text" id="gutenbergSearchInput" placeholder="Search Project Gutenberg..." style="flex:1;border:none;outline:none;background:transparent;font:400 15px var(--font-sans);color:var(--books-text)" oninput="_searchGutenberg(this.value)">' +
        '</div>' +
        '<div id="gutenbergResults" style="display:none;margin-top:8px"></div>' +
        // 胶囊分段控件 — 居中
        '<div style="display:flex;justify-content:center">' +
        '<div style="display:flex;background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.06);border-radius:24px;padding:3px">' +
        '<button class="bs-tab' + (_bookshelfTab === 'reading' ? ' active' : '') + '" data-tab="reading" style="padding:9px 28px;border:none;border-radius:22px;font:500 14px var(--font-sans);color:var(--books-muted);background:transparent;transition:all .25s">Reading</button>' +
        '<button class="bs-tab' + (_bookshelfTab === 'finished' ? ' active' : '') + '" data-tab="finished" style="padding:9px 28px;border:none;border-radius:22px;font:500 14px var(--font-sans);color:var(--books-muted);background:transparent;transition:all .25s">Finished</button>' +
        '</div></div></div>'
      : '') +
    // list
    '<div id="booksBookList" style="flex:1;overflow-y:auto;padding:0 20px 24px"></div>' +
    // 底部导航
    '<div style="flex:none;padding:8px 20px calc(env(safe-area-inset-bottom) + 8px);display:flex;justify-content:center;gap:4px">' +
    '<div style="display:flex;background:#3D3A36;border-radius:22px;padding:4px;gap:2px">' +
    '<button id="bsNavAnno" style="width:44px;height:38px;border:none;border-radius:18px;display:grid;place-items:center;cursor:pointer;background:' + (_bookshelfView === 'annotations' ? '#1C1B19' : 'transparent') + ';transition:all .25s" title="批注记录">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + (_bookshelfView === 'annotations' ? '#F0ECE4' : '#A09B92') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
    '</button>' +
    '<button id="bsNavShelf" style="width:44px;height:38px;border:none;border-radius:18px;display:grid;place-items:center;cursor:pointer;background:' + (_bookshelfView === 'shelf' ? '#1C1B19' : 'transparent') + ';transition:all .25s" title="书架">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + (_bookshelfView === 'shelf' ? '#F0ECE4' : '#A09B92') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
    '</button>' +
    '</div></div>';

  // inject tab style once
  if (!$('_bsTabStyle')) {
    var s = document.createElement('style'); s.id = '_bsTabStyle';
    s.textContent = '.bs-tab.active{background:#fff!important;color:var(--books-text)!important;box-shadow:0 1px 4px rgba(0,0,0,.06)}';
    document.head.appendChild(s);
  }
  $('closeBooks').onclick = closeBooksPanel;
  if (_bookshelfView === 'shelf') {
    $('booksUploadBtn').onclick = _showAddBookSheet;
    document.querySelectorAll('.bs-tab').forEach(function(el) {
      el.onclick = function() { _bookshelfTab = this.dataset.tab; _showBookshelf(); };
    });
    loadReadingBooks();
  } else {
    _loadAnnotationLog();
  }
  $('bsNavAnno').onclick = function() { _bookshelfView = 'annotations'; _showBookshelf(); };
  $('bsNavShelf').onclick = function() { _bookshelfView = 'shelf'; _showBookshelf(); };
}

// === 导入书籍底部弹窗（iOS HIG 风格） ===
var _addBookFile = null, _addBookFileName = '';
function _showAddBookSheet() {
  var old = $('addBookOverlay'); if (old) old.remove();
  _addBookFile = null; _addBookFileName = '';

  var cards = [
    { id: 'epub', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>', title: 'Import EPUB', sub: 'EPUB 电子书', accept: '.epub' },
    { id: 'pdf', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', title: 'Import PDF', sub: 'PDF 文档', accept: '.pdf' },
    { id: 'folder', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>', title: 'Import Folder', sub: '批量导入文件夹', accept: '' },
    { id: 'text', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', title: 'Paste Text', sub: '粘贴纯文本内容', accept: '' }
  ];

  var html = '' +
    '<div id="addBookOverlay" style="position:fixed;inset:0;z-index:88;background:rgba(0,0,0,.16);opacity:0;transition:opacity .4s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)" onclick="_closeAddBookSheet()"></div>' +
    '<div id="addBookSheet" style="position:fixed;inset:auto 0 0;z-index:89;height:68vh;background:var(--bg-primary,#FCFBF8);border-radius:32px 32px 0 0;transform:translateY(100%);transition:transform .45s cubic-bezier(.22,.61,.36,1);overflow:hidden;display:flex;flex-direction:column">' +
    // 拖拽把手
    '<div style="flex:none;padding:12px 0 4px;display:flex;justify-content:center"><div style="width:36px;height:5px;background:rgba(0,0,0,.12);border-radius:3px"></div></div>' +
    // Header
    '<div style="flex:none;padding:12px 24px 6px"><div style="font:600 26px/1.2 var(--font-serif);color:var(--books-text);letter-spacing:-.01em">Add a Book</div></div>' +
    // 文件信息
    '<div id="_addBookInfo" style="flex:none;padding:8px 24px 16px;font:400 13px/1.4 var(--font-sans);color:var(--books-muted);min-height:8px"></div>' +
    // 卡片列表
    '<div style="flex:1;overflow-y:auto;padding:4px 24px 16px;display:flex;flex-direction:column;gap:10px">' +
    cards.map(function(c) {
      return '<div data-action="' + c.id + '" style="display:flex;align-items:center;gap:14px;padding:16px 18px;background:rgba(0,0,0,.025);border-radius:18px;cursor:pointer;min-height:72px;box-sizing:border-box" onclick="_addBookPick(\'' + c.id + '\',\'' + (c.accept || '') + '\')">' +
        '<div style="width:42px;height:42px;border-radius:12px;background:rgba(0,0,0,.04);display:grid;place-items:center;color:var(--books-text);flex:none">' + c.icon + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font:500 15px/1.3 var(--font-sans);color:var(--books-text)">' + c.title + '</div><div style="font:400 13px/1.3 var(--font-sans);color:var(--books-muted);margin-top:1px">' + c.sub + '</div></div>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--books-faint)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
    }).join('') +
    '</div>' +
    // 底部双按钮
    '<div style="flex:none;padding:16px 24px calc(env(safe-area-inset-bottom) + 16px);display:flex;gap:12px">' +
    '<button onclick="_closeAddBookSheet()" style="flex:1;padding:14px 0;border:none;border-radius:18px;background:rgba(0,0,0,.05);color:var(--books-text);font:600 15px var(--font-sans);cursor:pointer">Cancel</button>' +
    '<button id="_addBookImportBtn" onclick="_addBookDoImport()" style="flex:1;padding:14px 0;border:none;border-radius:18px;background:#1C1B19;color:#fff;font:600 15px var(--font-sans);cursor:pointer;opacity:.35;transition:opacity .2s" disabled>Import</button>' +
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
  // 隐藏的 file input
  var fi = document.createElement('input');
  fi.type = 'file'; fi.id = '_addBookFileInput'; fi.style.display = 'none';
  fi.onchange = function() {
    if (fi.files && fi.files[0]) {
      _addBookFile = fi.files[0]; _addBookFileName = fi.files[0].name;
      var size = fi.files[0].size > 1024 * 1024 ? (fi.files[0].size / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(fi.files[0].size / 1024) + ' KB';
      var ext = fi.files[0].name.split('.').pop().toUpperCase();
      var info = $('_addBookInfo'); if (info) info.innerHTML = fi.files[0].name + '<br><span style="font-size:12px;color:var(--books-faint)">' + ext + ' · ' + size + '</span>';
      var btn = $('_addBookImportBtn'); if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
    fi.value = '';
  };
  document.body.appendChild(fi);

  requestAnimationFrame(function() {
    var ov = $('addBookOverlay'); var sh = $('addBookSheet');
    if (ov) ov.style.opacity = '1';
    if (sh) sh.style.transform = 'translateY(0)';
  });
}

function _addBookPick(action, accept) {
  if (action === 'text') {
    var text = prompt('Paste your text content:');
    if (!text || !text.trim()) return;
    _addBookFileName = 'pasted.txt';
    _addBookFile = new Blob([text], { type: 'text/plain' });
    var info = $('_addBookInfo'); if (info) info.innerHTML = 'pasted.txt<br><span style="font-size:12px;color:var(--books-faint)">TXT · ' + Math.round(text.length / 1024) + ' KB</span>';
    var btn = $('_addBookImportBtn'); if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    return;
  }
  if (action === 'folder') {
    // webkitdirectory for folder picker
    var fi = document.createElement('input');
    fi.type = 'file'; fi.style.display = 'none';
    fi.webkitdirectory = true;
    fi.onchange = function() {
      if (fi.files && fi.files.length) {
        _addBookFile = fi.files; _addBookFileName = fi.files.length + ' files';
        var info = $('_addBookInfo'); if (info) info.innerHTML = fi.files.length + ' files selected<br><span style="font-size:12px;color:var(--books-faint)">Folder import</span>';
        var btn = $('_addBookImportBtn'); if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      }
    };
    fi.click();
    return;
  }
  // EPUB / PDF: file input
  var fi2 = $('_addBookFileInput');
  if (fi2 && accept) { fi2.accept = accept; fi2.click(); }
}

async function _addBookDoImport() {
  if (!_addBookFile) return;
  var btn = $('_addBookImportBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }
  try {
    // 处理文件夹
    if (_addBookFile.length) {
      var count = 0, failed = 0;
      for (var i = 0; i < _addBookFile.length; i++) {
        var f = _addBookFile[i];
        if (!/\.(txt|epub|pdf)$/i.test(f.name)) continue;
        var fd = new FormData(); fd.append('file', f);
        try {
          var r = await fetch('/api/reading/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (state.token || '') }, body: fd });
          if (r.ok) { count++; } else { failed++; }
        } catch(ex) { failed++; }
      }
      toast('Imported ' + count + ' books' + (failed ? ', ' + failed + ' failed' : ''));
    } else {
      var fd2 = new FormData(); fd2.append('file', _addBookFile, _addBookFileName);
      var resp = await fetch('/api/reading/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (state.token || '') }, body: fd2 });
      if (resp.ok) { toast('Added!'); } else { var e = await resp.json().catch(function(){return{}}); toast('Failed: ' + (e.error || resp.status)); }
    }
    _closeAddBookSheet();
    loadReadingBooks();
  } catch(ex) { toast('Import failed: ' + ex.message); }
  if (btn) { btn.disabled = false; btn.textContent = 'Import'; }
}

function _closeAddBookSheet() {
  var ov = $('addBookOverlay'); var sh = $('addBookSheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  if (ov) ov.style.opacity = '0';
  setTimeout(function() {
    if (ov) ov.remove(); if (sh) sh.remove();
    var fi = $('_addBookFileInput'); if (fi) fi.remove();
  }, 450);
}

// 旧的直接上传（保留兼容）
async function _handleUpload() {
  var inp = $('booksFileInput'); if (!inp) return;
  var f = inp.files[0]; if (!f) return;
  var fd = new FormData(); fd.append('file', f);
  try {
    var resp = await fetch('/api/reading/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + (state.token || '') }, body: fd });
    if (resp.ok) { toast('Uploaded!'); loadReadingBooks(); }
    else { var e = await resp.json().catch(function(){return{}}); toast('Upload failed: ' + (e.error || resp.status)); }
  } catch(ex) { toast('Upload failed: ' + ex.message); }
  inp.value = '';
}

// JS 字符串转义——书名含单引号/反斜杠时不炸 inline onclick
function _escJS(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// === Gutenberg 搜索 + 导入 ===
var _gutenbergTimer = null;
function _searchGutenberg(q) {
  clearTimeout(_gutenbergTimer);
  if (!q || q.trim().length < 2) { var r = $('gutenbergResults'); if (r) r.style.display = 'none'; return; }
  _gutenbergTimer = setTimeout(async function() {
    var res = $('gutenbergResults'); if (!res) return;
    res.style.display = 'block';
    res.innerHTML = '<div style="text-align:center;padding:16px;color:var(--books-muted);font:14px var(--font-sans)">Searching...</div>';
    try {
      var resp = await api('/api/reading/gutenberg/search?q=' + encodeURIComponent(q));
      var data = await resp.json();
      var results = Array.isArray(data) ? data : (data.results || []);
      if (data.error) { res.innerHTML = '<div style="text-align:center;padding:16px;color:var(--books-muted);font:14px var(--font-sans)">' + escHtml(data.error) + '<br><span style="font-size:12px">Try VPN if this persists</span></div>'; return; }
      if (!results.length) { res.innerHTML = '<div style="text-align:center;padding:16px;color:var(--books-muted);font:14px var(--font-sans)">No results found</div>'; return; }
      res.innerHTML = results.map(function(b) {
        var formats = Object.keys(b.formats).filter(function(k) { return k.includes('text/plain') || k.includes('text/html') });
        return '<div style="padding:14px 16px;margin-bottom:4px;background:var(--books-card);border-radius:14px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:opacity .2s" onmouseover="this.style.opacity=\'.8\'" onmouseout="this.style.opacity=\'1\'" data-gid="' + b.id + '" data-gtitle="' + escHtml(b.title) + '" onclick="var el=this;_importGutenberg(el.getAttribute(\'data-gid\'),el.getAttribute(\'data-gtitle\'))">' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font:600 15px/1.2 var(--font-serif);color:var(--books-text)">' + escHtml(b.title) + '</div>' +
          '<div style="font:400 12px/1 var(--font-sans);color:var(--books-muted);margin-top:3px">' + (b.authors || 'Unknown') + ' · ' + (b.download_count ? (b.download_count > 1000 ? Math.round(b.download_count/1000) + 'k' : b.download_count) : '0') + ' downloads</div>' +
          '</div>' +
          '<div style="font:500 13px var(--font-sans);color:var(--accent);white-space:nowrap">+ Import</div>' +
          '</div>';
      }).join('');
    } catch(e) { res.innerHTML = '<div style="text-align:center;padding:16px;color:var(--books-muted)">Search unavailable</div>'; }
  }, 400);
}

async function _importGutenberg(gid, title) {
  toast('Importing: ' + title + '...');
  try {
    var resp = await api('/api/reading/gutenberg/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gutenberg_id: gid }) });
    var r = await resp.json();
    if (r.id) {
      // 清理搜索结果
      $('gutenbergSearchInput').value = '';
      var res = $('gutenbergResults'); if (res) { res.style.display = 'none'; res.innerHTML = ''; }
      toast('Imported: ' + title);
      loadReadingBooks();
    } else { toast('Import failed: ' + (r.error || 'unknown')); }
  } catch(e) { toast('Import failed: ' + e.message); }
}

function _relativeTime(ts) {
  if (!ts) return '';
  var raw = typeof ts === 'number' ? ts * 1000 : (typeof ts === 'string' ? Date.parse(ts.replace(' ', 'T')) : ts);
  if (isNaN(raw)) return '';
  var diff = Date.now() - raw;
  if (diff < 0) diff = 0;
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return mins + ' 分钟前';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' 小时前';
  var days = Math.floor(hours / 24);
  if (days < 7) return days + ' 天前';
  var d = new Date(raw);
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// === 批注记录（Kindle + Readwise + Apple Notes 风格） ===
async function _loadAnnotationLog() {
  var list = $('booksBookList');
  if (!list) return;
  try {
    var resp = await fetch('/api/reading/annotations/all', {
      headers: { 'Authorization': 'Bearer ' + (state.token || '') }
    });
    var raw = await resp.json();
    // 兼容旧格式（纯数组）和新格式（{annotations, notes}）
    var allAnnotations = Array.isArray(raw) ? raw : (raw.annotations || []);
    var allNotes = Array.isArray(raw) ? [] : (raw.notes || []);
    if (_annoSearchTerm) {
      var q = _annoSearchTerm.toLowerCase();
      allAnnotations = allAnnotations.filter(function(a) {
        return (a.anchor || '').toLowerCase().indexOf(q) >= 0 ||
               (a.note || '').toLowerCase().indexOf(q) >= 0 ||
               (a.replies || []).some(function(r) { return (r.text || '').toLowerCase().indexOf(q) >= 0; });
      });
      allNotes = allNotes.filter(function(n) {
        return (n.content || '').toLowerCase().indexOf(q) >= 0 ||
               (n.quote || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (!allAnnotations.length && !allNotes.length) {
      list.innerHTML = '<div style="text-align:center;padding:100px 24px;color:var(--books-muted)"><div style="font:400 18px/1.6 var(--font-serif)">No highlights yet</div><div style="font-size:14px;color:var(--books-faint);margin-top:8px">Select text in a book to highlight or annotate</div></div>';
      return;
    }
    // 按书分组统计（标注 + 笔记）
    var bookMap = {};
    allAnnotations.forEach(function(a) {
      var key = a.book_id;
      if (!bookMap[key]) bookMap[key] = { id: a.book_id, title: a.book_title || 'Unknown', author: a.book_author || '', highlights: 0, notes: 0, latest: '', items: [] };
      bookMap[key].highlights++;
      if (!bookMap[key].latest || a.created_at > bookMap[key].latest) bookMap[key].latest = a.created_at;
      bookMap[key].items.push(a);
    });
    allNotes.forEach(function(n) {
      var key = n.book_id;
      if (!bookMap[key]) bookMap[key] = { id: n.book_id, title: n.book_title || 'Unknown', author: n.book_author || '', highlights: 0, notes: 0, latest: '', items: [] };
      bookMap[key].notes++;
      if (!bookMap[key].latest || n.created_at > bookMap[key].latest) bookMap[key].latest = n.created_at;
      bookMap[key].items.push(Object.assign({}, n, { _isNote: true }));
    });
    var books = Object.values(bookMap);
    var totalHighlights = allAnnotations.length;
    var totalNotes = allNotes.length;
    var totalBooks = books.length;

    // 统计头部
    var statParts = [];
    if (totalHighlights) statParts.push(totalHighlights + ' Highlights');
    if (totalNotes) statParts.push(totalNotes + ' Notes');
    statParts.push(totalBooks + ' Book' + (totalBooks !== 1 ? 's' : ''));
    var statsHtml = '<div style="text-align:center;padding:0 24px 20px"><div style="font:400 13px/1.4 var(--font-sans);color:var(--books-muted)">' + statParts.join(' · ') + '</div></div>';

    // 每本书一张大卡片
    var cardsHtml = books.map(function(b) {
      var latestRel = _relativeTime(b.latest);
      var statText = [];
      if (b.highlights) statText.push(b.highlights + ' highlight' + (b.highlights !== 1 ? 's' : ''));
      if (b.notes) statText.push(b.notes + ' note' + (b.notes !== 1 ? 's' : ''));
      if (latestRel) statText.push(latestRel);

      return '<div onclick="_showBookAnnotations(\'' + b.id + '\')" style="margin-bottom:16px;padding:18px 18px 18px 20px;background:#fff;border-radius:20px;cursor:pointer;display:flex;align-items:center;gap:16px" oncontextmenu="event.preventDefault();_showBookDelete(\'' + b.id + '\',\'' + _escJS(b.title) + '\')" ontouchstart="_bookTouchStart(event,\'' + b.id + '\',\'' + _escJS(b.title) + '\')" ontouchend="_bookTouchEnd(event)" ontouchmove="_bookTouchMove(event)">' +
        // 左：3D 书封
        _renderBookCover(b, 60, 80, 13) +
        // 中：书名 + 作者 + 统计
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">' +
        '<div style="font:600 18px/1.25 var(--font-serif);color:var(--books-text);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(b.title) + '</div>' +
        (b.author ? '<div style="font:400 14px/1.3 var(--font-sans);color:var(--books-muted)">' + escHtml(b.author) + '</div>' : '') +
        '<div style="font:400 13px/1.4 var(--font-sans);color:var(--books-faint);margin-top:2px">' + statText.join(' · ') + '</div>' +
        '</div>' +
        // 右：箭头
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--books-faint)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
    }).join('');

    // 存储以便单书详情用
    window._allAnnotationBooks = books;
    _currentAnnoBookId = null; // 回到列表
    list.innerHTML = statsHtml + cardsHtml;
  } catch(e) { list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--books-muted)">Failed to load annotations</div>'; }
}

// 从 Bookmarks 视图打开批注详情卡片
var _bookmarkAnnoMap = {};
var _bookmarkNoteMap = {};
function _openBookmarkAnno(aid) {
  var a = _bookmarkAnnoMap[aid];
  if (!a) { console.warn('_openBookmarkAnno: annotation not found', aid); return; }
  // 同步 book_id，保证回复/换色/删除能路由到正确的书
  currentReadingBookId = a.book_id;
  _currentAnnoBookId = a.book_id;
  _showAnnotationSheet(a);
}
function _openBookmarkNote(nid) {
  console.log('_openBookmarkNote nid=' + nid, '_bookmarkNoteMap has:', _bookmarkNoteMap[nid] ? 'yes' : 'NO');
  var n = _bookmarkNoteMap[nid];
  if (!n) { console.warn('_openBookmarkNote: note not found', nid); return; }
  console.log('_openBookmarkNote note:', n);
  currentReadingBookId = n.book_id;
  _currentAnnoBookId = n.book_id;
  _showNoteSheet(n);
}

// 单书批注详情
function _showBookAnnotations(bookId) {
  _currentAnnoBookId = bookId;
  var books = window._allAnnotationBooks || [];
  var book = books.find(function(b) { return b.id === bookId; });
  if (!book) return;
  var list = $('booksBookList');
  if (!list) return;

  var statParts = [];
  if (book.highlights) statParts.push(book.highlights + ' highlight' + (book.highlights !== 1 ? 's' : ''));
  if (book.notes) statParts.push(book.notes + ' note' + (book.notes !== 1 ? 's' : ''));

  _bookmarkAnnoMap = {};
  _bookmarkNoteMap = {};
  list.innerHTML =
    // 返回 + 书名
    '<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">' +
    '<button onclick="_loadAnnotationLog()" style="width:32px;height:32px;border:none;border-radius:50%;background:rgba(0,0,0,.04);display:grid;place-items:center;cursor:pointer;color:var(--books-text);font-size:16px;flex:none">←</button>' +
    '<div style="flex:1;min-width:0"><div style="font:600 18px/1.25 var(--font-serif);color:var(--books-text);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(book.title) + '</div>' +
    (book.author ? '<div style="font:400 13px/1.3 var(--font-sans);color:var(--books-muted)">' + escHtml(book.author) + '</div>' : '') +
    '</div>' +
    '<div style="font:400 13px var(--font-sans);color:var(--books-faint);flex:none">' + statParts.join(' · ') + '</div>' +
    '</div>' +
    // 批注卡片列表
    book.items.map(function(a) {
      if (a._isNote) {
        _bookmarkNoteMap[a.id] = a;
        var rel2 = _relativeTime(a.created_at);
        var nReplies = a.replies || [];
        var nReplyHint = nReplies.length ? '<span style="font-size:10px;color:var(--books-muted);margin-left:3px">' + nReplies.length + ' reply' + (nReplies.length > 1 ? 's' : '') + '</span>' : '';
        return '' +
        '<div class="reading-note-card" data-note-id="' + a.id + '" onclick="_openBookmarkNote(\'' + a.id + '\')" style="cursor:pointer;margin-bottom:12px;padding:16px;background:var(--books-card);border-radius:18px;transition:background .2s">' +
          (a.quote ? '<blockquote style="margin:0 0 10px;padding:8px 12px;border-left:3px solid rgba(180,160,140,.35);font:italic 400 15px/1.55 var(--font-serif);color:var(--books-muted)">' + escHtml(a.quote) + '</blockquote>' : '') +
          '<p style="font:400 14px/1.6 var(--font-sans);color:var(--books-text);margin:0;white-space:pre-wrap">' + escHtml(a.content) + '</p>' +
          '<div style="margin-top:8px;font:400 11px/1 var(--font-sans);color:var(--books-faint)">Claude' + (rel2 ? ' · ' + rel2 : '') + nReplyHint + '</div>' +
        '</div>';
      }
      var rawWhoA = a.who || 'y';
      var isAiA = rawWhoA.indexOf('_ai') >= 0;
      var color = _hlColors[isAiA ? rawWhoA.split('_')[0] : rawWhoA.charAt(0)] || _hlColors.y;
      var chTitle = a.chapter_title || '';
      var rel = _relativeTime(a.created_at);
      var replyCount = (a.replies || []).length;
      var lastReply = replyCount ? a.replies[replyCount - 1] : null;
      _bookmarkAnnoMap[a.id] = a;
      return '' +
      '<div style="margin-bottom:12px;padding:18px 18px 16px;background:rgba(0,0,0,.045);border:1px solid rgba(0,0,0,.05);border-radius:18px;cursor:pointer" ' +
      'onclick="_openBookmarkAnno(\'' + a.id + '\')" ' +
      'onmousedown="_annoPressStart(event,\'' + a.id + '\',\'' + a.book_id + '\')" ' +
      'ontouchstart="_annoPressStart(event,\'' + a.id + '\',\'' + a.book_id + '\')" ' +
      'ontouchend="_annoPressEnd(event)" ontouchmove="_annoPressEnd(event)" onmouseup="_annoPressEnd(event)" onmouseleave="_annoPressEnd(event)">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex:none"></span>' +
        '<span style="font-size:12px;color:var(--books-faint);letter-spacing:.02em">' + escHtml(chTitle) + '</span>' +
        (rel ? '<span style="font-size:12px;color:var(--books-faint)">· ' + rel + '</span>' : '') +
        '<span style="flex:1"></span>' +
        (replyCount ? '<span style="font-size:11px;color:var(--books-muted);display:flex;align-items:center;gap:3px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' + replyCount + '</span>' : '') +
        '</div>' +
        '<div style="margin:0 0 ' + (a.note || lastReply ? '14' : '0') + 'px;font:italic 16px/1.7 var(--font-serif);color:var(--books-muted)"><mark style="background:' + color + ';border-radius:3px;padding:1px 0">' + escHtml((a.anchor || '').slice(0, 300)) + '</mark></div>' +
        (a.note ? '<div style="margin-bottom:' + (lastReply ? '6' : '0') + 'px;font:400 14px/1.55 var(--font-sans);color:var(--books-muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical">' + escHtml(a.note) + '</div>' : '') +
        (lastReply ? '<div style="padding-top:' + (a.note ? '6' : '0') + 'px;border-top:' + (a.note ? '1px solid rgba(0,0,0,.04)' : 'none') + ';display:flex;align-items:center;gap:6px">' +
          '' +
          '<span style="font-weight:600;font-size:12px;color:' + (lastReply.who === 'ai' ? 'var(--accent,#C89664)' : '#DA7756') + '">' + (lastReply.who === 'ai' ? 'Claude' : '粥粥') + '</span>' +
          '<span style="font-size:13px;color:var(--books-muted);margin-left:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + escHtml((lastReply.text || '').slice(0, 200)) + '</span>' +
          '</div>' : '') +
        '</div>';
    }).join('');
}

async function loadReadingBooks() {
  var resp = await api('/api/reading/books');
  var r = await resp.json();
  var list = $('booksBookList');
  if (!list) return;
  if (!r.length) {
    list.innerHTML = '<div style="text-align:center;padding:80px 24px;color:var(--books-muted)"><div style="font:400 18px/1.6 var(--font-serif)">Your bookshelf is empty</div><div style="font-size:14px;color:var(--books-faint);margin-top:6px">Upload a TXT or EPUB to begin</div></div>';
    return;
  }
  // 按 tab 过滤
  var isFinished = _bookshelfTab === 'finished';
  r = r.filter(function(b) {
    var prog = b.progress && b.progress[0];
    var lastChapter = b.total_chapters > 0 ? b.total_chapters - 1 : 0;
    var done = prog && prog.chapter_index >= lastChapter && lastChapter > 0;
    return isFinished ? done : !done;
  });

  if (!r.length) {
    list.innerHTML = '<div style="text-align:center;padding:80px 24px;color:var(--books-muted)"><div style="font:400 18px/1.6 var(--font-serif)">' + (isFinished ? 'No finished books yet' : 'Your bookshelf is empty') + '</div><div style="font-size:14px;color:var(--books-faint);margin-top:6px">' + (isFinished ? 'Keep reading to finish a book' : 'Upload a TXT or EPUB to begin') + '</div></div>';
    return;
  }

  // Finished 视图：简单网格
  if (isFinished) {
    list.innerHTML = '<div style="display:flex;gap:14px;flex-wrap:wrap">' + r.map(function(b) {
      return '<div onclick="openReader(\'' + b.id + '\')" style="width:calc(33.33% - 10px);cursor:pointer;margin-bottom:16px">' +
        _renderBookCover(b, 0, 0, 14).replace(/width:\d+px/, 'width:100%').replace(/height:\d+px/, 'height:auto;aspect-ratio:.72') +
        '<div style="font:600 13px/1.2 var(--font-serif);color:var(--books-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:8px">' + escHtml(b.title) + '</div>' +
        (b.author ? '<div style="font:400 11px/1 var(--font-sans);color:var(--books-muted);margin-top:2px">' + escHtml(b.author) + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
    return;
  }

  // Reading 视图：当前在读 + 其他
  var current = r[0];
  for (var i = 0; i < r.length; i++) {
    if (r[i].progress && r[i].progress[0] && r[i].progress[0].chapter_index > 0) { current = r[i]; break; }
  }
  var others = r.filter(function(b) { return b.id !== current.id; });

  var grad = _bookCoverGradient(current.id);
  var pct = current.total_chapters > 0 ? Math.round(Math.min(100, (current.progress && current.progress[0] ? (current.progress[0].chapter_index / Math.max(1, current.total_chapters - 1)) * 100 : 0))) : 0;
  var currentChapter = current.progress && current.progress[0] ? (current.progress[0].chapter_index + 1) : 1;
  var hasProgress = pct > 0;

  var html = '' +
    // 当前阅读大卡片
    '<div onclick="openReader(\'' + current.id + '\')" style="margin-bottom:28px;padding:20px;background:#fff;border-radius:20px;cursor:pointer;display:flex;gap:18px">' +
    // 左：3D 书封
    _renderBookCover(current, 76, 106, 15) +
    // 右：书籍信息
    '<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:6px">' +
    (hasProgress ? '<div style="font:400 11px var(--font-sans);color:var(--books-muted);letter-spacing:.04em;text-transform:uppercase">Continue Reading</div>' : '') +
    '<div style="font:600 19px/1.2 var(--font-serif);color:var(--books-text);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(current.title) + '</div>' +
    (current.author ? '<div style="font:400 13px/1 var(--font-sans);color:var(--books-muted)">' + escHtml(current.author) + '</div>' : '') +
    // 进度条 + Read 一行
    '<div style="display:flex;align-items:center;gap:10px;margin-top:4px">' +
    '<div style="flex:1;height:5px;background:rgba(0,0,0,.06);border-radius:3px;overflow:hidden"><div style="height:100%;background:#1C1B19;border-radius:3px;width:' + pct + '%"></div></div>' +
    '<span style="padding:5px 14px;background:#1C1B19;border-radius:16px;color:#fff;font:500 12px var(--font-sans);letter-spacing:.01em;white-space:nowrap">Read →</span>' +
    '</div>' +
    // 页数 + 百分比 放进度条下方
    '<div style="font:400 12px var(--font-sans);color:var(--books-muted);margin-top:2px">' + currentChapter + '/' + current.total_chapters + ' · ' + pct + '%</div>' +
    '</div></div>';

  // 其他书籍 — 水平滚动
  if (others.length) {
    html += '<div style="font:600 13px var(--font-sans);color:var(--books-muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:12px;padding:0 2px">Other Books</div>' +
      '<div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch">' +
      others.map(function(b) {
        return '<div onclick="openReader(\'' + b.id + '\')" style="flex:none;width:98px;cursor:pointer" oncontextmenu="event.preventDefault();_showBookDelete(\'' + b.id + '\',\'' + _escJS(b.title) + '\')" ontouchstart="_bookTouchStart(event,\'' + b.id + '\',\'' + _escJS(b.title) + '\')" ontouchend="_bookTouchEnd(event)" ontouchmove="_bookTouchMove(event)">' +
          _renderBookCover(b, 98, 138, 16).replace('flex:none','flex:none;margin-bottom:18px') +
          '<div style="font:600 13px/1.2 var(--font-serif);color:var(--books-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;padding-left:2px">' + escHtml(b.title) + '</div>' +
          (b.author ? '<div style="font:400 11px/1 var(--font-sans);color:var(--books-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;padding-left:2px">' + escHtml(b.author) + '</div>' : '') +
          '</div>';
      }).join('') +
      '</div>';
  }

  list.innerHTML = html;
}

// === 阅读器 ===
// Port 自 Rifugio: 偏移量定位的 <mark> 渲染
function _fmtParagraphs(text) {
  return text.split(/\n\n+/).filter(function(p) { return p.trim(); }).map(function(p) {
    return '<p style="margin:0 0 1.4em;text-indent:0;line-height:1.9">' + escHtml(p.trim()).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

function _renderReadingNotesCards(notes) {
  if (!notes || !notes.length) return '';
  var html = '<div class="reading-notes-section" style="margin-top:40px;padding-top:28px;border-top:1px solid rgba(0,0,0,.08)">';
  html += '<h3 style="font:600 14px/1 var(--font-sans);color:var(--books-muted);letter-spacing:.04em;text-transform:uppercase;margin:0 0 16px">Reading Notes · ' + notes.length + '</h3>';
  notes.forEach(function(n) {
    var ts = '';
    if (n.created_at) {
      var d = new Date(n.created_at * 1000);
      ts = d.getFullYear() + '/' + (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }
    var replyCount = (n.replies && n.replies.length) ? '<span style="margin-left:4px;color:var(--books-muted);font-size:10px">' + n.replies.length + ' reply' + (n.replies.length > 1 ? 's' : '') + '</span>' : '';
    html += '<div class="reading-note-card" data-note-id="' + n.id + '" onclick="_showNoteSheetById(\'' + n.id + '\')" style="cursor:pointer;background:var(--books-card);border-radius:14px;padding:16px;margin-bottom:12px;transition:background .2s">';
    if (n.quote) {
      html += '<blockquote style="margin:0 0 10px;padding:8px 12px;border-left:3px solid var(--accent,#C89664);font:italic 400 15px/1.55 var(--font-serif);color:var(--books-muted)">' + escHtml(n.quote) + '</blockquote>';
    }
    html += '<p style="font:400 15px/1.6 var(--font-sans);color:var(--books-text);margin:0;white-space:pre-wrap">' + escHtml(n.content) + '</p>';
    html += '<div style="margin-top:10px;font:400 11px/1 var(--font-sans);color:var(--books-faint)">Claude' + (ts ? ' · ' + ts : '') + replyCount + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function _renderBodyWithMarks(content, annotations) {
  var sorted = annotations.slice().sort(function(a, b) { return a.anchor_start - b.anchor_start; });
  var cursor = 0, html = '';
  for (var i = 0; i < sorted.length; i++) {
    var a = sorted[i];
    if (a.anchor_start < cursor) continue;
    // 批注前的普通文字
    html += escHtml(content.slice(cursor, a.anchor_start)).replace(/\n\n+/g, '</p><p style="margin:0 0 1.4em;text-indent:0;line-height:1.9">').replace(/\n/g, '<br>');
    // 划线颜色：who 存 'y_ai'/'p_ai'/... 或 'y'/'p'/'g'/'b'
    var c = (a.who || 'y');
    var isAi = c.indexOf('_ai') >= 0;
    var color = _hlColors[isAi ? c.split('_')[0] : c.charAt(0)] || _hlColors.y;
    var replied = a.replies && a.replies.length > 0;
    var isNew = a._new;
    var cls = 'anno-mark' + (replied ? ' replied' : '') + (isNew ? ' new' : '');
    // 有回复的加下划线
    var extra = replied ? 'border-bottom:1.5px solid rgba(137,174,197,.5)' : '';
    html += '<mark class="' + cls + '" data-anno-id="' + a.id + '" style="background:' + color + ';border-radius:3px;padding:1px 0;' + extra + '">' +
      escHtml(content.slice(a.anchor_start, a.anchor_end)).replace(/\n/g, '<br>') + '</mark>';
    cursor = a.anchor_end;
  }
  html += escHtml(content.slice(cursor)).replace(/\n\n+/g, '</p><p style="margin:0 0 1.4em;text-indent:0;line-height:1.9">').replace(/\n/g, '<br>');
  return '<p style="margin:0 0 1.4em;text-indent:0;line-height:1.9">' + html + '</p>';
}

var _readerSource = 'shelf'; // 'shelf' | 'bookmarks'
async function openReader(bid, source) {
  _readerSource = source || (_bookshelfView === 'annotations' ? 'bookmarks' : 'shelf');
  currentReadingBookId = bid; state.readingBookId = bid;
  try {
    var resp = await api('/api/reading/books/' + bid + '/full');
    var r = await resp.json();
    if (!r || !r.book) { toast('Failed to load book'); return; }
    _readerBook = r; _readerChapterIdx = 0;
    if (r.book.progress && r.book.progress[0]) _readerChapterIdx = r.book.progress[0].chapter_index || 0;
    _renderReader();
  } catch(e) { toast('Failed to load book'); }
}

async function _renderReader() {
  var panel = $('booksPanel');
  var book = _readerBook.book, chapters = _readerBook.chapters;
  var ch = chapters[_readerChapterIdx];
  if (!ch) { _showBookshelf(); return; }
  panel.style.background = 'var(--books-bg)';

  // 先拉批注，再渲染——偏移量需要数据（始终全量加载）
  _lastPollTime = 0;
  await _loadAnnotations(true);

  var grad = _bookCoverGradient(book.id);
  var prog = chapters.length > 1 ? Math.round((_readerChapterIdx / (chapters.length - 1)) * 100) : 0;
  var bodyHtml = _annotations.length > 0
    ? _renderBodyWithMarks(ch.content, _annotations)
    : _fmtParagraphs(ch.content);
  // Claude 的 reading_note 笔记
  bodyHtml += _renderReadingNotesCards(_readingNotes);

  panel.innerHTML =
    // 顶栏
    '<header style="display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top) + 5px) 14px 4px;flex:none">' +
    '<button id="readerBack" style="width:38px;height:38px;border:none;border-radius:50%;background:var(--books-card);display:grid;place-items:center;cursor:pointer;color:var(--books-text);font-size:19px;font-weight:300">←</button>' +
    '<div style="flex:1;min-width:0;text-align:center">' +
    '<div style="font:500 16px/1.2 var(--font-sans);color:var(--books-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(book.title) + '</div>' +
    '</div>' +
    '<button id="readerChapters" style="width:38px;height:38px;border:none;border-radius:50%;background:var(--books-card);display:grid;place-items:center;cursor:pointer;color:var(--books-muted);font-size:18px">☰</button>' +
    '</header>' +

    // 正文
    '<div id="readerContent" style="flex:1;overflow-y:auto;padding:0 24px 40px;-webkit-overflow-scrolling:touch">' +
    '<div style="max-width:600px;margin:0 auto;padding-top:28px">' +
    '<h2 style="font:500 20px/1.4 var(--font-serif);color:var(--books-text);margin:0 0 36px;text-align:center;letter-spacing:-.01em">' + escHtml(ch.title || '') + '</h2>' +
    '<div id="readerBody" style="font:400 17px/1.9 var(--font-serif);color:var(--books-text)">' + bodyHtml + '</div>' +
    '</div></div>' +

    // 底部进度
    '<div style="flex:none;padding:10px 24px calc(env(safe-area-inset-bottom) + 10px)">' +
    '<div style="max-width:600px;margin:0 auto">' +
    '<div style="height:3px;background:rgba(0,0,0,.05);border-radius:2px;overflow:hidden;margin-bottom:10px"><div style="height:100%;background:' + grad[1] + ';border-radius:2px;width:' + prog + '%"></div></div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between">' +
    '<button id="readerPrev" style="border:none;background:none;color:' + (_readerChapterIdx === 0 ? 'var(--books-faint)' : 'var(--accent)') + ';font:400 14px var(--font-sans);cursor:pointer;padding:6px 10px"' + (_readerChapterIdx === 0 ? ' disabled' : '') + '>← Prev</button>' +
    '<span style="font:400 12px var(--font-sans);color:var(--books-muted);letter-spacing:.03em;text-transform:uppercase">' + (_readerChapterIdx + 1) + ' / ' + chapters.length + '</span>' +
    '<button id="readerNext" style="border:none;background:none;color:' + (_readerChapterIdx >= chapters.length - 1 ? 'var(--books-faint)' : 'var(--accent)') + ';font:400 14px var(--font-sans);cursor:pointer;padding:6px 10px"' + (_readerChapterIdx >= chapters.length - 1 ? ' disabled' : '') + '>Next →</button>' +
    '</div></div></div>';

  $('readerBack').onclick = function() {
    _saveProgress();
    if (_readerSource === 'bookmarks') {
      _bookshelfView = 'annotations';
      _showBookshelf();
    } else {
      _showBookshelf();
    }
  };
  $('readerChapters').onclick = _showChapterSheet;
  $('readerPrev').onclick = function() { if (_readerChapterIdx > 0) { _saveProgress(); _readerChapterIdx--; _renderReader(); } };
  $('readerNext').onclick = function() { if (_readerChapterIdx < chapters.length - 1) { _saveProgress(); _readerChapterIdx++; _renderReader(); } };
  _setupSelection();
  _startAnnotationPolling();
  // 绑定荧光笔点击（初次渲染 + 翻章都需要）
  var body = $('readerBody'); if (body) {
    body.querySelectorAll('mark.anno-mark').forEach(function(m) {
      m.onclick = function(e) {
        e.stopPropagation();
        var ann = _annotations.find(function(a) { return a.id === m.dataset.annoId; });
        if (ann) _showAnnotationSheet(ann);
      };
    });
  }
  // 左右点击翻页
  _setupSwipeNav();
}

function _setupSwipeNav() {
  var content = $('readerContent'); if (!content) return;
  var startX = 0, startY = 0;
  content.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
  content.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - startX;
    var dy = Math.abs(e.changedTouches[0].clientY - startY);
    if (Math.abs(dx) < 60 || dy > Math.abs(dx) * 1.5) return;
    if (dx < -40 && _readerChapterIdx < _readerBook.chapters.length - 1) { _saveProgress(); _readerChapterIdx++; _renderReader(); }
    if (dx > 40 && _readerChapterIdx > 0) { _saveProgress(); _readerChapterIdx--; _renderReader(); }
  });
  // 桌面端：点页面左右两侧翻页
  content.addEventListener('click', function(e) {
    var rect = content.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var w = rect.width;
    // 只在点空白区域时翻页（不是 mark 或按钮）
    if (e.target.closest('mark') || e.target.closest('button') || e.target.closest('#_selBar')) return;
    if (x < w * 0.22 && _readerChapterIdx > 0) { _saveProgress(); _readerChapterIdx--; _renderReader(); }
    if (x > w * 0.78 && _readerChapterIdx < _readerBook.chapters.length - 1) { _saveProgress(); _readerChapterIdx++; _renderReader(); }
  });
}

// === 章节底部弹出 ===
function _showChapterSheet() {
  var chapters = _readerBook.chapters;
  var html = '<div id="sheetOverlay" style="position:fixed;inset:0;z-index:85;background:rgba(0,0,0,.25);opacity:0;transition:opacity .3s" onclick="(function(){_closeChapterSheet()})()"></div>' +
    '<div id="chapterSheet" style="position:fixed;inset:auto 0 0;z-index:86;max-height:65vh;background:var(--books-bg);border-radius:22px 22px 0 0;transform:translateY(100%);transition:transform .35s cubic-bezier(.2,.8,.2,1);overflow:hidden;display:flex;flex-direction:column">' +
    '<div style="width:36px;height:5px;background:var(--books-faint);border-radius:3px;margin:10px auto"></div>' +
    '<div style="font:600 17px var(--font-serif);text-align:center;padding:6px 0 14px;color:var(--books-text)">Chapters</div>' +
    '<div style="flex:1;overflow-y:auto;padding:0 16px 24px">' +
    chapters.map(function(c, i) {
      return '<div style="padding:15px 16px;margin-bottom:2px;border-radius:14px;cursor:pointer;font:400 15px/1.35 var(--font-sans);color:' + (i === _readerChapterIdx ? 'var(--accent)' : 'var(--books-text)') + ';background:' + (i === _readerChapterIdx ? 'var(--books-card)' : 'transparent') + '" onclick="(function(){_readerChapterIdx=' + i + ';_closeChapterSheet();_renderReader()})()">' +
        '<span style="font-size:12px;color:var(--books-muted);margin-right:10px">' + (i + 1) + '</span>' + escHtml(c.title || 'Chapter ' + (i + 1)) +
        '</div>';
    }).join('') +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  requestAnimationFrame(function() {
    var ov = $('sheetOverlay'); var sh = $('chapterSheet');
    if (ov) ov.style.opacity = '1';
    if (sh) sh.style.transform = 'translateY(0)';
  });
}
function _closeChapterSheet() {
  var ov = $('sheetOverlay'); var sh = $('chapterSheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  if (ov) ov.style.opacity = '0';
  setTimeout(function() {
    if (ov) ov.remove(); if (sh) sh.remove();
  }, 350);
}

// === 批注加载 + 轮询 ===
var _annotations = [], _readingNotes = [], _pollTimer = null, _lastPollTime = 0;

async function _loadAnnotations(full) {
  if (!currentReadingBookId) return;
  try {
    var url = '/api/reading/books/' + currentReadingBookId + '/chapter/' + _readerChapterIdx + '/annotations';
    if (!full && _lastPollTime) url += '?since=' + _lastPollTime;
    var resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + (state.token || '') }
    });
    var data = await resp.json();
    // 兼容旧格式（纯数组）和新格式（{annotations, notes}）
    var incoming, incomingNotes;
    if (Array.isArray(data)) {
      incoming = data;
      incomingNotes = [];
    } else {
      incoming = data.annotations || [];
      incomingNotes = data.notes || [];
    }
    if (full || !_lastPollTime) {
      _annotations = incoming;
      _readingNotes = incomingNotes;
    } else if (incoming.length || incomingNotes.length) {
      var existingIds = {};
      _annotations.forEach(function(a) { existingIds[a.id] = true; });
      incoming.forEach(function(a) { if (!existingIds[a.id]) { a._new = true; _annotations.push(a); } });
      var existingNoteIds = {};
      _readingNotes.forEach(function(n) { existingNoteIds[n.id] = true; });
      incomingNotes.forEach(function(n) { if (!existingNoteIds[n.id]) { n._new = true; _readingNotes.push(n); } });
    }
    _lastPollTime = Math.floor(Date.now() / 1000);
  } catch(e) {}
}

function _startAnnotationPolling() {
  clearInterval(_pollTimer);
  _pollTimer = setInterval(function() {
    _loadAnnotations(false).then(function() {
      var body = $('readerBody'); if (!body) return;
      var ch = _readerBook && _readerBook.chapters ? _readerBook.chapters[_readerChapterIdx] : null;
      if (!ch) return;
      var html = _annotations.length > 0
        ? _renderBodyWithMarks(ch.content, _annotations)
        : _fmtParagraphs(ch.content);
      html += _renderReadingNotesCards(_readingNotes);
      body.innerHTML = html;
      body.querySelectorAll('mark.anno-mark').forEach(function(m) {
        m.onclick = function(e) {
          e.stopPropagation();
          var ann = _annotations.find(function(a) { return a.id === m.dataset.annoId; });
          if (ann) _showAnnotationSheet(ann);
        };
      });
      // 清除新标记（动画播完不再重复）
      setTimeout(function() { _annotations.forEach(function(a) { a._new = false; }); }, 600);
    });
  }, 30000);
}

// === 选中划线（Port 自 Rifugio + Ocean selectionchange） ===
var _selBar = null, _selDebounce = null;
function _setupSelection() {
  var body = $('readerBody'); if (!body) return;
  body.onmouseup = _onSelection;
  body.ontouchend = _onSelection;
  // iOS WKWebView: touchend 触发时系统还没创建 selection，
  // window.getSelection() 仍是空的。selectionchange 在系统选完后才触发。
  document.addEventListener('selectionchange', function(){
    if (typeof _readerOpen !== 'undefined' && _readerOpen) _onSelection();
  });
}

function _onSelection() {
  clearTimeout(_selDebounce);
  _selDebounce = setTimeout(function() {
    var sel = window.getSelection();
    var text = (sel || '').toString().trim();
    if (!text || text.length < 2 || text.length > 500) { _removeSelBar(); return; }
    var body = $('readerBody');
    if (!body || !sel.rangeCount) { _removeSelBar(); return; }
    var range = sel.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) { _removeSelBar(); return; }
    _showSelBar(sel, text);
  }, 100);
}

var _hlColors = {
  y: 'rgba(255,238,130,.42)',
  p: 'rgba(248,185,205,.42)',
  g: 'rgba(180,225,180,.42)',
  b: 'rgba(175,210,242,.42)'
};
// 工具栏圆点用
var _hlColorsSolid = {
  y: '#F0DFA0',
  p: '#ECC0CE',
  g: '#A8D4A8',
  b: '#A4C8E0'
};

// 荧光笔墨水圆点 — 奶油色底 + 深一度笔触芯
function _inkDot(k, selected, size) {
  var sz = size || 20;
  var base = _hlColorsSolid[k];
  var deep = { y: '#D4C070', p: '#D498AE', g: '#78B878', b: '#74A8C8' }[k] || base;
  var coreSz = Math.round(sz * 0.38);
  return '<span data-ic="' + k + '" class="ink-dot' + (selected ? ' ink-dot-sel' : '') + '" style="' +
    'width:' + sz + 'px;height:' + sz + 'px;' +
    'border-radius:50%;' +
    'background:' + base + ';' +
    'display:grid;place-items:center;' +
    'cursor:pointer;flex:none;' +
    'box-shadow:0 1.5px 3px rgba(0,0,0,.06), inset 0 0 0 1px rgba(255,255,255,.25);' +
    'transition:transform .22s cubic-bezier(.34,1.56,.64,1), box-shadow .22s;' +
    (selected ? 'transform:scale(1.15);box-shadow:0 0 0 2px rgba(0,0,0,.16), 0 1.5px 3px rgba(0,0,0,.06), inset 0 1px 2px rgba(0,0,0,.06);' : '') +
    '"><span style="width:' + coreSz + 'px;height:' + coreSz + 'px;border-radius:50%;background:' + deep + '"></span></span>';
}

function _showSelBar(sel, text) {
  _removeSelBar();
  var rect = sel.getRangeAt(0).getBoundingClientRect();
  var top = Math.max(16, rect.top - 48);
  var left = Math.max(12, Math.min(window.innerWidth - 210, rect.left + rect.width / 2 - 100));

  var bar = document.createElement('div');
  bar.id = '_selBar';
  bar.style.cssText = 'position:fixed;z-index:84;top:' + top + 'px;left:' + left + 'px;display:flex;align-items:center;gap:6px;padding:7px 12px;background:rgba(248,246,242,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:22px;box-shadow:0 4px 20px rgba(0,0,0,.10);animation:annoFadeIn .18s ease';
  var t = text; // 闭包捕获，防止按钮点击时选区消失
  var dot = function(c) {
    return '<span style="display:inline-flex;cursor:pointer" onclick="(function(){_doHighlight(\'' + c + '\',\'' + _escJS(t) + '\');_removeSelBar()})()">' + _inkDot(c, false, 22) + '</span>';
  };
  bar.innerHTML =
    dot('y') + dot('p') + dot('g') + dot('b') +
    '<span style="width:1px;height:20px;background:rgba(0,0,0,.08);margin:0 4px;flex:none"></span>' +
    '<button style="padding:6px 14px;border:none;border-radius:14px;background:#E8B8C0;color:#fff;font:500 13px var(--font-sans);cursor:pointer;white-space:nowrap;flex:none" onclick="(function(){_openNoteEditor(\'' + _escJS(t) + '\');_removeSelBar()})()">写批注</button>';
  document.body.appendChild(bar);
  _selBar = bar;
}

function _removeSelBar() {
  if (_selBar) { _selBar.remove(); _selBar = null; }
}

document.addEventListener('mousedown', function(e) {
  if (_selBar && !e.target.closest('#_selBar') && !e.target.closest('#readerBody') && !e.target.closest('#_noteEditor')) {
    _removeSelBar();
  }
});

// === 计算偏移量（Port 自 Rifugio） ===
function _getSelectionOffsets(anchor) {
  var ch = _readerBook && _readerBook.chapters ? _readerBook.chapters[_readerChapterIdx] : null;
  if (!ch) return null;
  var content = ch.content;
  // 先取选区在正文中的位置
  var sel = window.getSelection();
  if (!sel.rangeCount) {
    // 兜底：用 indexOf
    var idx = content.indexOf(anchor);
    return idx < 0 ? null : { anchor_start: idx, anchor_end: idx + anchor.length };
  }
  var range = sel.getRangeAt(0);
  var body = $('readerBody');
  if (!body || !body.contains(range.commonAncestorContainer)) {
    var idx2 = content.indexOf(anchor);
    return idx2 < 0 ? null : { anchor_start: idx2, anchor_end: idx2 + anchor.length };
  }
  // 创建从正文开头到选区起点的 range
  var prefix = document.createRange();
  prefix.selectNodeContents(body);
  prefix.setEnd(range.startContainer, range.startOffset);
  var leading = prefix.toString().length;
  // 处理选中文字中的前导空白
  var rawText = sel.toString();
  var leadingWS = rawText.length - rawText.trimStart().length;
  var start = leading + leadingWS;
  return { anchor_start: start, anchor_end: start + anchor.length };
}

// === 划线 / 批注保存 ===
function _doHighlight(color, text) {
  text = (text || '').trim();
  if (!text || !currentReadingBookId) { window.getSelection().removeAllRanges(); return; }
  var offsets = _getSelectionOffsets(text);
  try {
    fetch('/api/reading/books/' + currentReadingBookId + '/chapter/' + _readerChapterIdx + '/annotations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (state.token || '') },
      body: JSON.stringify({
        anchor: text.slice(0, 500),
        note: '',
        who: color || 'y',
        anchor_start: offsets ? offsets.anchor_start : -1,
        anchor_end: offsets ? offsets.anchor_end : -1
      })
    }).then(function(r) {
      if (r.ok) { _refreshAnnotations(); }
      else { r.json().then(function(d){ toast('Save failed: ' + (d.error || r.status)); }).catch(function(){ toast('Save failed: ' + r.status); }); }
    }).catch(function(e){ toast('Save failed: ' + (e.message || 'network')); });
  } catch(e) {}
  window.getSelection().removeAllRanges();
}

// === 批注编辑器（底部弹窗，iOS HIG 风格） ===
var _noteEditorColor = 'y';
function _openNoteEditor(text) {
  _removeSelBar();
  _noteEditorColor = 'y';
  var oldOv = $('noteEditorOverlay'); if (oldOv) oldOv.remove();

  var colorKeys = ['y','p','g','b'];
  var colorDots = colorKeys.map(function(k) {
    return '<span data-nc="' + k + '" style="display:inline-flex;cursor:pointer">' + _inkDot(k, k === _noteEditorColor, 22) + '</span>';
  }).join('');

  var html = '' +
    '<div id="noteEditorOverlay" style="position:fixed;inset:0;z-index:89;background:rgba(0,0,0,.16);opacity:0;transition:opacity .4s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)" onclick="_closeNoteEditor()"></div>' +
    '<div id="noteEditorSheet" style="position:fixed;inset:auto 0 0;z-index:90;height:62vh;background:rgba(250,248,244,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:32px 32px 0 0;transform:translateY(100%);transition:transform .45s cubic-bezier(.22,.61,.36,1);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 -2px 24px rgba(0,0,0,.08)">' +
    // 拖拽把手
    '<div style="flex:none;padding:12px 0 6px;display:flex;justify-content:center"><div style="width:36px;height:5px;background:rgba(0,0,0,.12);border-radius:3px"></div></div>' +
    // 内容
    '<div style="flex:1;overflow-y:auto;padding:8px 24px 24px">' +
    // 引文
    '<blockquote style="margin:0 0 20px;padding:14px 18px;background:var(--books-card);border-radius:16px;font:italic 16px/1.6 var(--font-serif);color:var(--books-muted)">' + escHtml(text.slice(0, 300)) + '</blockquote>' +
    // 颜色选择
    '<div style="margin-bottom:18px"><div style="font:500 12px var(--font-sans);color:var(--books-muted);margin-bottom:10px;letter-spacing:.02em">HIGHLIGHT COLOR</div>' +
    '<div style="display:flex;gap:10px">' + colorDots + '</div></div>' +
    // 输入区
    '<textarea id="_noteTextarea" placeholder="Write your note..." style="width:100%;height:100px;border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:14px 16px;font:400 15px/1.5 var(--font-sans);color:var(--books-text);background:rgba(0,0,0,.02);resize:none;outline:none;box-sizing:border-box" onfocus="this.style.borderColor=\'rgba(0,0,0,.18)\'" onblur="this.style.borderColor=\'rgba(0,0,0,.08)\'"></textarea>' +
    '</div>' +
    // 底部按钮
    '<div style="flex:none;padding:16px 24px calc(env(safe-area-inset-bottom) + 16px);display:flex;gap:12px">' +
    '<button onclick="_closeNoteEditor()" style="flex:1;padding:14px 0;border:none;border-radius:18px;background:rgba(0,0,0,.05);color:var(--books-text);font:600 15px var(--font-sans);cursor:pointer">Cancel</button>' +
    '<button id="_noteSaveBtn" onclick="_doSaveNote()" style="flex:1;padding:14px 0;border:none;border-radius:18px;background:#E8B8C0;color:#fff;font:600 15px var(--font-sans);cursor:pointer">Save</button>' +
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  requestAnimationFrame(function() {
    var ov = $('noteEditorOverlay'); var sh = $('noteEditorSheet');
    if (ov) ov.style.opacity = '1';
    if (sh) sh.style.transform = 'translateY(0)';
  });

  window._noteEditorText = text;

  // 颜色切换
  setTimeout(function() {
    document.querySelectorAll('#noteEditorSheet [data-nc]').forEach(function(dot) {
      dot.addEventListener('click', function() {
        _noteEditorColor = this.getAttribute('data-nc');
        document.querySelectorAll('#noteEditorSheet [data-nc]').forEach(function(d) {
          var ink = d.querySelector('.ink-dot');
          var sel = d.getAttribute('data-nc') === _noteEditorColor;
          if (ink) {
            if (sel) { ink.classList.add('ink-dot-sel'); ink.style.transform = 'scale(1.15)'; ink.style.boxShadow = '0 0 0 2px rgba(0,0,0,.16), 0 1.5px 3px rgba(0,0,0,.06), inset 0 1px 2px rgba(0,0,0,.06)'; }
            else { ink.classList.remove('ink-dot-sel'); ink.style.transform = ''; ink.style.boxShadow = '0 1.5px 3px rgba(0,0,0,.06), inset 0 0 0 1px rgba(255,255,255,.25)'; }
          }
        });
      });
    });
    var ta = $('_noteTextarea'); if (ta) ta.focus();
  }, 100);
}

function _closeNoteEditor() {
  var ov = $('noteEditorOverlay'); var sh = $('noteEditorSheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  if (ov) ov.style.opacity = '0';
  setTimeout(function() {
    if (ov) ov.remove(); if (sh) sh.remove();
  }, 450);
}

async function _doSaveNote() {
  var ta = $('_noteTextarea');
  var note = ta ? ta.value.trim() : '';
  if (!note) { _closeNoteEditor(); return; }
  await _saveAnnotationWithColor(window._noteEditorText, note, _noteEditorColor);
  _closeNoteEditor();
}

async function _saveAnnotationWithColor(text, note, color) {
  if (!text || !currentReadingBookId) return;
  var offsets = _getSelectionOffsets(text);
  try {
    var resp = await fetch('/api/reading/books/' + currentReadingBookId + '/chapter/' + _readerChapterIdx + '/annotations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (state.token || '') },
      body: JSON.stringify({
        anchor: text.slice(0, 500),
        note: note.slice(0, 4000),
        who: color || 'y',
        anchor_start: offsets ? offsets.anchor_start : -1,
        anchor_end: offsets ? offsets.anchor_end : -1
      })
    });
    if (resp.ok) {
      var data = await resp.json();
      toast('批注已保存');
      await _refreshAnnotations();
      var savedId = data.annotation ? data.annotation.id : data.id;
      var ann = null;
      for (var i = 0; i < _annotations.length; i++) {
        if (_annotations[i].id === savedId) { ann = _annotations[i]; break; }
      }
      if (!ann) ann = _annotations[_annotations.length - 1];
      if (ann) _showAnnotationSheet(ann);
      else toast('已保存，刷新后可见');
    } else {
      var errText = '';
      try { var errData = await resp.json(); errText = errData.error || errData.detail || ''; } catch(e) {}
      toast('保存失败: ' + (errText || resp.status));
    }
  } catch(e) { toast('保存失败: ' + (e.message || 'network error')); }
  window.getSelection().removeAllRanges();
}

async function _saveAnnotation(text, note) {
  if (!text || !currentReadingBookId) return;
  var offsets = _getSelectionOffsets(text);
  var body = {
    anchor: text.slice(0, 500),
    note: note.slice(0, 4000),
    who: 'y',
    anchor_start: offsets ? offsets.anchor_start : -1,
    anchor_end: offsets ? offsets.anchor_end : -1
  };
  try {
    var resp = await fetch('/api/reading/books/' + currentReadingBookId + '/chapter/' + _readerChapterIdx + '/annotations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (state.token || '') },
      body: JSON.stringify(body)
    });
    if (resp.ok) {
      var data = await resp.json();
      toast('批注已保存');
      await _refreshAnnotations();
      var savedId = data.annotation ? data.annotation.id : data.id;
      var ann = null;
      for (var i = 0; i < _annotations.length; i++) {
        if (_annotations[i].id === savedId) { ann = _annotations[i]; break; }
      }
      if (!ann) ann = _annotations[_annotations.length - 1];
      if (ann) _showAnnotationSheet(ann);
      else toast('已保存，刷新后可见');
    } else {
      var errText = '';
      try { var errData = await resp.json(); errText = errData.error || errData.detail || ''; } catch(e) {}
      toast('保存失败: ' + (errText || resp.status));
    }
  } catch(e) { toast('保存失败: ' + (e.message || 'network error')); }
  window.getSelection().removeAllRanges();
}

async function _refreshAnnotations() {
  _lastPollTime = 0;
  await _loadAnnotations(true);
  var body = $('readerBody'); if (!body) return;
  var ch = _readerBook && _readerBook.chapters ? _readerBook.chapters[_readerChapterIdx] : null;
  if (!ch) return;
  var html = _annotations.length > 0
    ? _renderBodyWithMarks(ch.content, _annotations)
    : _fmtParagraphs(ch.content);
  html += _renderReadingNotesCards(_readingNotes);
  body.innerHTML = html;
  // 重新绑定 mark 点击
  body.querySelectorAll('mark.anno-mark').forEach(function(m) {
    m.onclick = function(e) {
      e.stopPropagation();
      var ann = _annotations.find(function(a) { return a.id === m.dataset.annoId; });
      if (ann) _showAnnotationSheet(ann);
    };
  });
}

// === 批注面板（底部 sheet，Apple HIG 纸质风格） ===
var _sheetHeight = 55; // vh
function _showAnnotationSheet(annotation) {
  var oldOv = $('annotationSheetOverlay'); if (oldOv) oldOv.remove();
  var replies = annotation.replies || [];
  var rawWho = annotation.who || 'y';
  var isAi = rawWho.indexOf('_ai') >= 0;
  var curColor = isAi ? rawWho.split('_')[0] : rawWho.charAt(0);
  var color = _hlColors[curColor] || _hlColors.y;
  var rawTs = annotation.created_at || annotation.createdAt || '';
  var t = typeof rawTs === 'number' ? new Date(rawTs * 1000) : new Date(String(rawTs).replace(' ', 'T'));
  var ts = isNaN(t.getTime()) ? '' : t.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  var whoLabel = isAi ? 'Claude' : '粥粥';

  var colorKeys = ['y','p','g','b'];
  var colorDots = colorKeys.map(function(k) {
    return '<span data-c="' + k + '" style="display:inline-flex;cursor:pointer">' + _inkDot(k, k === curColor, 20) + '</span>';
  }).join('');

  var html = '' +
    '<div id="annotationSheetOverlay" style="position:fixed;inset:0;z-index:85;background:rgba(0,0,0,.16);opacity:0;transition:opacity .4s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)" onclick="_closeAnnotationSheet()"></div>' +
    '<div id="annotationSheet" style="position:fixed;inset:auto 0 0;z-index:86;height:' + _sheetHeight + 'vh;background:rgba(248,246,242,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:28px 28px 0 0;transform:translateY(100%);transition:transform .45s cubic-bezier(.22,.61,.36,1);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 -2px 24px rgba(0,0,0,.08)">' +
    // 拖拽把手 + 关闭
    '<div id="_sheetDragHandle" style="flex:none;padding:12px 24px 6px;cursor:ns-resize;touch-action:none;display:flex;align-items:center;justify-content:space-between">' +
    '<div style="width:36px;height:5px;background:rgba(0,0,0,.12);border-radius:3px"></div>' +
    '<button onclick="_closeAnnotationSheet()" style="width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.06);display:grid;place-items:center;cursor:pointer;color:var(--books-muted);font-size:16px;font-weight:300">×</button>' +
    '</div>' +
    // 内容区
    '<div style="flex:1;overflow-y:auto;padding:8px 24px 24px">' +
    // 章节 + 时间
    ((annotation.chapter_title || ts) ? '<div style="font-size:11px;color:var(--books-faint);margin-bottom:10px;letter-spacing:.02em">' + escHtml(annotation.chapter_title || '') + (annotation.chapter_title && ts ? ' · ' : '') + (ts || '') + '</div>' : '') +
    // 引文：灰底卡片 + 荧光笔 mark v2
    '<div style="margin:0 0 16px;padding:16px 18px;background:var(--books-card);border-radius:16px;font:italic 16px/1.75 var(--font-serif);color:var(--books-muted)"><span class="hl-marker-' + curColor + '">' + escHtml((annotation.anchor || '').slice(0, 300)) + '</span></div>' +
    // 批注：同色竖线 + 批注人 · 时间 + 内容
    (annotation.note ? '<div style="display:flex;gap:12px;margin-bottom:20px">' +
      '<div style="width:4px;border-radius:8px;background:' + (_hlColorsSolid[curColor] || _hlColorsSolid.y) + ';flex:none;align-self:stretch;opacity:.72"></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="font-weight:600;font-size:14px;color:var(--books-text)">' + whoLabel + '</span>' + (ts ? '<span style="font-weight:400;font-size:11px;color:var(--books-muted)">· ' + ts + '</span>' : '') + '</div>' +
      '<div style="font:400 15px/1.6 var(--font-sans);color:var(--books-text)">' + escHtml(annotation.note) + '</div>' +
      '</div></div>' : '') +
    // 回复 — 垂直对话（带删除）
    replies.map(function(r) {
      var rWho = r.who === 'ai' ? 'Claude' : '粥粥';
      var rid = r.id || '';
      return '<div style="display:flex;gap:10px;margin-bottom:16px;position:relative">' +
        '<div style="width:4px;border-radius:8px;background:' + (_hlColorsSolid[curColor] || _hlColorsSolid.y) + ';flex:none;opacity:.72"></div>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">' +
        '<span style="font-weight:600;font-size:14px;color:var(--books-text)">' + rWho + '</span>' +
        '<button onclick="_deleteReply(\'' + annotation.id + '\',\'' + rid + '\')" style="border:0;background:transparent;color:var(--books-muted);font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;opacity:.5">×</button>' +
        '</div>' +
        '<div style="font:400 15px/1.6 var(--font-sans);color:var(--books-text)">' + escHtml(r.text || '') + '</div>' +
        '</div></div>';
    }).join('') +
    // 回复输入框
    '<div style="display:flex;gap:10px;margin-top:4px;padding-top:16px;border-top:1px solid rgba(0,0,0,.06)">' +
    '<input type="text" id="_replyInput" placeholder="Reply..." style="flex:1;border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:11px 16px;font:400 15px/1.4 var(--font-sans);color:var(--books-text);background:rgba(0,0,0,.02);outline:none" onfocus="this.style.borderColor=\'rgba(0,0,0,.18)\'" onblur="this.style.borderColor=\'rgba(0,0,0,.08)\'">' +
    '<button id="_replySend" disabled style="padding:10px 18px;border:none;border-radius:14px;background:#E8B8C0;color:#fff;font:600 14px var(--font-sans);cursor:pointer;white-space:nowrap;opacity:.35;transition:opacity .2s">Send</button>' +
    '</div>' +
    // 底部工具栏：颜色选择 + 删除
    '<div style="display:flex;align-items:center;gap:6px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(0,0,0,.05)">' +
    colorDots +
    '<div style="flex:1"></div>' +
    '<button id="_deleteAnno" style="padding:6px 12px;border:none;border-radius:8px;background:transparent;color:var(--books-muted);font:400 12px var(--font-sans);cursor:pointer">Delete</button>' +
    '</div>' +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  // 拖拽拉高
  setTimeout(function() {
    var handle = $('_sheetDragHandle'); if (!handle) return;
    var startY = 0, startH = 0;
    var onStart = function(e) {
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      startH = _sheetHeight;
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onEnd);
    };
    var onMove = function(e) {
      var y = (e.touches ? e.touches[0].clientY : e.clientY);
      var dy = startY - y;
      var vh = window.innerHeight / 100;
      var newH = Math.min(92, Math.max(35, startH + dy / vh));
      _sheetHeight = newH;
      var sh = $('annotationSheet'); if (sh) sh.style.height = newH + 'vh';
      if (e.preventDefault) e.preventDefault();
    };
    var onEnd = function() {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd);
    };
    handle.addEventListener('mousedown', onStart); handle.addEventListener('touchstart', onStart, { passive: false });
  }, 100);

  requestAnimationFrame(function() {
    var ov = $('annotationSheetOverlay'); var sh = $('annotationSheet');
    if (ov) ov.style.opacity = '1';
    if (sh) sh.style.transform = 'translateY(0)';
  });

  // 绑定事件
  setTimeout(function() {
    var sendBtn = $('_replySend');
    var input = $('_replyInput');
    var delBtn = $('_deleteAnno');
    if (delBtn) delBtn.onclick = function() { _deleteAnnotation(annotation); };
    if (sendBtn) sendBtn.onclick = function() { _postReply(annotation, input); };
    if (input) {
      input.onkeydown = function(e) { if (e.key === 'Enter') _postReply(annotation, input); };
      input.oninput = function() {
        if (sendBtn) {
          var has = !!input.value.trim();
          sendBtn.disabled = !has;
          sendBtn.style.opacity = has ? '1' : '.35';
        }
      };
    }
    // 颜色切换
    document.querySelectorAll('#annotationSheet [data-c]').forEach(function(dot) {
      dot.addEventListener('click', function() {
        var newColor = this.getAttribute('data-c');
        _updateAnnotationColor(annotation, newColor);
        // 更新选中态
        document.querySelectorAll('#annotationSheet [data-c]').forEach(function(d) {
          var ink = d.querySelector('.ink-dot');
          var sel = d.getAttribute('data-c') === newColor;
          if (ink) {
            if (sel) { ink.classList.add('ink-dot-sel'); ink.style.transform = 'scale(1.15)'; ink.style.boxShadow = '0 0 0 2px rgba(0,0,0,.16), 0 1.5px 3px rgba(0,0,0,.06), inset 0 1px 2px rgba(0,0,0,.06)'; }
            else { ink.classList.remove('ink-dot-sel'); ink.style.transform = ''; ink.style.boxShadow = '0 1.5px 3px rgba(0,0,0,.06), inset 0 0 0 1px rgba(255,255,255,.25)'; }
          }
        });
      });
    });
  }, 50);
}

async function _updateAnnotationColor(annotation, color) {
  if (!annotation || (!currentReadingBookId && !annotation.book_id)) return;
  var bid = annotation.book_id || currentReadingBookId;
  try {
    await fetch('/api/reading/books/' + bid + '/annotations/' + annotation.id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (state.token || '') },
      body: JSON.stringify({ who: color })
    });
    annotation.who = color;
    await _refreshAnnotations();
    var updated = _annotations.find(function(a) { return a.id === annotation.id; });
    if (updated) _showAnnotationSheet(updated);
    else _showAnnotationSheet(annotation);
  } catch(e) {}
}

function _closeAnnotationSheet() {
  var ov = $('annotationSheetOverlay'); var sh = $('annotationSheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  if (ov) ov.style.opacity = '0';
  setTimeout(function() {
    if (ov) ov.remove(); if (sh) sh.remove();
  }, 350);
}

// === 阅读笔记详情卡片（点击 reading_note 打开） ===
function _showNoteSheetById(noteId) {
  var note = _readingNotes.find(function(n) { return n.id === noteId; });
  if (!note) return;
  _showNoteSheet(note);
}

function _showNoteSheet(note) {
  var oldOv = document.getElementById('noteSheetOverlay'); if (oldOv) oldOv.remove();
  var oldSh = document.getElementById('noteSheet'); if (oldSh) oldSh.remove();
  // 也关掉批注卡片
  _closeAnnotationSheet();

  var replies = note.replies || [];
  var rawTs = note.created_at;
  var t = typeof rawTs === 'number' ? new Date(rawTs * 1000) : new Date(String(rawTs || '').replace(' ', 'T'));
  var ts = isNaN(t.getTime()) ? '' : t.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  var replyHtml = replies.length ? replies.map(function(r) {
    var rWho = r.who === 'ai' ? 'Claude' : '粥粥';
    return '<div style="display:flex;gap:10px;margin-bottom:16px">' +
      '<div style="width:4px;border-radius:2px;background:rgba(180,160,140,.25);flex:none"></div>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="margin-bottom:3px"><span style="font-weight:600;font-size:14px;color:var(--books-text)">' + rWho + '</span></div>' +
      '<div style="font:400 15px/1.6 var(--font-sans);color:var(--books-text)">' + escHtml(r.text || '') + '</div>' +
      '</div></div>';
  }).join('') : '<div style="font:400 14px/1.5 var(--font-sans);color:var(--books-muted);padding:12px 0">还没有回复</div>';

  var html = '' +
    '<div id="noteSheetOverlay" style="position:fixed;inset:0;z-index:85;background:rgba(0,0,0,.16);opacity:0;transition:opacity .4s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)" onclick="_closeNoteSheet()"></div>' +
    '<div id="noteSheet" style="position:fixed;inset:auto 0 0;z-index:86;height:55vh;background:rgba(248,246,242,.88);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:28px 28px 0 0;transform:translateY(100%);transition:transform .45s cubic-bezier(.22,.61,.36,1);overflow:hidden;display:flex;flex-direction:column;box-shadow:0 -2px 24px rgba(0,0,0,.08)">' +
    '<div style="flex:none;padding:12px 24px 6px;display:flex;align-items:center;justify-content:space-between">' +
    '<div style="width:36px;height:5px;background:rgba(0,0,0,.12);border-radius:3px"></div>' +
    '<button onclick="_closeNoteSheet()" style="width:30px;height:30px;border:none;border-radius:50%;background:rgba(0,0,0,.06);display:grid;place-items:center;cursor:pointer;color:var(--books-muted);font-size:16px;font-weight:300">×</button>' +
    '</div>' +
    '<div style="flex:1;overflow:auto;padding:0 24px 24px;-webkit-overflow-scrolling:touch">' +
    // 引用
    (note.quote ? '<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid rgba(180,160,140,.35);font:italic 400 16px/1.55 var(--font-serif);color:var(--books-muted)">' + escHtml(note.quote) + '</blockquote>' : '') +
    // 正文
    '<div style="font:400 16px/1.7 var(--font-sans);color:var(--books-text);white-space:pre-wrap;margin-bottom:8px">' + escHtml(note.content || '') + '</div>' +
    // 作者+时间
    '<div style="margin-bottom:20px;font:400 12px/1 var(--font-sans);color:var(--books-faint)">Claude' + (ts ? ' · ' + ts : '') + '</div>' +
    // 分隔
    '<div style="height:1px;background:rgba(0,0,0,.06);margin-bottom:16px"></div>' +
    // 回复列表
    replyHtml +
    // 回复输入 + 删除
    '<div style="display:flex;gap:10px;margin-top:4px;padding-top:16px;border-top:1px solid rgba(0,0,0,.06)">' +
    '<input type="text" id="_noteReplyInput" placeholder="Reply..." style="flex:1;border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:11px 16px;font:400 15px/1.4 var(--font-sans);color:var(--books-text);background:rgba(0,0,0,.02);outline:none" onfocus="this.style.borderColor=\'rgba(0,0,0,.18)\'" onblur="this.style.borderColor=\'rgba(0,0,0,.08)\'">' +
    '<button id="_noteReplySend" disabled style="padding:10px 18px;border:none;border-radius:14px;background:#E8B8C0;color:#fff;font:600 14px var(--font-sans);cursor:pointer;white-space:nowrap;opacity:.35;transition:opacity .2s">Send</button>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;margin-top:10px">' +
    '<button id="_deleteNote" style="padding:5px 10px;border:none;border-radius:6px;background:transparent;color:var(--books-faint);font:400 11px var(--font-sans);cursor:pointer">Delete</button>' +
    '</div>' +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  requestAnimationFrame(function() {
    var ov = document.getElementById('noteSheetOverlay'); var sh = document.getElementById('noteSheet');
    if (ov) ov.style.opacity = '1';
    if (sh) sh.style.transform = 'translateY(0)';
  });

  setTimeout(function() {
    var sendBtn = document.getElementById('_noteReplySend');
    var input = document.getElementById('_noteReplyInput');
    var delBtn = document.getElementById('_deleteNote');
    if (delBtn) delBtn.onclick = function() { _deleteNote(note); };
    if (sendBtn) sendBtn.onclick = function() { _postNoteReply(note, input); };
    if (input) {
      input.onkeydown = function(e) { if (e.key === 'Enter') _postNoteReply(note, input); };
      input.oninput = function() {
        if (sendBtn) {
          var has = !!input.value.trim();
          sendBtn.disabled = !has;
          sendBtn.style.opacity = has ? '1' : '.35';
        }
      };
    }
  }, 50);
}

function _deleteNote(note) {
  console.log('_deleteNote called', note);
  if (!note || !note.id) { console.warn('_deleteNote: no note or id'); return; }
  if (!confirm('删除这条笔记？')) return;
  (async function() {
    try {
      var url = '/api/reading/notes/' + encodeURIComponent(note.id);
      console.log('DELETE', url);
      var resp = await fetch(url, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + (state.token || '') }
      });
      console.log('DELETE resp', resp.status);
      if (resp.ok) {
        toast('已删除');
        var ov = document.getElementById('noteSheetOverlay'); if (ov) ov.remove();
        var sh = document.getElementById('noteSheet'); if (sh) sh.remove();
        var savedBookId = _currentAnnoBookId;
        await _loadAnnotationLog();
        if (savedBookId) { _currentAnnoBookId = savedBookId; _showBookAnnotations(savedBookId); }
      } else {
        var txt = await resp.text().catch(function(){return ''});
        console.error('Delete note failed:', resp.status, txt);
        toast('删除失败: ' + resp.status);
      }
    } catch(e) { console.error('Delete note error:', e); toast('删除失败'); }
  })();
}

function _closeNoteSheet() {
  var ov = document.getElementById('noteSheetOverlay'); var sh = document.getElementById('noteSheet');
  if (sh) sh.style.transform = 'translateY(100%)';
  if (ov) ov.style.opacity = '0';
  setTimeout(function() {
    if (ov) ov.remove(); if (sh) sh.remove();
  }, 350);
}

async function _postNoteReply(note, input) {
  var text = (input.value || '').trim();
  if (!text || !note || !note.id) return;
  try {
    var resp = await fetch('/api/reading/notes/' + note.id + '/replies', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (state.token || '') },
      body: JSON.stringify({ who: 'user', text: text })
    });
    if (resp.ok) {
      var data = await resp.json();
      if (!note.replies) note.replies = [];
      note.replies.push({ id: data.id, note_id: note.id, who: 'user', text: text });
      input.value = '';
      _showNoteSheet(note);
      toast('回复已发送');
    }
  } catch(e) { toast('发送失败'); }
}

async function _postReply(annotation, input) {
  var text = (input.value || '').trim();
  if (!text || !annotation || (!currentReadingBookId && !annotation.book_id)) return;
  var bid = annotation.book_id || currentReadingBookId;
  try {
    var resp = await fetch('/api/reading/books/' + bid + '/annotations/' + annotation.id + '/replies', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (state.token || '') },
      body: JSON.stringify({ who: 'user', text: text })
    });
    if (resp.ok) {
      input.value = '';
      toast('回复已发送');
      // 将新回复追加到 annotation 对象，确保不依赖 reader 的 _annotations
      var data = await resp.json().catch(function(){return{}});
      annotation.replies = annotation.replies || [];
      annotation.replies.push({ id: data.id || '', who: 'user', text: text });
      await _refreshAnnotations();
      var updated = _annotations.find(function(a) { return a.id === annotation.id; });
      if (updated) _showAnnotationSheet(updated);
      else _showAnnotationSheet(annotation);
    }
  } catch(e) { toast('发送失败'); }
}

function _findAnnotation(aid) {
  for (var i = 0; i < _annotations.length; i++) {
    if (_annotations[i].id === aid) return _annotations[i];
  }
  // Also check replies
  for (var i = 0; i < _annotations.length; i++) {
    var replies = _annotations[i].replies || [];
    for (var j = 0; j < replies.length; j++) {
      if (replies[j].id === aid) return _annotations[i];
    }
  }
  return null;
}

async function _deleteReply(aid, rid) {
  if (!aid || !rid || !currentReadingBookId) return;
  if (!confirm('Delete this reply?')) return;
  try {
    var resp = await fetch('/api/reading/books/' + currentReadingBookId + '/annotations/' + aid + '/replies/' + rid, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + (state.token || '') }
    });
    if (resp.ok) {
      toast('Reply deleted');
      await _refreshAnnotations();
      var ann = _findAnnotation(aid);
      if (ann) _showAnnotationSheet(ann);
    }
  } catch(e) { toast('Delete failed'); }
}

async function _deleteAnnotation(annotation) {
  if (!annotation || (!currentReadingBookId && !annotation.book_id)) return;
  if (!confirm('删除这条批注？')) return;
  var bid = annotation.book_id || currentReadingBookId;
  try {
    var resp = await fetch('/api/reading/books/' + bid + '/annotations/' + annotation.id, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + (state.token || '') }
    });
    if (resp.ok) {
      toast('已删除');
      var ov = $('annotationSheetOverlay'); if (ov) ov.remove();
      var sh = $('annotationSheet'); if (sh) sh.remove();
      await _refreshAnnotations();
      // 重新从 API 拉取最新数据，确保缓存和视图一致
      var savedBookId = _currentAnnoBookId;
      await _loadAnnotationLog();
      if (savedBookId) { _currentAnnoBookId = savedBookId; _showBookAnnotations(savedBookId); }
    }
  } catch(e) { toast('删除失败'); }
}
// === 进度 ===
function _saveProgress() {
  if (!currentReadingBookId) return;
  try {
    fetch('/api/reading/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.token },
      body: JSON.stringify({ book_id: currentReadingBookId, chapter_index: _readerChapterIdx, scroll_pos: 0 })
    }).catch(function() {});
  } catch(e) {}
}

// === 长按删除 ===
var _bookTouchTimer = null, _bookTouchBid = null, _bookTouchTitle = null;
function _bookTouchStart(e, bid, title) {
  _bookTouchBid = bid; _bookTouchTitle = title;
  _bookTouchTimer = setTimeout(function() { _showBookDelete(bid, title); }, 600);
}
function _bookTouchEnd(e) { clearTimeout(_bookTouchTimer); }
function _bookTouchMove(e) { clearTimeout(_bookTouchTimer); }

// 批注卡片长按删除
var _annoPressTimer = null, _annoPressId = null, _annoPressBookId = null;
function _annoPressStart(e, aid, bid) {
  _annoPressId = aid; _annoPressBookId = bid;
  _annoPressTimer = setTimeout(function() {
    if (!confirm('删除这条批注？')) return;
    (async function() {
      try {
        var resp = await fetch('/api/reading/books/' + _annoPressBookId + '/annotations/' + _annoPressId, {
          method: 'DELETE', headers: { 'Authorization': 'Bearer ' + (state.token || '') }
        });
        if (resp.ok) { toast('已删除'); await _refreshAnnotations(); if (_currentAnnoBookId) { _showBookAnnotations(_currentAnnoBookId); } else { _loadAnnotationLog(); } }
      } catch(e) {}
    })();
  }, 600);
}
function _annoPressEnd(e) { clearTimeout(_annoPressTimer); }
function _showBookDelete(bid, title) {
  if (!confirm('Delete "' + title + '" and all its notes?')) return;
  (async function() {
    var resp = await api('/api/reading/books/' + bid, { method: 'DELETE' });
    if (resp.ok) { loadReadingBooks(); toast('Deleted'); }
  })();
}

// === 兼容旧接口 ===
function selectReadingBook(bid, title) {
  currentReadingBookId = bid; state.readingBookId = bid;
  closeBooksPanel(); newChat();
  toast('Reading: ' + title + ' — AI can now discuss this book with you.');
}
async function deleteReadingBook(bid) {
  if (!confirm('Delete this book and all notes?')) return;
  var resp = await api('/api/reading/books/' + bid, { method: 'DELETE' });
  if (resp.ok) { loadReadingBooks(); toast('Deleted'); }
}

// === 暗色模式 ===
(function() {
  function _booksApplyTheme() {
    var isDark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
    var panel = document.getElementById('booksPanel');
    if (panel) panel.style.background = isDark ? '#1C1A17' : '#F8F6F3';
  }
  _booksApplyTheme();
  new MutationObserver(_booksApplyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', _booksApplyTheme);
})();
