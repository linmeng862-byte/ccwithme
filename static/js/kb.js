// === 知识库页（2026-09-25）===
// 后端在 backend.js「知识库」那一段（_kbScan / _kbGet / _kbPut），文件在 data/kb/<分块>/<标题>.md。
//
// 【三个视图】目录（分块 + 标签 + 搜索）/ 一篇（渲染 + [[双链]] + 反链）/ 关系图（力导向，canvas 手画）。
// 编辑就是一个 textarea —— 她在手机上，富文本编辑器又重又容易吃字。
//
// 【渲染安全】用独立的 marked 实例，原始 HTML 一律转义、只放行 http(s)/mailto/kb: 链接。
//   不能 marked.use() 改全局那个 —— 聊天气泡也在用它。
// 【并发】保存带 base_mtime，他（kb_write）或砚在她打开之后改过，后端回 409，这儿提示她别盖掉。

console.log('[kb] v1 — 知识库');

var _KB_COLORS = { '一起': '#DA7756', '沈辞': '#5B8DEF', '粥粥': '#E58FB0', '砚': '#4FA37A',
  '日记': '#A08C6E', '记忆': '#9C7FD1', '偏好': '#C9A53A', '聊天': '#7FA8B8' };
var _kb = { list: [], folder: '', tag: '', q: '', cur: null, view: 'list', graph: null, raf: 0 };
var _kbMd = null;

function _kbMarked() {
  if (_kbMd) return _kbMd;
  _kbMd = new marked.Marked({ gfm: true, breaks: true });
  _kbMd.use({ renderer: { html: function (h) { return escHtml(typeof h === 'string' ? h : (h && h.text) || ''); } } });
  return _kbMd;
}

// =========== 面板生命周期 ===========

function openKbPanel(link) {
  var old = $('kbPanel');
  if (old) old.remove();
  var p = document.createElement('section');
  p.id = 'kbPanel';
  p.style.cssText =
    'position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;' +
    'background:var(--bg-primary);color:var(--text-primary);overflow:hidden;font-family:var(--font-sans)';
  p.innerHTML = _kbShellHTML();
  document.body.appendChild(p);
  $('kbBack').onclick = _kbBack;
  $('kbGraphBtn').onclick = function () { _kb.view === 'graph' ? _kbShowList() : _kbShowGraph(); };
  $('kbNewBtn').onclick = function () { _kbEdit(null); };
  _kb.view = 'list'; _kb.cur = null; _kb.stack = [];
  _kbLoadList().then(function () { if (link) _kbOpen(link); else _kbShowList(); });
}

function closeKbPanel() {
  cancelAnimationFrame(_kb.raf);
  var p = $('kbPanel'); if (p) p.remove();
}

// 返回：编辑 → 那篇 → 上一篇 → 目录 → 关面板
function _kbBack() {
  if (_kb.view === 'edit') { if (_kb.cur) _kbRender(_kb.cur); else _kbShowList(); return; }
  if (_kb.view === 'note') {
    var prev = _kb.stack.pop();
    if (prev) { _kbOpen(prev, true); return; }
    _kbShowList(); return;
  }
  if (_kb.view === 'graph') { _kbShowList(); return; }
  closeKbPanel();
}

function _kbShellHTML() {
  var btn = 'width:34px;height:34px;flex:0 0 auto;border:none;background:transparent;color:var(--text-primary);' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-full)';
  return '' +
  '<header style="flex:0 0 auto;display:flex;align-items:center;gap:8px;' +
    'padding:calc(env(safe-area-inset-top,0px) + 14px) var(--page-pad) 12px;border-bottom:1px solid var(--border)">' +
    '<button id="kbBack" aria-label="返回" style="' + btn + ';font-size:22px">‹</button>' +
    '<h1 id="kbTitle" style="flex:1;min-width:0;margin:0;font:600 var(--text-title)/1.2 var(--font-serif);' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">知识库</h1>' +
    '<button id="kbGraphBtn" aria-label="关系图" style="' + btn + '">' +
      '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<circle cx="5" cy="6" r="2.2"/><circle cx="15" cy="5" r="2.2"/><circle cx="10" cy="15" r="2.2"/>' +
      '<path d="M7 6.5l6-1M6 8l3 5M14 7l-3 6"/></svg></button>' +
    '<button id="kbNewBtn" aria-label="新建" style="' + btn + ';font-size:24px">+</button>' +
  '</header>' +
  '<div id="kbBody" style="flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
    'padding:12px var(--page-pad) calc(env(safe-area-inset-bottom,0px) + 28px)"></div>';
}

