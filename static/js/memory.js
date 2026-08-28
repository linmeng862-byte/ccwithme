// === Memory — Nocturne Engine Browser v1 ===
console.log('[memory] v1 — nocturne memory browser');

var _memoryView = 'breath'; // 'breath' | 'trace' | 'wander' | 'recall'
var _memoryText = '';
var _memoryWanderMode = 'flotsam';
var _memoryRecall = null;   // recall 视图的结构化结果（不是文本）
// _renderMemoryShell() 每次都重建整个 innerHTML，输入框里的字会跟着没。
// 所以搜索词得存在外面，重建时再填回去——否则一切 tab 输入框就空了。
var _memorySearchTerm = '';
var _memorySearchTimer = null;

// ⚠️ 只放**服务端真有数据**的 mode。2026-08-28 挨个实测过：
//    flotsam ✅ / unresolved ✅ / archive 空 / letter 空 / writing 空 / window 空 / inner 空
//    （trails 要带 query，另说）。
//    其中 archive / letter / inner 服务端 `hold` 的 kind 枚举里压根没有 —— 他**没有手**写；
//    writing / window 他有手（kind 里有），但一条没写过。
//    **别为了"tab 多一点"把空的接上来**，那是个空转的浏览器。
//    哪天他真开始写 writing/window 了，回来把那两个加进这张表就行。

function openMemoryPanel() {
  try { closeDrawer(); } catch(e) {}
  $('memoryPanel').style.display = 'flex';
  $('memoryPanel').setAttribute('aria-hidden', 'false');
  _loadBreath();
}

function closeMemoryPanel() {
  $('memoryPanel').style.display = 'none';
  $('memoryPanel').setAttribute('aria-hidden', 'true');
}

async function _loadBreath() {
  _memoryView = 'breath';
  _renderMemoryShell();
  $('memoryContent').innerHTML = '<p class="mem-loading">Breathing...</p>';
  try {
    var r = await api('/api/memory/breath');
    if (!r.ok) throw Error();
    var data = await r.json();
    _memoryText = data.text || '';
    _renderMemoryContent();
  } catch(e) { $('memoryContent').innerHTML = '<p class="mem-error">Engine unreachable. Memories sleep.</p>'; }
}

// 搜索框是**双用途**的：平时走 trace（关键词全文搜），
// 停在 Recall tab 上时走 recall（打过分的选择，带 why）。
// ⚠️ 防抖 300ms。原来是 oninput 直接打接口 —— 打一个字发一次请求，
//    trace 那条本来就浪费，recall 更贵（远端约 1.3 秒）。
function _memorySearchInputChanged() {
  _memorySearchTerm = ($('memorySearchInput')?.value || '');
  clearTimeout(_memorySearchTimer);
  _memorySearchTimer = setTimeout(function() {
    if (_memoryView === 'recall') { _loadRecall(); return; }
    _searchMemory();
  }, 300);
}

// 只在**视图真的换了**的时候才重建外壳。
// 重建 = innerHTML 整个换掉 = 输入框重新生成 = 焦点和光标位置全没。
// 边打字边搜的时候每次都重建，光标会被踢回开头，根本没法输入。
function _renderShellIfViewChanged(prev) {
  if (prev !== _memoryView) _renderMemoryShell();
}

async function _searchMemory() {
  var q = ($('memorySearchInput')?.value || '').trim();
  _memorySearchTerm = q;
  if (!q) { _loadBreath(); return; }
  var _prev = _memoryView;
  _memoryView = 'trace';
  _renderShellIfViewChanged(_prev);
  $('memoryContent').innerHTML = '<p class="mem-loading">Searching...</p>';
  try {
    var r = await api('/api/memory/trace?q=' + encodeURIComponent(q));
    if (!r.ok) throw Error();
    var data = await r.json();
    _memoryText = data.text || '';
    _renderMemoryContent();
  } catch(e) { $('memoryContent').innerHTML = '<p class="mem-error">Search failed</p>'; }
}

