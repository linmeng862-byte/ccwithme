// === Memory — Nocturne Engine Browser v1 ===
console.log('[memory] v1 — nocturne memory browser');

var _memoryView = 'breath'; // 'breath' | 'trace' | 'wander'
var _memoryText = '';
var _memoryWanderMode = 'flotsam';

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

async function _searchMemory() {
  var q = ($('memorySearchInput')?.value || '').trim();
  if (!q) { _loadBreath(); return; }
  _memoryView = 'trace';
  _renderMemoryShell();
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
      '<button class="mem-tab' + (_memoryView === 'wander' && _memoryWanderMode === 'archive' ? ' active' : '') + '" onclick="_loadWander(\'archive\')">Archive</button>' +
      '<button class="mem-tab' + (_memoryView === 'wander' && _memoryWanderMode === 'unresolved' ? ' active' : '') + '" onclick="_loadWander(\'unresolved\')">Unresolved</button>' +
    '</div>' +
    // Search
    '<div class="mem-search-bar"><div class="mem-search-bubble">' +
      '<span class="mem-search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>' +
      '<input class="mem-search-input" id="memorySearchInput" type="text" placeholder="Search memories..." oninput="_searchMemory()">' +
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