function _kbSetHeader(title, showNew) {
  $('kbTitle').textContent = title;
  $('kbNewBtn').style.visibility = showNew ? 'visible' : 'hidden';
}

// =========== 目录 ===========

function _kbLoadList() {
  return api('/api/kb/list').then(function (r) { return r.json(); }).then(function (d) {
    _kb.list = d.notes || []; _kb.folders = d.folders || [];
  }).catch(function () { _kb.list = []; });
}

function _kbChip(label, on, color) {
  return 'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;cursor:pointer;' +
    'font:500 13px/1 var(--font-sans);white-space:nowrap;border:1px solid ' + (on ? 'var(--accent)' : 'var(--border)') + ';' +
    'background:' + (on ? 'rgba(218,119,86,.12)' : 'transparent') + ';color:var(--text-primary)';
}

function _kbShowList() {
  cancelAnimationFrame(_kb.raf);
  _kb.view = 'list'; _kb.cur = null; _kb.stack = [];
  _kbSetHeader('知识库', true);
  var body = $('kbBody'); body.style.padding = '12px var(--page-pad) calc(env(safe-area-inset-bottom,0px) + 28px)';
  var counts = {}; _kb.list.forEach(function (n) { counts[n.folder] = (counts[n.folder] || 0) + 1; });
  var tags = {}; _kb.list.forEach(function (n) { (n.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
  var html = '<input id="kbSearch" type="search" placeholder="搜标题和正文" value="' + escHtml(_kb.q) + '" style="width:100%;box-sizing:border-box;' +
    'padding:11px 14px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--bg-sunken);' +
    'color:var(--text-primary);font:400 15px/1.3 var(--font-sans);outline:none">';
  html += '<div style="display:flex;gap:8px;overflow-x:auto;padding:12px 0 4px;scrollbar-width:none">';
  html += '<span data-f="" style="' + _kbChip('全部', !_kb.folder) + '">全部 ' + _kb.list.length + '</span>';
  (_kb.folders || []).forEach(function (f) {
    html += '<span data-f="' + escHtml(f) + '" style="' + _kbChip(f, _kb.folder === f) + '">' +
      '<i style="width:8px;height:8px;border-radius:50%;background:' + _KB_COLORS[f] + '"></i>' + escHtml(f) + ' ' + (counts[f] || 0) + '</span>';
  });
  html += '</div>';
  var tagNames = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; });
  if (tagNames.length) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 0 2px">';
    tagNames.slice(0, 30).forEach(function (t) {
      var on = _kb.tag === t;
      html += '<span data-t="' + escHtml(t) + '" style="padding:3px 9px;border-radius:999px;cursor:pointer;font:12px/1.4 var(--font-sans);' +
        'color:' + (on ? '#fff' : 'var(--text-secondary)') + ';background:' + (on ? 'var(--accent)' : 'var(--bg-sunken)') + '">#' + escHtml(t) + '</span>';
    });
    html += '</div>';
  }
  html += '<div id="kbList" style="margin-top:10px"></div>';
  body.innerHTML = html;
  body.querySelectorAll('[data-f]').forEach(function (el) { el.onclick = function () { _kb.folder = this.dataset.f; _kbShowList(); }; });
  body.querySelectorAll('[data-t]').forEach(function (el) { el.onclick = function () { _kb.tag = _kb.tag === this.dataset.t ? '' : this.dataset.t; _kbShowList(); }; });
  var s = $('kbSearch'), timer = 0;
  s.oninput = function () { clearTimeout(timer); var v = this.value; timer = setTimeout(function () { _kb.q = v.trim(); _kbFillList(); }, 250); };
  _kbFillList();
}