async function _loadWander(mode) {
  _memoryView = 'wander';
  _memoryWanderMode = mode;
  _renderMemoryShell();
  $('memoryContent').innerHTML = '<p class="mem-loading">Wandering...</p>';
  try {
    var r = await api('/api/memory/wander?mode=' + mode);
    if (!r.ok) throw Error();
    var data = await r.json();
    _memoryText = data.text || '';
    _renderMemoryContent();
  } catch(e) { $('memoryContent').innerHTML = '<p class="mem-error">Wander failed</p>'; }
}

// Recall —— 跟 trace 不是一回事。
// trace 是**找**（关键词全文搜，命中就列出来）；
// recall 是**勾**（引擎打分选出来的那几条，还告诉你为什么是这几条）。
// 那个 why 才是这个视图存在的理由 —— 能看见「他为什么会想起这件事」。
async function _loadRecall() {
  var q = ($('memorySearchInput')?.value || '').trim();
  _memorySearchTerm = q;
  var _prev = _memoryView;
  _memoryView = 'recall';
  _renderShellIfViewChanged(_prev);
  if (!q) {
    $('memoryContent').innerHTML = '<div class="mem-empty">说一句话，看看会勾起什么。<br>' +
      '<span style="opacity:.7">这不是搜索——是引擎自己选的，还会告诉你为什么。</span></div>';
    return;
  }
  $('memoryContent').innerHTML = '<p class="mem-loading">Recalling...</p>';
  try {
    var r = await api('/api/memory/recall', {
      method: 'POST', body: JSON.stringify({ query: q })
    });
    if (!r.ok) throw Error();
    var data = await r.json();
    _memoryRecall = data;
    _renderRecallContent();
  } catch(e) { $('memoryContent').innerHTML = '<p class="mem-error">Recall failed</p>'; }
}

// why 里那几个信号的中文名。认不出来的原样显示，别吞掉——
// 那头加了新信号时，这儿要能看见它，而不是悄悄漏掉。
var _RECALL_WHY_NAMES = {
  query: '这句话', salience: '本来就重', recency: '最近',
  neglect: '很久没想起', unfinished: '还没完', wear: '磨损',
};

function _renderRecallContent() {
  var el = $('memoryContent');
  var items = (_memoryRecall && _memoryRecall.items) || [];
  if (!items.length) {
    el.innerHTML = '<div class="mem-empty">什么都没勾起来。<br>' +
      '<span style="opacity:.7">换个说法试试——它认的是词，不是句子。</span></div>';
    return;
  }
  var html = '';
  var t = _memoryRecall.time;
  if (t && t.elapsed_phrase) {
    html += '<div class="mem-recall-time">隔了 ' + escHtml(t.elapsed_phrase) +
            (_memoryRecall.mode ? ' · ' + escHtml(_memoryRecall.mode) : '') + '</div>';
  }
  items.forEach(function(it) {
    var why = it.why || {};
    // 只画有分量的，0 的不占地方
    var keys = Object.keys(why).filter(function(k) { return (why[k] || 0) > 0.001; })
      .sort(function(a, b) { return why[b] - why[a]; });
    html += '<div class="mem-card">';
    html += '<div class="mem-card-head">💭 <span>' + escHtml(it.name || '') + '</span>' +
            '<span class="mem-score">' + (Number(it.score) || 0).toFixed(2) + '</span></div>';
    html += '<div class="mem-card-body">' + _escapeMemText(it.content || '') + '</div>';
    if (keys.length) {
      html += '<div class="mem-why">';
      keys.forEach(function(k) {
        var v = Math.max(0, Math.min(1, why[k]));
        html += '<div class="mem-why-row">' +
                '<span class="mem-why-name">' + escHtml(_RECALL_WHY_NAMES[k] || k) + '</span>' +
                '<span class="mem-why-bar"><i style="width:' + (v * 100).toFixed(0) + '%"></i></span>' +
                '<span class="mem-why-val">' + v.toFixed(2) + '</span>' +
                '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  el.innerHTML = html;
}

function _renderMemoryShell() {
  var panel = $('memoryPanel');
  panel.innerHTML =
    '<header class="profile-header" style="padding:calc(env(safe-area-inset-top) + 18px) 18px 0;flex:none">' +
      '<button class="profile-round-button" onclick="closeMemoryPanel()">×</button>' +
      '<div class="profile-title">Memory</div>' +
      '<span></span>' +
    '</header>' +
    // Tabs
    '<div class="mem-tabs">' +
      '<button class="mem-tab' + (_memoryView === 'breath' ? ' active' : '') + '" onclick="_loadBreath()">Breath</button>' +
      '<button class="mem-tab' + (_memoryView === 'wander' && _memoryWanderMode === 'flotsam' ? ' active' : '') + '" onclick="_loadWander(\'flotsam\')">Flotsam</button>' +
      // ⚠️ Archive 那个 tab 08-28 撤了：服务端返回「没有 archive 条目」，而且
      //    `hold` 的 kind 枚举里压根没有 archive —— 他没有手写，永远不会有内容。
      //    letter / writing / window / inner 同理（实测全空），一个都别加回来。
      '<button class="mem-tab' + (_memoryView === 'wander' && _memoryWanderMode === 'unresolved' ? ' active' : '') + '" onclick="_loadWander(\'unresolved\')">Unresolved</button>' +
      '<button class="mem-tab' + (_memoryView === 'recall' ? ' active' : '') + '" onclick="_loadRecall()">Recall</button>' +
    '</div>' +
    // Search
    '<div class="mem-search-bar"><div class="mem-search-bubble">' +
      '<span class="mem-search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>' +
      '<input class="mem-search-input" id="memorySearchInput" type="text" value="' +
        escHtml(_memorySearchTerm) + '" placeholder="' +
        (_memoryView === 'recall' ? '说一句话，看看会勾起什么…' : 'Search memories...') +
        '" oninput="_memorySearchInputChanged()">' +
    '</div></div>' +
    // Content
    '<div class="mem-content" id="memoryContent"></div>';
}

function _renderMemoryContent() {
  var el = $('memoryContent');
  if (!_memoryText) {
    el.innerHTML = '<div class="mem-empty">No memories surfaced.<br>The engine is quiet.</div>';
    return;
  }
  // Parse sections: === Section Name ===
  var sections = _memoryText.split(/^===? /gm).filter(function(s) { return s.trim(); });
  if (sections.length <= 1) {
    // No section headers, render as single card
    el.innerHTML = '<div class="mem-card"><div class="mem-card-body">' + _escapeMemText(_memoryText) + '</div></div>';
    return;
  }
  var html = '';
  sections.forEach(function(s) {
    var lines = s.split('\n');
    var title = lines[0].replace(/=+$/, '').trim();
    var body = lines.slice(1).join('\n').trim();
    if (!body) return;
    var icon = '';
    if (title.match(/Dream|Veil/i)) icon = '🌙';
    else if (title.match(/Pulse|Weather/i)) icon = '🌡';
    else if (title.match(/Drift|Memory/i)) icon = '📜';
    else if (title.match(/Feel|Trace/i)) icon = '💭';
    else if (title.match(/House|Rule/i)) icon = '🏠';
    html += '<div class="mem-card">';
    html += '<div class="mem-card-head">' + icon + ' <span>' + escHtml(title) + '</span></div>';
    html += '<div class="mem-card-body">' + _escapeMemText(body) + '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function _escapeMemText(text) {
  return escHtml(text)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent)">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^---+/gm, '<hr style="border:none;border-top:1px solid var(--d-line);margin:16px 0">')
    .replace(/\n/g, '<br>');
}

// ====== Init ======
function _initMemoryStyles() {
  if (document.getElementById('memoryStyles')) return;
  var style = document.createElement('style');
  style.id = 'memoryStyles';
  style.textContent = [
    '#memoryPanel{position:fixed;inset:0;z-index:80;display:none;flex-direction:column;background:#F8F7F4;color:#2C2821;overflow:hidden}',
    '@media(prefers-color-scheme:dark){#memoryPanel{background:#1C1A17;color:#E8E4DB}}',
    'html[data-theme="dark"] #memoryPanel{background:#1C1A17;color:#E8E4DB}',
    '.mem-tabs{display:flex;gap:4px;padding:8px 16px 0;overflow-x:auto;flex:none}',
    '.mem-tab{flex:none;padding:8px 16px;border:0;border-radius:999px;font:500 13px/1 var(--font-sans);cursor:pointer;background:rgba(0,0,0,.03);color:#8A8276;transition:all .15s}',
    '.mem-tab.active{background:#2C2821;color:#F8F7F4}',
    '@media(prefers-color-scheme:dark){.mem-tab{background:rgba(255,255,255,.04);color:#8A8276}.mem-tab.active{background:#E8E4DB;color:#1C1A17}}',
    'html[data-theme="dark"] .mem-tab{background:rgba(255,255,255,.04);color:#8A8276}html[data-theme="dark"] .mem-tab.active{background:#E8E4DB;color:#1C1A17}',
    '.mem-search-bar{padding:12px 16px;flex:none}',
    '.mem-search-bubble{display:flex;align-items:center;gap:8px;padding:0 14px;height:40px;border-radius:999px;background:rgba(0,0,0,.03)}',
    '@media(prefers-color-scheme:dark){.mem-search-bubble{background:rgba(255,255,255,.04)}}',
    'html[data-theme="dark"] .mem-search-bubble{background:rgba(255,255,255,.04)}',
    '.mem-search-input{flex:1;border:0;outline:0;background:transparent;font:400 15px/1 var(--font-sans);color:inherit}',
    '.mem-content{flex:1;overflow-y:auto;padding:8px 16px 40px}',
    '.mem-loading,.mem-error,.mem-empty{text-align:center;padding:60px 20px;font:400 14px/1.5 var(--font-sans);color:#8A8276}',
    '.mem-card{background:#FFFDF9;border-radius:18px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.03)}',
    '@media(prefers-color-scheme:dark){.mem-card{background:#25221E}}',
    'html[data-theme="dark"] .mem-card{background:#25221E}',
    '.mem-card-head{font:600 14px/1 var(--font-sans);color:#8A8276;margin-bottom:10px;display:flex;align-items:center;gap:6px}',
    '.mem-card-body{font:400 14px/1.65 var(--font-sans);color:inherit;word-break:break-word}',
    '.mem-card-body hr{margin:14px 0}',
    // Recall 视图：分数 + why 条
    '.mem-recall-time{font:400 12px/1 var(--font-sans);color:#8A8276;padding:4px 4px 12px}',
    '.mem-score{margin-left:auto;font:600 12px/1 var(--font-mono,var(--font-sans));opacity:.65}',
    '.mem-why{margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,.06);display:flex;flex-direction:column;gap:5px}',
    '@media(prefers-color-scheme:dark){.mem-why{border-top-color:rgba(255,255,255,.07)}}',
    'html[data-theme="dark"] .mem-why{border-top-color:rgba(255,255,255,.07)}',
    '.mem-why-row{display:flex;align-items:center;gap:8px;font:400 11px/1 var(--font-sans);color:#8A8276}',
    '.mem-why-name{flex:none;width:5.5em}',
    '.mem-why-bar{flex:1;height:4px;border-radius:999px;background:rgba(0,0,0,.06);overflow:hidden}',
    '@media(prefers-color-scheme:dark){.mem-why-bar{background:rgba(255,255,255,.08)}}',
    'html[data-theme="dark"] .mem-why-bar{background:rgba(255,255,255,.08)}',
    '.mem-why-bar i{display:block;height:100%;border-radius:999px;background:currentColor;opacity:.55}',
    '.mem-why-val{flex:none;width:2.4em;text-align:right;opacity:.8}',
  ].join('\n');
  document.head.appendChild(style);
}

(function() {
  _initMemoryStyles();
  function _bind() {
    var ob = document.querySelector('#openMemory, [data-page="memory"]');
    if (ob) ob.onclick = function() { openMemoryPanel(); };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bind);
  } else { _bind(); }
})();