function _kbFillList() {
  var box = $('kbList'); if (!box) return;
  var rows;
  if (_kb.q) {
    var qs = '/api/kb/search?q=' + encodeURIComponent(_kb.q) + (_kb.tag ? '&tag=' + encodeURIComponent(_kb.tag) : '') +
      (_kb.folder ? '&folder=' + encodeURIComponent(_kb.folder) : '');
    api(qs).then(function (r) { return r.json(); }).then(function (d) { _kbDrawRows(box, d.results || [], true); });
    return;
  }
  rows = _kb.list.filter(function (n) {
    return (!_kb.folder || n.folder === _kb.folder) && (!_kb.tag || (n.tags || []).indexOf(_kb.tag) >= 0);
  });
  _kbDrawRows(box, rows, false);
}

function _kbDrawRows(box, rows, withSnippet) {
  if (!rows.length) {
    box.innerHTML = '<p style="margin:40px 0;text-align:center;color:var(--text-faint);font:14px/1.7 var(--font-sans)">' +
      (_kb.list.length ? '没找到' : '还一篇都没有。<br>点右上角 + 写第一篇，<br>用 [[标题]] 把它跟别的连起来。') + '</p>';
    return;
  }
  box.innerHTML = '';
  rows.forEach(function (n) {
    var el = document.createElement('div');
    el.style.cssText = 'padding:12px 2px;border-bottom:1px solid var(--border);cursor:pointer';
    el.innerHTML = '<div style="display:flex;align-items:center;gap:8px">' +
      '<i style="flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:' + (_KB_COLORS[n.folder] || '#999') + '"></i>' +
      '<span style="flex:1;min-width:0;font:500 15px/1.4 var(--font-sans);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(n.title) + '</span>' +
      '<span style="flex:0 0 auto;font:12px var(--font-sans);color:var(--text-faint)">' + escHtml(n.folder) + (n.updated ? ' · ' + escHtml(n.updated.slice(5, 10)) : '') + '</span></div>' +
      (withSnippet && n.snippet ? '<div style="margin:4px 0 0 16px;font:13px/1.5 var(--font-sans);color:var(--text-secondary);' +
        'overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + escHtml(n.snippet) + '</div>' : '');
    el.onclick = function () { _kbOpen(n.folder + '/' + n.title); };
    box.appendChild(el);
  });
}

// =========== 一篇 ===========

function _kbOpen(link, isBack) {
  api('/api/kb/note?link=' + encodeURIComponent(link)).then(function (r) {
    if (r.status === 404) return null;
    return r.json();
  }).then(function (n) {
    if (!n) {
      // 链到一篇还没写的 —— Obsidian 那样，点了就开始写它
      if (/^(日记|记忆|偏好|聊天)\//.test(link)) { alert('「' + link + '」那儿没有东西'); return; }
      var t = link.indexOf('/') > 0 && (_kb.folders || []).indexOf(link.split('/')[0]) >= 0 ? link.split('/') : [null, link];
      _kbEdit(null, { title: t[1], folder: t[0] || '粥粥' });
      return;
    }
    if (!isBack && _kb.view === 'note' && _kb.cur) _kb.stack.push(_kb.cur.id);
    _kbRender(n);
  }).catch(function (e) { alert('打不开：' + e.message); });
}

// [[x]] / [[x|别名]] / [[x#小节]] → 先换成 markdown 链接 kb:x，渲染完再接上点击
function _kbLinkify(src) {
  var parts = src.split(/(```[\s\S]*?```)/);
  return parts.map(function (p, i) {
    if (i % 2) return p;
    return p.replace(/\[\[([^\]\|#\n]+)(#[^\]\|\n]*)?(?:\|([^\]\n]*))?\]\]/g, function (all, l, sec, alias) {
      var text = (alias || l).replace(/[\[\]]/g, '');
      return '[' + text + '](kb:' + encodeURIComponent(l.trim()) + ')';
    });
  }).join('');
}

function _kbRender(n) {
  cancelAnimationFrame(_kb.raf);
  _kb.view = 'note'; _kb.cur = n;
  _kbSetHeader(n.title, false);
  var body = $('kbBody'); body.style.padding = '14px var(--page-pad) calc(env(safe-area-inset-bottom,0px) + 28px)';
  var exists = {}; (n.outlinks || []).forEach(function (o) { exists[o.link] = o.exists; });
  var meta = '<i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:' + (_KB_COLORS[n.folder] || '#999') + '"></i>' +
    escHtml(n.folder) + (n.virtual ? ' · 只读，原数据挂进来的' : '') +
    (n.author ? ' · ' + escHtml(n.author) + ' 写的' : '') + (n.edited_by && n.edited_by !== n.author ? ' · ' + escHtml(n.edited_by) + ' 改过' : '') +
    (n.updated ? ' · ' + escHtml(n.updated) : '');
  var html = '<div style="font:12px/1.5 var(--font-sans);color:var(--text-faint);display:flex;align-items:center;flex-wrap:wrap">' + meta + '</div>';
  if ((n.all_tags || []).length) {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + n.all_tags.map(function (t) {
      return '<span data-tag="' + escHtml(t) + '" style="padding:2px 8px;border-radius:999px;background:var(--bg-sunken);color:var(--text-secondary);font:12px/1.5 var(--font-sans);cursor:pointer">#' + escHtml(t) + '</span>';
    }).join('') + '</div>';
  }
  html += '<article id="kbArticle" class="md" style="margin-top:14px;font:400 15.5px/1.75 var(--font-sans);word-break:break-word"></article>';
  if (!n.virtual) {
    var b = 'flex:1;padding:10px;border-radius:var(--radius-md);border:1px solid var(--border);background:transparent;color:var(--text-primary);font:500 14px var(--font-sans);cursor:pointer';
    html += '<div style="display:flex;gap:8px;margin-top:22px">' +
      '<button id="kbEditBtn" style="' + b + ';border-color:var(--accent);color:var(--accent)">编辑</button>' +
      '<button id="kbRenameBtn" style="' + b + '">改名 / 挪块</button>' +
      '<button id="kbTrashBtn" style="' + b + ';color:var(--text-secondary)">删除</button></div>';
  }
  html += '<h3 style="margin:28px 0 8px;font:600 13px var(--font-sans);color:var(--text-secondary)">链到这篇的（' + (n.backlinks || []).length + '）</h3>';
  html += (n.backlinks || []).length ? n.backlinks.map(function (x) {
    return '<div data-open="' + escHtml(x.folder + '/' + x.title) + '" style="padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer;font:14px var(--font-sans)">' +
      '<i style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;background:' + (_KB_COLORS[x.folder] || '#999') + '"></i>' + escHtml(x.title) +
      '<span style="color:var(--text-faint);font-size:12px"> · ' + escHtml(x.folder) + '</span></div>';
  }).join('') : '<p style="margin:0;color:var(--text-faint);font:13px var(--font-sans)">还没有别的笔记链到它</p>';
  body.innerHTML = html;
  body.scrollTop = 0;

  var art = $('kbArticle');
  art.innerHTML = _kbMarked().parse(_kbLinkify(n.content || ''));
  art.querySelectorAll('a').forEach(function (a) {
    var href = a.getAttribute('href') || '';
    if (href.indexOf('kb:') === 0) {
      var l = decodeURIComponent(href.slice(3));
      a.removeAttribute('href');
      var missing = exists[l] === false;
      a.style.cssText = 'color:' + (missing ? 'var(--text-faint)' : 'var(--accent)') + ';cursor:pointer;text-decoration:none;' +
        'border-bottom:1px ' + (missing ? 'dashed' : 'solid') + ' currentColor';
      if (missing) a.title = '还没写 —— 点了就开始写';
      a.onclick = function () { _kbOpen(l); };
    } else if (!/^(https?:|mailto:)/i.test(href)) {
      a.removeAttribute('href');
    } else { a.target = '_blank'; a.rel = 'noopener'; }
  });
  art.querySelectorAll('img').forEach(function (img) { img.style.maxWidth = '100%'; img.style.borderRadius = '8px'; });

  body.querySelectorAll('[data-open]').forEach(function (el) { el.onclick = function () { _kbOpen(this.dataset.open); }; });
  body.querySelectorAll('[data-tag]').forEach(function (el) { el.onclick = function () { _kb.tag = this.dataset.tag; _kb.folder = ''; _kb.q = ''; _kbShowList(); }; });
  if (!n.virtual) {
    $('kbEditBtn').onclick = function () { _kbEdit(n); };
    $('kbRenameBtn').onclick = function () { _kbRename(n); };
    $('kbTrashBtn').onclick = function () { _kbTrash(n); };
  }
}

// =========== 编辑 ===========

function _kbEdit(n, preset) {
  cancelAnimationFrame(_kb.raf);
  _kb.view = 'edit';
  var isNew = !n; preset = preset || {};
  _kbSetHeader(isNew ? '新建' : '编辑 · ' + n.title, false);
  var inp = 'width:100%;box-sizing:border-box;padding:11px 13px;border-radius:var(--radius-md);border:1px solid var(--border);' +
    'background:var(--bg-sunken);color:var(--text-primary);font:400 15px/1.4 var(--font-sans);outline:none';
  var folderSel = '<select id="kbFFolder" style="' + inp + ';flex:0 0 96px">' + (_kb.folders || []).map(function (f) {
    return '<option' + (f === (preset.folder || _kb.folder || '粥粥') ? ' selected' : '') + '>' + escHtml(f) + '</option>';
  }).join('') + '</select>';
  var body = $('kbBody');
  body.innerHTML = (isNew ? '<div style="display:flex;gap:8px">' + folderSel +
      '<input id="kbFTitle" placeholder="标题（别人用 [[标题]] 链它）" value="' + escHtml(preset.title || '') + '" style="' + inp + ';flex:1;min-width:0"></div>' : '') +
    '<input id="kbFTags" placeholder="标签，用逗号隔开（正文里写 #标签 也行）" value="' + escHtml(isNew ? '' : (n.tags || []).join(', ')) + '" style="' + inp + ';margin-top:8px">' +
    '<textarea id="kbFBody" placeholder="写点什么。[[标题]] 链到别的笔记，[[日记/2026-09-20]] 链到那天的日记，[[聊天/2026-09-20]] 链到那天聊过的。" style="' + inp +
      ';margin-top:8px;min-height:52vh;resize:vertical;font:400 15px/1.7 var(--font-mono,ui-monospace,monospace)">' + escHtml(isNew ? '' : n.content || '') + '</textarea>' +
    '<div id="kbFMsg" style="min-height:18px;margin-top:6px;font:13px var(--font-sans);color:#c0392b"></div>' +
    '<button id="kbFSave" style="width:100%;margin-top:6px;padding:13px;border:none;border-radius:var(--radius-md);background:var(--accent);color:#fff;font:600 15px var(--font-sans);cursor:pointer">保存</button>';
  var ta = $('kbFBody');
  if (isNew && preset.title) ta.focus(); else if (isNew) $('kbFTitle').focus();
  $('kbFSave').onclick = function () {
    var btn = this, msg = $('kbFMsg');
    var folder = isNew ? $('kbFFolder').value : n.folder, title = isNew ? $('kbFTitle').value.trim() : n.title;
    if (!title) { msg.textContent = '标题要写'; return; }
    var tags = $('kbFTags').value.split(/[,，]/).map(function (s) { return s.trim().replace(/^#/, ''); }).filter(Boolean);
    btn.disabled = true; msg.textContent = '';
    // 新建传 base_mtime=0：后端发现同名已经有了会回 409，不会悄悄盖掉
    var payload = { folder: folder, title: title, content: ta.value, tags: tags, base_mtime: isNew ? 0 : n.mtime };
    api('/api/kb/note', { method: 'PUT', body: JSON.stringify(payload) }).then(function (r) {
      return r.json().then(function (d) { return { st: r.status, d: d }; });
    }).then(function (x) {
      btn.disabled = false;
      if (x.st === 409) {
        msg.textContent = isNew ? '「' + folder + '/' + title + '」已经有了，换个标题，或者去打开那篇改'
          : '这篇在你打开之后被改过了（可能是他或者砚）。先把你写的复制一下，返回重新打开再改，别盖掉对方的。';
        return;
      }
      if (x.d.error) { msg.textContent = x.d.error; return; }
      _kbLoadList().then(function () { _kbOpen(x.d.folder + '/' + x.d.title, true); });
    }).catch(function (e) { btn.disabled = false; msg.textContent = '没存上：' + e.message; });
  };
}

function _kbRename(n) {
  var to = prompt('新标题（别的笔记里链它的 [[旧名]] 会一起改过来）', n.title);
  if (to == null) return;
  to = to.trim();
  var fs = (_kb.folders || []).join(' / ');
  var folder = prompt('放在哪块？（' + fs + '）', n.folder);
  if (folder == null) return;
  folder = folder.trim();
  if (to === n.title && folder === n.folder) return;
  api('/api/kb/rename', { method: 'POST', body: JSON.stringify({ folder: n.folder, title: n.title, new_title: to, new_folder: folder }) })
    .then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { alert(d.error); return; }
      if (d.fixed_links) alert('改好了，顺手改了 ' + d.fixed_links + ' 篇里的链接');
      _kbLoadList().then(function () { _kbOpen(d.folder + '/' + d.title, true); });
    });
}

function _kbTrash(n) {
  if (!confirm('把「' + n.title + '」挪进回收站？（不是真删，文件还在 data/kb/.trash 里）')) return;
  api('/api/kb/trash', { method: 'POST', body: JSON.stringify({ folder: n.folder, title: n.title }) })
    .then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { alert(d.error); return; }
      _kbLoadList().then(_kbShowList);
    });
}

// =========== 关系图 ===========
// 力导向，自己画在 canvas 上：斥力（两两）+ 连线弹簧 + 往中心拉一点。
// 单指拖 = 平移，拖点 = 挪那个点，双指 = 缩放，点一下 = 打开。

function _kbShowGraph() {
  _kb.view = 'graph';
  _kbSetHeader('关系图', false);
  var body = $('kbBody'); body.style.padding = '0'; body.innerHTML = '';
  var legend = document.createElement('div');
  legend.style.cssText = 'position:absolute;left:var(--page-pad);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);display:flex;flex-wrap:wrap;gap:10px;' +
    'font:12px var(--font-sans);color:var(--text-secondary);pointer-events:none;max-width:calc(100% - 32px)';
  legend.innerHTML = Object.keys(_KB_COLORS).map(function (k) {
    return '<span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;background:' + _KB_COLORS[k] + '"></i>' + k + '</span>';
  }).join('') + '<span>◌ 还没写</span>';
  var cv = document.createElement('canvas');
  cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  body.style.position = 'relative';
  body.appendChild(cv); body.appendChild(legend);
  api('/api/kb/graph').then(function (r) { return r.json(); }).then(function (g) {
    if (!g.nodes.length) {
      body.innerHTML = '<p style="margin:60px 20px;text-align:center;color:var(--text-faint);font:14px/1.7 var(--font-sans)">还没有笔记，图上是空的。</p>';
      return;
    }
    _kbGraphRun(cv, g);
  });
}

function _kbGraphRun(cv, g) {
  var dpr = window.devicePixelRatio || 1, W = 0, H = 0;
  function size() { if (!cv.isConnected) { window.removeEventListener('resize', size); return; } W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; }
  size();
  var byId = {}, deg = {};
  g.edges.forEach(function (e) { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; });
  var nodes = g.nodes.map(function (n, i) {
    var a = i * 2.4, r = 30 + 12 * Math.sqrt(i);
    var o = { id: n.id, title: n.title, folder: n.folder, kind: n.kind,
      x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, r: 4 + Math.min(8, Math.sqrt(deg[n.id] || 0) * 2) };
    byId[n.id] = o; return o;
  });
  var edges = g.edges.map(function (e) { return { a: byId[e.from], b: byId[e.to] }; }).filter(function (e) { return e.a && e.b; });
  var view = { x: 0, y: 0, k: 1 }, alpha = 1, drag = null, hover = null;
  var css = getComputedStyle(document.documentElement);
  var textCol = css.getPropertyValue('--text-secondary').trim() || '#888';
  var lineCol = css.getPropertyValue('--border').trim() || 'rgba(0,0,0,.12)';

  function step() {
    if (alpha > 0.005) {
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy + 0.01;
          if (d2 > 90000) continue;
          var f = 900 / d2 * alpha, d = Math.sqrt(d2);
          a.vx -= dx / d * f; a.vy -= dy / d * f; b.vx += dx / d * f; b.vy += dy / d * f;
        }
        a.vx -= a.x * 0.004 * alpha; a.vy -= a.y * 0.004 * alpha;
      }
      edges.forEach(function (e) {
        var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 70) * 0.02 * alpha;
        e.a.vx += dx / d * f; e.a.vy += dy / d * f; e.b.vx -= dx / d * f; e.b.vy -= dy / d * f;
      });
      nodes.forEach(function (n) {
        if (drag && drag.node === n) { n.vx = n.vy = 0; return; }
        n.vx *= 0.6; n.vy *= 0.6; n.x += n.vx; n.y += n.vy;
      });
      alpha *= 0.985;
    }
    draw();
    _kb.raf = requestAnimationFrame(step);
  }
  function toScreen(n) { return [W / 2 + (n.x + view.x) * view.k, H / 2 + (n.y + view.y) * view.k]; }
  function toWorld(px, py) { return [(px - W / 2) / view.k - view.x, (py - H / 2) / view.k - view.y]; }
  function draw() {
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    var focus = hover || (drag && drag.node);
    var near = {};
    if (focus) { near[focus.id] = 1; edges.forEach(function (e) { if (e.a === focus) near[e.b.id] = 1; if (e.b === focus) near[e.a.id] = 1; }); }
    c.lineWidth = 1;
    edges.forEach(function (e) {
      var p = toScreen(e.a), q = toScreen(e.b);
      c.strokeStyle = focus && (e.a === focus || e.b === focus) ? 'rgba(218,119,86,.7)' : lineCol;
      c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke();
    });
    nodes.forEach(function (n) {
      var p = toScreen(n), r = n.r * Math.max(0.7, Math.min(1.6, view.k));
      var col = _KB_COLORS[n.folder] || '#999';
      c.globalAlpha = focus && !near[n.id] ? 0.25 : 1;
      c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2);
      if (n.kind === 'missing') { c.setLineDash([2, 2]); c.strokeStyle = textCol; c.stroke(); c.setLineDash([]); }
      else { c.fillStyle = col; c.fill(); }
      if (view.k > 0.7 || near[n.id]) {
        c.fillStyle = textCol; c.font = '12px ' + (css.getPropertyValue('--font-sans') || 'sans-serif');
        c.textAlign = 'center'; c.fillText(n.title.length > 16 ? n.title.slice(0, 15) + '…' : n.title, p[0], p[1] + r + 13);
      }
      c.globalAlpha = 1;
    });
  }
  function pick(px, py) {
    var best = null, bd = 22 * 22;
    nodes.forEach(function (n) { var p = toScreen(n), dx = p[0] - px, dy = p[1] - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = n; } });
    return best;
  }
  var ptrs = {}, pinch = null, moved = 0;
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId);
    var rc = cv.getBoundingClientRect(), px = e.clientX - rc.left, py = e.clientY - rc.top;
    ptrs[e.pointerId] = [px, py];
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; drag = null; return;
    }
    moved = 0;
    var n = pick(px, py);
    drag = n ? { node: n } : { pan: true, sx: px, sy: py, vx: view.x, vy: view.y };
    if (n) alpha = Math.max(alpha, 0.3);
  });
  cv.addEventListener('pointermove', function (e) {
    var rc = cv.getBoundingClientRect(), px = e.clientX - rc.left, py = e.clientY - rc.top;
    if (!ptrs[e.pointerId]) { hover = e.pointerType === 'mouse' ? pick(px, py) : null; return; }
    ptrs[e.pointerId] = [px, py];
    var ids = Object.keys(ptrs);
    if (pinch && ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      view.k = Math.max(0.2, Math.min(4, pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d)); return;
    }
    if (!drag) return;
    moved++;
    if (drag.node) { var w = toWorld(px, py); drag.node.x = w[0]; drag.node.y = w[1]; alpha = Math.max(alpha, 0.3); }
    else { view.x = drag.vx + (px - drag.sx) / view.k; view.y = drag.vy + (py - drag.sy) / view.k; }
  });
  function up(e) {
    delete ptrs[e.pointerId];
    if (pinch) { if (Object.keys(ptrs).length < 2) pinch = null; drag = null; return; }
    if (drag && drag.node && moved < 4 && drag.node.kind !== 'missing') {
      var id = drag.node.id; drag = null; _kbOpen(id); return;
    }
    if (drag && drag.node && drag.node.kind === 'missing' && moved < 4) { var t = drag.node.title; drag = null; _kbOpen(t); return; }
    drag = null;
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); view.k = Math.max(0.2, Math.min(4, view.k * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
  window.addEventListener('resize', size);
  step();
}
