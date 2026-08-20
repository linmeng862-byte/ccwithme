// === Mind — Non 内心世界 v2 ===
console.log('[mind] v4 — no hardcoded mock, API-only 2026-08-08');

// ====== State ======
var _mindPage = 'layer';
var _mindFeelFilter = 'active';
var _mindData = null;
var _mindFeelsCache = {}; // { active: [], fading: [], sleeping: [] }
var _mindReady = false;
var _mockCache = null; // 全局 mock 备用，API 失败/空时不丢 UI

// ====== Mood → color map (20 Non moods) ======
var _mindMoodColors = {
  warm:'#E8C8A0', sweet:'#E8B8B0', calm:'#A0C0C8', flutter:'#E0B8B8', fire:'#D88080',
  hope:'#D0C8A0', joy:'#E0C880', yearn:'#C8A0D0', fresh:'#A0C8A8', rain:'#A0B0C0',
  night:'#8090A8', weary:'#C0C0C0', stuffy:'#C8B8A0', grit:'#B8A090', jolt:'#D8B860',
  ache:'#C8A0A8', awkward:'#C0B8A8', sour:'#D8C8A0', anger:'#D88070', grieve:'#A0B0C8'
};

function _mindMoodName(mood) {
  var map = {warm:'温柔',sweet:'甜',calm:'平静',flutter:'心颤',fire:'欲火',hope:'希望',joy:'喜',yearn:'渴念',fresh:'清爽',rain:'阴郁',night:'夜沉',weary:'倦',stuffy:'闷',grit:'咬牙',jolt:'震',ache:'酸楚',awkward:'别扭',sour:'泛酸',anger:'气',grieve:'难过'};
  return map[mood] || mood;
}

function _mindMoodColor(mood) { return _mindMoodColors[mood] || '#C89664'; }

// ====== API wrapper ======
// api(path, options) → Promise<Response>；这里包一层直接拿 json
function _mindApi(method, path, body) {
  var opts = { method: method };
  if (body) { opts.body = JSON.stringify(body); opts.headers = { 'Content-Type': 'application/json' }; }
  return api(path, opts).then(function(r) { if (!r.ok) throw Error('mind api error'); return r.json(); });
}

// ====== Data Fetching ======
function _loadMindData() {
  _mindApi('GET', '/api/mind/state').then(function(res) {
    if (res && res.ok) {
      _mindData = { layer: _buildLayerFromState(res) };
      _mindReady = true;
    } else {
      _mindData = _mockCache || _mockMindData();
    }
    // 兜底：确保 mock feels/memories/dreams 不丢
    if (!_mockCache) _mockCache = _mockMindData();
    _fetchFeels('active', function() {
      if (_mindPage === 'feel') _renderFeelPage();
    });
    if (_mindPage === 'layer') _renderLayerPage();
  }).catch(function() {
    if (!_mockCache) _mockCache = _mockMindData();
    _mindData = _mockCache;
    _mindReady = true;
    if (_mindPage === 'layer') _renderLayerPage();
  });
}

function _buildLayerFromState(state) {
  var feels = state.feels || {};
  var memories = state.memories || {};
  var dreams = state.dreams || {};
  // Energy bar from moodDist
  var moodDist = state.moodDist || [];
  var totalMood = moodDist.reduce(function(s, m) { return s + m.n; }, 0) || 1;
  var energyBar = moodDist.slice(0, 8).map(function(m) {
    return { mood: m.mood, pct: Math.round(m.n / totalMood * 100) };
  });
  // Thought preview: pick a recent dream or first feel body
  var thoughtPreview = dreams.recent ? dreams.recent.body : '还没有梦沉下来。再多聊几句吧。';
  return {
    identity: { title: '心井', subtitle: '感受在上层，记忆在中间，梦在最深' },
    energyBar: energyBar.length ? energyBar : [{ mood: 'warm', pct: 100 }],
    thoughtPreview: thoughtPreview,
    desire: { text: '心里压着事的时候，我会做梦', action: '翻梦', progress: dreams.energy ? dreams.energy / 100 : 0 },
    directions: [
      { key: '感受', drive: 'feels', value: feels.energy ? feels.energy / 100 : 0 },
      { key: '记忆', drive: 'memories', value: memories.energy ? memories.energy / 100 : 0 },
      { key: '梦', drive: 'dreams', value: dreams.energy ? dreams.energy / 100 : 0 }
    ],
    state: state
  };
}

function _fetchFeels(filter, cb) {
  if (_mindFeelsCache[filter] && _mindFeelsCache[filter]._ts) {
    if (cb) cb(_mindFeelsCache[filter]);
    return;
  }
  _mindApi('GET', '/api/mind/feels?filter=' + filter + '&limit=50').then(function(res) {
    if (res && res.ok) {
      _mindFeelsCache[filter] = res.rows || [];
      _mindFeelsCache[filter]._ts = Date.now();
    }
    if (cb) cb(_mindFeelsCache[filter] || []);
  }).catch(function() { if (cb) cb([]); });
}

function _fetchMemories(filter, cb) {
  _mindApi('GET', '/api/mind/memories?filter=' + filter + '&limit=50').then(function(res) {
    if (res && res.ok && cb) cb(res.rows || []);
    else if (cb) cb([]);
  }).catch(function() { if (cb) cb([]); });
}

function _fetchDreams(cb) {
  _mindApi('GET', '/api/mind/dreams?limit=20').then(function(res) {
    if (res && res.ok && cb) cb(res.rows || []);
    else if (cb) cb([]);
  }).catch(function() { if (cb) cb([]); });
}

// Minimal fallback when API is down — keeps UI structure alive without fake content
function _mockMindData() {
  return {
    layer: {
      identity: { title: '心井', subtitle: '等待数据...' },
      energyBar: [],
      thoughtPreview: '还没有思绪浮上来。再多聊几句吧。',
      desire: { text: '等待第一缕欲望', action: '等待', progress: 0 },
      directions: []
    },
    feels: [],
    memories: [],
    dreams: []
  };
}

// ====== CSS ======
function _initMindStyles() {
  if (document.getElementById('mindStyles')) return;
  var s = document.createElement('style');
  s.id = 'mindStyles';
  s.textContent = [
    // Panel
    '.mind-panel{position:fixed;inset:0;z-index:80;display:none;flex-direction:column;background:#FAF8F3;color:#2C2821;overflow:hidden;font-family:var(--font-sans)}',
    '@media(prefers-color-scheme:dark){.mind-panel{background:#1C1A17;color:#E8E4DB}}',
    'html[data-theme="dark"] .mind-panel{background:#1C1A17;color:#E8E4DB}',

    // Header
    '.mind-header{flex:none;display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top) + 12px) 16px 0;height:56px}',
    '.mind-header-center{text-align:center;flex:1}',
    '.mind-title{font:600 20px/1 var(--font-serif);letter-spacing:.02em}',
    '.mind-subtitle{font:400 12px/1 var(--font-sans);color:#8A8276;margin-top:4px}',
    '@media(prefers-color-scheme:dark){.mind-subtitle{color:#8A8276}}',
    'html[data-theme="dark"] .mind-subtitle{color:#8A8276}',
    '.mind-header-btn{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:#2C2821;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}',
    '.mind-header-btn:active{background:rgba(0,0,0,.06)}',
    '@media(prefers-color-scheme:dark){.mind-header-btn{color:#E8E4DB}.mind-header-btn:active{background:rgba(255,255,255,.08)}}',
    'html[data-theme="dark"] .mind-header-btn{color:#E8E4DB}html[data-theme="dark"] .mind-header-btn:active{background:rgba(255,255,255,.08)}',

    // Inner nav (floating bottom)
    '.mind-inner-nav{flex:none;display:flex;justify-content:center;gap:0;padding:8px 16px calc(8px + env(safe-area-inset-bottom))}',
    '.mind-inner-nav-inner{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(0,0,0,.04)}',
    '@media(prefers-color-scheme:dark){.mind-inner-nav-inner{background:rgba(255,255,255,.04)}}',
    'html[data-theme="dark"] .mind-inner-nav-inner{background:rgba(255,255,255,.04)}',
    '.mind-nav-btn{flex:1;min-width:64px;padding:10px 16px;border:0;border-radius:999px;background:transparent;color:#8A8276;font:500 13px/1 var(--font-sans);cursor:pointer;transition:all .25s;display:flex;align-items:center;justify-content:center;gap:5px}',
    '.mind-nav-btn.active{background:#2C2821;color:#F8F7F4}',
    '@media(prefers-color-scheme:dark){.mind-nav-btn.active{background:#E8E4DB;color:#1C1A17}}',
    'html[data-theme="dark"] .mind-nav-btn.active{background:#E8E4DB;color:#1C1A17}',
    '.mind-nav-dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.5;transition:opacity .25s}',
    '.mind-nav-btn.active .mind-nav-dot{opacity:1}',

    // Content
    '.mind-content{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 20px 24px}',

    // Section titles
    '.mind-section-title{font:600 13px/1 var(--font-sans);color:#8A8276;text-transform:uppercase;letter-spacing:.08em;margin:24px 0 12px}',
    '@media(prefers-color-scheme:dark){.mind-section-title{color:#8A8276}}',

    // Identity block
    '.mind-identity{padding:20px 0 12px;text-align:center}',
    '.mind-identity-title{font:400 28px/1.2 var(--font-serif);color:#2C2821;letter-spacing:.03em}' +
      '@media(prefers-color-scheme:dark){.mind-identity-title{color:#E8E4DB}}' +
      'html[data-theme="dark"] .mind-identity-title{color:#E8E4DB}',
    '.mind-identity-sub{font:400 14px/1 var(--font-sans);color:#8A8276;margin-top:6px}',

    // Search bar
    '.mind-search{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;background:rgba(0,0,0,.03);margin:12px 0}',
    '@media(prefers-color-scheme:dark){.mind-search{background:rgba(255,255,255,.04)}}',
    'html[data-theme="dark"] .mind-search{background:rgba(255,255,255,.04)}',
    '.mind-search-icon{flex:none;color:#B5B0A6}',
    '.mind-search-input{flex:1;border:0;outline:0;background:transparent;font:400 14px/1 var(--font-sans);color:inherit}',
    '.mind-search-input::placeholder{color:#B5B0A6}',

    // Energy bar
    '.mind-energy-bar{display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;margin:12px 0 6px}',
    '.mind-energy-seg{border-radius:1px;transition:flex .5s}',

    // Thought preview
    '.mind-thought{position:relative;padding:16px 0;margin:8px 0}',
    '.mind-thought-text{font:400 15px/1.65 var(--font-serif);color:#8A8276;filter:blur(2px);user-select:none;transition:filter .3s}',
    '.mind-thought-text:hover{filter:blur(0)}',
    '.mind-thought-label{font:600 10px/1 var(--font-sans);color:#B5B0A6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}',

    // Desire card
    '.mind-desire-card{display:block;width:100%;padding:20px 18px;border:0;border-radius:20px;background:linear-gradient(135deg,#F5E0D8 0%,#F8EBE4 40%,#FFFDF9 100%);text-align:left;cursor:pointer;margin:8px 0;position:relative;overflow:hidden}',
    '@media(prefers-color-scheme:dark){.mind-desire-card{background:linear-gradient(135deg,#3A2828 0%,#2E2222 40%,#1C1A17 100%)}}',
    'html[data-theme="dark"] .mind-desire-card{background:linear-gradient(135deg,#3A2828 0%,#2E2222 40%,#1C1A17 100%)}',
    '.mind-desire-label{font:600 11px/1 var(--font-sans);color:#C89664;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}',
    '.mind-desire-text{font:400 18px/1.35 var(--font-serif);color:#2C2821;margin-bottom:12px}' +
      '@media(prefers-color-scheme:dark){.mind-desire-text{color:#E8E4DB}}',
    '.mind-desire-action{display:inline-flex;align-items:center;gap:4px;padding:8px 16px;border-radius:999px;background:#C89664;color:#FFF;font:500 13px/1 var(--font-sans)}',
    '.mind-desire-progress{margin-top:12px;height:3px;border-radius:2px;background:rgba(0,0,0,.08);overflow:hidden}' +
      '@media(prefers-color-scheme:dark){.mind-desire-progress{background:rgba(255,255,255,.08)}}',
    '.mind-desire-progress-bar{height:100%;border-radius:2px;background:#C89664;transition:width .6s ease}',

    // Direction list
    '.mind-dir-item{display:flex;align-items:center;gap:10px;padding:6px 0}',
    '.mind-dir-key{flex:none;width:40px;font:400 14px/1 var(--font-sans);color:#2C2821}' +
      '@media(prefers-color-scheme:dark){.mind-dir-key{color:#E8E4DB}}',
    '.mind-dir-bar{flex:1;height:2px;border-radius:1px;background:rgba(0,0,0,.06);overflow:hidden}' +
      '@media(prefers-color-scheme:dark){.mind-dir-bar{background:rgba(255,255,255,.06)}}',
    '.mind-dir-val{height:100%;border-radius:1px;transition:width .5s ease}',

    // Feel page
    '.mind-feel-filter{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(0,0,0,.04);margin:12px 0 18px}' +
      '@media(prefers-color-scheme:dark){.mind-feel-filter{background:rgba(255,255,255,.04)}}',
    '.mind-feel-filter-btn{flex:1;padding:8px 12px;border:0;border-radius:999px;background:transparent;color:#8A8276;font:500 13px/1 var(--font-sans);cursor:pointer;transition:all .2s}',
    '.mind-feel-filter-btn.active{background:#FFF;color:#2C2821;box-shadow:0 1px 3px rgba(0,0,0,.06)}' +
      '@media(prefers-color-scheme:dark){.mind-feel-filter-btn.active{background:#2C2821;color:#E8E4DB;box-shadow:none}}' +
      'html[data-theme="dark"] .mind-feel-filter-btn.active{background:#2C2821;color:#E8E4DB;box-shadow:none}',

    // Feel cards
    '.mind-feel-card{position:relative;padding:16px 16px 14px;margin-bottom:10px;border-radius:16px;background:#FFFDF9;overflow:hidden;transition:all .3s}' +
      '@media(prefers-color-scheme:dark){.mind-feel-card{background:#25221E}}',
    '.mind-feel-indicator{position:absolute;left:0;top:0;bottom:0;width:3px}',
    '.mind-feel-body{font:400 14px/1.6 var(--font-serif);color:#2C2821;transition:all .3s}' +
      '@media(prefers-color-scheme:dark){.mind-feel-body{color:#E8E4DB}}',
    '.mind-feel-meta{display:flex;align-items:center;gap:8px;margin-top:10px;font:400 11px/1 var(--font-sans);color:#8A8276}',
    '.mind-feel-intensity{display:flex;gap:1px}',
    '.mind-feel-intensity-dot{width:4px;height:4px;border-radius:50%;background:#C89664}',
    '.mind-feel-intensity-dot.gray{background:#D0CDC8}',
    // fading — blur
    '.mind-feel-card.fading .mind-feel-body{filter:blur(3px);opacity:.55;color:#B5B0A6}',
    '.mind-feel-card.fading .mind-feel-meta{opacity:.5}',
    // sleeping — heavy blur + low contrast
    '.mind-feel-card.sleeping .mind-feel-body{filter:blur(6px);opacity:.35;color:#B5B0A6}',
    '.mind-feel-card.sleeping .mind-feel-meta{opacity:.35}',

    // Dream timeline
    '.mind-dream-list{position:relative}',
    '.mind-dream-card{position:relative;padding:18px 16px;margin-bottom:14px;border-radius:16px;background:#FFFDF9;box-shadow:0 1px 4px rgba(0,0,0,.03)}' +
      '@media(prefers-color-scheme:dark){.mind-dream-card{background:#25221E;box-shadow:none}}',
    '.mind-dream-date{font:600 12px/1 var(--font-sans);color:#B5B0A6;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}',
    '.mind-dream-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}',
    '.mind-dream-moon{font-size:16px}',
    '.mind-dream-badge{font:500 11px/1 var(--font-sans);color:#C89664}',
    '.mind-dream-title{font:600 16px/1.2 var(--font-serif);margin-bottom:8px;color:#2C2821}' +
      '@media(prefers-color-scheme:dark){.mind-dream-title{color:#E8E4DB}}',
    '.mind-dream-body{font:400 13px/1.6 var(--font-serif);color:#6E6D66}' +
      '@media(prefers-color-scheme:dark){.mind-dream-body{color:#9A948A}}',
    '.mind-dream-open{display:inline-flex;align-items:center;gap:4px;margin-top:10px;padding:6px 12px;border:1px solid rgba(0,0,0,.1);border-radius:999px;background:transparent;color:#8A8276;font:500 12px/1 var(--font-sans);cursor:pointer;transition:all .2s}' +
      '@media(prefers-color-scheme:dark){.mind-dream-open{border-color:rgba(255,255,255,.1)}}',
    '.mind-dream-open:active{background:rgba(0,0,0,.03)}',

    // Memory page
    '.mind-mem-card{position:relative;padding:16px;margin-bottom:12px;border-radius:16px;background:#FFFDF9;border:1px solid rgba(180,160,120,.2)}' +
      '@media(prefers-color-scheme:dark){.mind-mem-card{background:#25221E;border-color:rgba(180,160,120,.1)}}',
    '.mind-mem-pin{position:absolute;top:12px;right:12px;font-size:14px;opacity:.5}',
    // 淡去 —— 按 weight 连续模糊，像想不起来的记忆。碰一下（hover / 点开）才看得清
    '.mind-mem-fade{transition:filter .45s ease,opacity .45s ease;will-change:filter}',
    '.mind-mem-card:hover .mind-mem-fade,.mind-mem-card.revealed .mind-mem-fade{filter:blur(0)!important;opacity:1!important}',
    '.mind-mem-weight{display:inline-block;width:28px;height:2px;border-radius:2px;background:rgba(200,150,100,.18);overflow:hidden;vertical-align:middle}',
    '.mind-mem-weight i{display:block;height:100%;background:#C89664;border-radius:2px}',
    '.mind-mem-title{font:600 15px/1.3 var(--font-serif);color:#2C2821;margin-bottom:6px;padding-right:24px}' +
      '@media(prefers-color-scheme:dark){.mind-mem-title{color:#E8E4DB}}',
    '.mind-mem-summary{font:400 13px/1.55 var(--font-serif);color:#6E6D66;margin-bottom:8px}',
    '.mind-mem-source{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.04);font:400 10px/1 var(--font-sans);color:#8A8276;margin-bottom:8px}',
    '@media(prefers-color-scheme:dark){.mind-mem-source{background:rgba(255,255,255,.05)}}',
    '.mind-mem-meta{display:flex;align-items:center;justify-content:space-between;font:400 11px/1 var(--font-sans);color:#B5B0A6}',
    '.mind-mem-recall{display:flex;align-items:center;gap:4px}',

    // Empty state
    '.mind-empty{text-align:center;padding:60px 20px;font:400 14px/1.5 var(--font-sans);color:#B5B0A6}',

    // Animations
    '@keyframes mindFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}',
    '.mind-card-entering{animation:mindFadeIn .4s ease both}',

    // === data-theme="dark" fallback — 用 !important 确保覆盖 ===
    'html[data-theme="dark"] .mind-panel{background:#1C1A17!important;color:#E8E4DB!important}',
    'html[data-theme="dark"] .mind-content{background:#1C1A17!important}',
    'html[data-theme="dark"] .mind-section-title{color:#8A8276!important}',
    'html[data-theme="dark"] .mind-identity-title{color:#E8E4DB!important}',
    'html[data-theme="dark"] .mind-identity-sub{color:#8A8276!important}',
    'html[data-theme="dark"] .mind-desire-text{color:#E8E4DB!important}',
    'html[data-theme="dark"] .mind-desire-progress{background:rgba(255,255,255,.08)!important}',
    'html[data-theme="dark"] .mind-dir-key{color:#E8E4DB!important}',
    'html[data-theme="dark"] .mind-dir-bar{background:rgba(255,255,255,.06)!important}',
    'html[data-theme="dark"] .mind-feel-filter{background:rgba(255,255,255,.04)!important}',
    'html[data-theme="dark"] .mind-feel-filter-btn.active{background:#2C2821!important;color:#E8E4DB!important;box-shadow:none!important}',
    'html[data-theme="dark"] .mind-feel-card{background:#25221E!important}',
    'html[data-theme="dark"] .mind-feel-body{color:#E8E4DB!important}',
    'html[data-theme="dark"] .mind-feel-meta{color:#8A8276!important}',
    'html[data-theme="dark"] .mind-dream-card{background:#25221E!important;box-shadow:none!important}',
    'html[data-theme="dark"] .mind-dream-date{color:#8A8276!important}',
    'html[data-theme="dark"] .mind-dream-title{color:#E8E4DB!important}',
    'html[data-theme="dark"] .mind-dream-body{color:#9A948A!important}',
    'html[data-theme="dark"] .mind-dream-open{border-color:rgba(255,255,255,.1)!important;color:#8A8276!important}',
    'html[data-theme="dark"] .mind-mem-card{background:#25221E!important;border-color:rgba(180,160,120,.1)!important}',
    'html[data-theme="dark"] .mind-mem-title{color:#E8E4DB!important}',
    'html[data-theme="dark"] .mind-mem-summary{color:#9A948A!important}',
    'html[data-theme="dark"] .mind-mem-source{background:rgba(255,255,255,.05)!important;color:#8A8276!important}',
    'html[data-theme="dark"] .mind-mem-meta{color:#8A8276!important}',
    'html[data-theme="dark"] .mind-empty{color:#8A8276!important}',
    'html[data-theme="dark"] .mind-search{background:rgba(255,255,255,.04)!important}',
    'html[data-theme="dark"] .mind-thought-text{color:#6A655E!important}',
  ].join('\n');
  document.head.appendChild(s);
}

// ====== Panel Lifecycle ======
function openMindPanel() {
  try { closeDrawer(); } catch(e) {}
  _mindPage = 'layer';
  _mindFeelFilter = 'active';
  // 先注入 mock 数据确保渲染不崩溃
  if (!_mockCache) _mockCache = _mockMindData();
  if (!_mindData || !_mindData.layer) _mindData = _mockCache;
  _renderMindShell();
  $('mindPanel').style.display = 'flex';
  $('mindPanel').setAttribute('aria-hidden', 'false');
  _renderCurrentPage();
  // 后台异步拉真实数据，到了再刷新
  _loadMindData();
}

function closeMindPanel() {
  $('mindPanel').style.display = 'none';
  $('mindPanel').setAttribute('aria-hidden', 'true');
}

// ====== Shell ======
function _renderMindShell() {
  var p = $('mindPanel');
  p.innerHTML =
    '<header class="mind-header">' +
      '<button class="mind-header-btn" onclick="closeMindPanel()" aria-label="Close"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
      '<div class="mind-header-center">' +
        '<div class="mind-title">Mind</div>' +
        '<div class="mind-subtitle" id="mindSubtitle"></div>' +
      '</div>' +
      '<button class="mind-header-btn" onclick="_refreshMindPage()" aria-label="刷新" title="刷新当前页面"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="6" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18" r="1.2"/></svg></button>' +
    '</header>' +
    // Content area
    '<div class="mind-content" id="mindContent"></div>' +
    // Inner bottom nav
    '<nav class="mind-inner-nav">' +
      '<div class="mind-inner-nav-inner">' +
        '<button class="mind-nav-btn active" data-mind-page="layer" onclick="_switchMindPage(\'layer\')"><span class="mind-nav-dot"></span>地层</button>' +
        '<button class="mind-nav-btn" data-mind-page="feel" onclick="_switchMindPage(\'feel\')"><span class="mind-nav-dot"></span>感受</button>' +
        '<button class="mind-nav-btn" data-mind-page="memory" onclick="_switchMindPage(\'memory\')"><span class="mind-nav-dot"></span>记忆</button>' +
        '<button class="mind-nav-btn" data-mind-page="flash" onclick="_switchMindPage(\'flash\')"><span class="mind-nav-dot"></span>活水</button>' +
        '<button class="mind-nav-btn" data-mind-page="dream" onclick="_switchMindPage(\'dream\')"><span class="mind-nav-dot"></span>梦</button>' +
      '</div>' +
    '</nav>';
}

function _refreshMindPage() {
  // 重新加载当前页面
  if (_mindPage === 'layer') _renderMindLayer();
  else if (_mindPage === 'feel') _renderMindFeel();
  else if (_mindPage === 'memory') _renderMindMemory();
  else if (_mindPage === 'dream') _renderMindDream();
  else if (_mindPage === 'flash') _renderMindFlash();
}

function _switchMindPage(page) {
  _mindPage = page;
  // Update nav active
  var btns = document.querySelectorAll('.mind-nav-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.mindPage === page);
  }
  // Clear & re-render content
  $('mindContent').innerHTML = '';
  _renderCurrentPage();
  // Subtitles
  var subs = { layer: '内心地层', feel: '记得的感受', flash: '没落下来的——还在转的活水', memory: '记得的事 · 慢慢淡，钉住的留下', dream: '每一晚卧下一层，最新的在最上面' };
  $('mindSubtitle').textContent = subs[page] || '';
}

function _renderCurrentPage() {
  switch (_mindPage) {
    case 'layer': _renderLayerPage(); break;
    case 'feel': _renderFeelPage(); break;
    case 'flash': _renderFlashPage(); break;
    case 'dream': _renderDreamPage(); break;
    case 'memory': _renderMemoryPage(); break;
  }
}

// ====== Page 1: 地层 ======
function _renderLayerPage() {
  var d = _mindData.layer;
  var el = $('mindContent');
  var html = '';

  // Identity
  html += '<div class="mind-identity">';
  html += '<div class="mind-identity-title">' + escHtml(d.identity.title) + '</div>';
  html += '<div class="mind-identity-sub">' + escHtml(d.identity.subtitle) + '</div>';
  html += '</div>';

  // Search
  html += '<div class="mind-search">';
  html += '<span class="mind-search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>';
  html += '<input class="mind-search-input" type="text" placeholder="挖掘地三层" oninput="_searchMindLayer(this.value)">';
  html += '</div>';

  // Energy bar
  html += '<div class="mind-section-title">此刻地表 · 今天</div>';
  html += '<div class="mind-energy-bar">';
  d.energyBar.forEach(function(seg, i) {
    html += '<div class="mind-energy-seg" style="flex:' + seg.pct + ';background:' + _mindMoodColor(seg.mood) + ';animation-delay:' + (i*0.08) + 's" title="' + _mindMoodName(seg.mood) + ' ' + seg.pct + '%"></div>';
  });
  html += '</div>';

  // Thought preview
  html += '<div class="mind-thought">';
  html += '<div class="mind-thought-label">透上来的思绪</div>';
  html += '<div class="mind-thought-text">' + escHtml(d.thoughtPreview) + '</div>';
  html += '</div>';

  // Desire card
  html += '<button class="mind-desire-card" onclick="_tapDesire()">';
  html += '<div class="mind-desire-label">最想做的一件事</div>';
  html += '<div class="mind-desire-text">' + escHtml(d.desire.text) + '</div>';
  html += '<span class="mind-desire-action">' + escHtml(d.desire.action) + ' <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>';
  html += '<div class="mind-desire-progress"><div class="mind-desire-progress-bar" style="width:' + Math.round(d.desire.progress * 100) + '%"></div></div>';
  html += '</button>';

  // Direction list
  html += '<div class="mind-section-title">方向 · 此刻哪一维最高</div>';
  d.directions.forEach(function(dir) {
    var pct = Math.round(dir.value * 100);
    html += '<div class="mind-dir-item">';
    html += '<span class="mind-dir-key">' + escHtml(dir.key) + '</span>';
    html += '<div class="mind-dir-bar"><div class="mind-dir-val" style="width:' + pct + '%;background:' + _dirColor(dir.key) + '"></div></div>';
    html += '<span style="flex:none;width:28px;text-align:right;font:400 11px/1 var(--font-sans);color:#B5B0A6">' + pct + '</span>';
    html += '</div>';
  });

  el.innerHTML = html;
}

function _dirColor(key) {
  var map = {
    '依恋':'#E8C0A0','attachment':'#E8C0A0','好奇':'#B8C8A0','curiosity':'#B8C8A0',
    '沉淀':'#A0B8C8','reflection':'#A0B8C8','记挂':'#C8C0A0','duty':'#C8C0A0',
    '热闹':'#D0B8A0','social':'#D0B8A0','累了':'#C0C0C0','fatigue':'#C0C0C0',
    '渴':'#C8A0B8','libido':'#C8A0B8','压力':'#D88070','stress':'#D88070',
    // Mind 12 维（设计文档第 9 页）
    'browse':'#B8C8A0','read':'#A0B8C8','possess':'#D8A0A8','boredom':'#C0BCB0',
    'crave':'#E8B890','monitor':'#9FB0A8','share':'#C8B8D0','grieve':'#8FA0B8','anger':'#D88070'
  };
  return map[key] || '#C89664';
}

function _tapDesire() {
  // Placeholder — future: open desire panel or mark as done
  var card = document.querySelector('.mind-desire-card');
  if (card) { card.style.opacity = '.8'; setTimeout(function() { card.style.opacity = '1'; }, 200); }
}

function _searchMindLayer(q) {
  var el = $('mindContent');
  if (!q || q.trim().length < 2) {
    _renderCurrentPage();
    return;
  }
  _mindApi('GET', '/api/mind/search?q=' + encodeURIComponent(q.trim())).then(function(res) {
    if (!res || !res.ok || !res.results || !res.results.length) {
      el.innerHTML = '<div class="mind-empty">翻遍了地层，没有找到跟 "' + escHtml(q) + '" 相关的。<br>也许还没写下来。</div>';
      return;
    }
    var html = '<div class="mind-section-title">搜索结果 · ' + res.results.length + ' 条</div>';
    res.results.forEach(function(r, i) {
      var mc = _mindMoodColor(r.mood || 'calm');
      var kindLabel = r.kind === 'feel' ? '感受' : r.kind === 'memory' ? '记忆' : '梦';
      html += '<div class="mind-mem-card mind-card-entering" style="animation-delay:' + (i * 0.05) + 's">';
      html += '<div style="position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px;background:' + mc + '"></div>';
      html += '<div style="padding-left:8px">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span class="mind-mem-source">' + kindLabel + '</span></div>';
      html += '<div style="font:400 13px/1.55 var(--font-serif);color:#6E6D66">' + escHtml(r.body) + '</div>';
      html += '</div></div>';
    });
    el.innerHTML = html;
  }).catch(function() {
    el.innerHTML = '<div class="mind-empty">搜索暂时不可用。</div>';
  });
}

// ====== Page 2: 感受 ======
function _renderFeelPage() {
  var el = $('mindContent');
  var html = '';

  // Filter pills
  html += '<div class="mind-feel-filter">';
  html += '<button class="mind-feel-filter-btn ' + (_mindFeelFilter === 'active' ? 'active' : '') + '" onclick="_setFeelFilter(\'active\')">活跃</button>';
  html += '<button class="mind-feel-filter-btn ' + (_mindFeelFilter === 'fading' ? 'active' : '') + '" onclick="_setFeelFilter(\'fading\')">淡了</button>';
  html += '<button class="mind-feel-filter-btn ' + (_mindFeelFilter === 'sleeping' ? 'active' : '') + '" onclick="_setFeelFilter(\'sleeping\')">沉睡</button>';
  html += '</div>';
  html += '<div id="mindFeelList"></div>';
  el.innerHTML = html;

  _renderFeelList();
}

function _renderFeelList() {
  var container = document.getElementById('mindFeelList');
  if (!container) return;
  // Cache first, else mock _mindData.feels, else fetch
  if (_mindFeelsCache[_mindFeelFilter] && _mindFeelsCache[_mindFeelFilter]._ts) {
    var cached = _mindFeelsCache[_mindFeelFilter];
    if (cached.length) { _renderFeelCards(container, cached); return; }
    // cache 是空的 → 看 mock
  }
  if (_mindData && _mindData.feels) {
    var filtered = _mindData.feels.filter(function(f) {
      if (_mindFeelFilter === 'active') return f.weight >= 0.40;
      if (_mindFeelFilter === 'fading') return f.weight >= 0.10 && f.weight < 0.40;
      return f.weight < 0.10;
    });
    _renderFeelCards(container, filtered);
  } else {
    // 用 _mockCache 兜底
    var mf = (_mockCache && _mockCache.feels) ? _mockCache.feels.filter(function(f) {
      if (_mindFeelFilter === 'active') return f.weight >= 0.40;
      if (_mindFeelFilter === 'fading') return f.weight >= 0.10 && f.weight < 0.40;
      return f.weight < 0.10;
    }) : [];
    if (mf.length) { _renderFeelCards(container, mf); return; }
    _fetchFeels(_mindFeelFilter, function(rows) { _renderFeelCards(container, rows); });
  }
}

function _renderFeelCards(container, rows) {
  if (!rows || !rows.length) {
    container.innerHTML = '<div class="mind-empty">这一层是空的。<br>还没有感受沉到这里。</div>';
    return;
  }
  var html = '';
  rows.forEach(function(f, i) {
    var w = f.weight || 0;
    var fadeClass = w < 0.10 ? ' sleeping' : (w < 0.40 ? ' fading' : '');
    var ts = f.created_at ? new Date(f.created_at * 1000) : null;
    var dateStr = ts ? (ts.getFullYear() + '-' + pad2(ts.getMonth()+1) + '-' + pad2(ts.getDate())) : '';
    html += '<div class="mind-feel-card' + fadeClass + ' mind-card-entering" style="animation-delay:' + (i * 0.05) + 's" data-id="' + escHtml(f.id) + '">';
    html += '<div class="mind-feel-indicator" style="background:' + _mindMoodColor(f.mood) + '"></div>';
    html += '<div style="padding-left:8px">';
    html += '<div class="mind-feel-body">' + escHtml(f.body) + '</div>';
    html += '<div class="mind-feel-meta">';
    html += '<span>' + _mindMoodName(f.mood) + '</span>';
    html += '<span>·</span>';
    html += '<span>' + dateStr + '</span>';
    html += '<span>·</span>';
    html += '<span>想过 ' + (f.surface_count || 0) + ' 次</span>';
    var intensity = f.intensity || 5;
    html += '<span class="mind-feel-intensity">';
    for (var j = 0; j < 10; j++) {
      html += '<span class="mind-feel-intensity-dot' + (j >= intensity ? ' gray' : '') + '"></span>';
    }
    html += '</span>';
    html += f.pinned ? '<span style="cursor:pointer;margin-left:auto" onclick="event.stopPropagation();_mindTogglePin(\'feel\',\''+f.id+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M16 4V2H8v2H3v2h2.46l.64 14h11.8l.64-14H21V4h-5zm-2.54 2H10.5l-.46-1h3.92l-.46 1zM6.09 6h11.82l-.46 10H6.55L6.09 6z"/></svg></span>' : '';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });
  container.innerHTML = html;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function _setFeelFilter(f) {
  _mindFeelFilter = f;
  _renderFeelPage();
}

// ====== Page 3: 梦 ======
function _renderDreamPage() {
  var el = $('mindContent');
  el.innerHTML = '<div class="mind-dream-list" id="mindDreamList"><div class="mind-empty">翻找梦的抽屉...</div></div>';
  _fetchDreams(function(rows) {
    var container = document.getElementById('mindDreamList');
    if (!container) return;
    // Fallback mock data if API returns empty
    if ((!rows || !rows.length) && _mockCache && _mockCache.dreams) {
      rows = _mockCache.dreams;
    }
    if (!rows || !rows.length) {
      container.innerHTML = '<div class="mind-empty">还没有梦。<br>再多聊几天，梦会从感受里长出来。</div>';
      return;
    }
    var html = '';
    rows.forEach(function(d, i) {
      var ts = d.created_at ? new Date(d.created_at * 1000) : null;
      var dateStr = ts ? pad2(ts.getMonth()+1) + '月' + pad2(ts.getDate()) + '日' : '';
      var read = (d.surface_count || 0) > 0;
      html += '<div class="mind-dream-card mind-card-entering" style="animation-delay:' + (i * 0.08) + 's" data-id="' + escHtml(d.id) + '">';
      html += '<div class="mind-dream-date">' + dateStr + '</div>';
      html += '<div class="mind-dream-head">';
      html += '<span class="mind-dream-moon"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg></span>';
      html += '<span class="mind-dream-badge">梦 · 心井</span>';
      if (read) html += '<span style="font:400 10px/1 var(--font-sans);color:#B5B0A6;margin-left:4px">(已读过)</span>';
      html += '</div>';
      html += '<div class="mind-dream-title">' + escHtml(d.title || '无题') + '</div>';
      html += '<div class="mind-dream-body">' + escHtml(d.body) + '</div>';
      html += '<button class="mind-dream-open" onclick="_openDream(\'' + d.id + '\')">翻开 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>';
      html += '</div>';
    });
    container.innerHTML = html;
  });
}

function _openDream(id) {
  // Show full dream text in a simple overlay
  _fetchDreams(function(rows) {
    var dream = (rows || []).find(function(d) { return d.id === id; });
    if (!dream) return;
    alert(dream.body);
  });
}

// ====== Page 4.5: 活水 — 念头池 ======
// Minimal flash pool fallback when API is down
function _mockFlashData() {
  return { ok: true, desirePushes: {}, obsessions: [], flashes: [] };
}

function _renderFlashContent(res) {
  var container = document.getElementById('mindFlashPool');
  if (!container) return;
  if (!res || !res.ok) { container.innerHTML = '<div class="mind-empty">活水暂时结冰了。</div>'; return; }
  var html = '';

  // 此刻最想干嘛 —— pickIntent（5 分钟窗口内稳定）
  var intent = res.intent;
  if (intent) {
    html += '<div class="mind-section-title">此刻 · 最想干嘛</div>';
    html += '<div class="mind-feel-card" style="border-left:3px solid ' + _dirColor(intent.drive) + '">';
    html += '<div style="padding-left:8px">';
    html += '<div style="font:600 13px/1.5 var(--font-sans)">' + escHtml(intent.action) + '</div>';
    html += '<div style="font:400 11px/1.6 var(--font-sans);color:#8A8276;margin-top:4px">'
         + escHtml(intent.label || '') + ' · ' + (intent.level || 0).toFixed(2) + '</div>';
    html += '</div></div>';
  }

  // 欲望维度条 —— 12 维缺口（设计文档第 9 页），不是 push 占位值
  html += '<div class="mind-section-title">地下暗流 · 欲望缺口</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">';
  var levels = res.levels || {};
  var ORDER = ['browse','read','social','libido','duty','possess','boredom','crave','monitor','share','grieve','anger'];
  ORDER.forEach(function(dk) {
    var d = levels[dk] || { level: 0, label: dk };
    var v = d.level || 0;
    var pct = Math.min(100, Math.round(v * 100));
    var color = _dirColor(dk);
    var isTop = intent && intent.drive === dk;
    html += '<div style="flex:0 0 calc(25% - 6px);text-align:center">';
    html += '<div style="font:' + (isTop ? '600' : '500') + ' 11px/1 var(--font-sans);color:'
         + (isTop ? '#C89664' : '#8A8276') + ';margin-bottom:4px">' + (d.label || dk) + '</div>';
    html += '<div style="height:4px;border-radius:2px;background:rgba(0,0,0,.06);overflow:hidden;margin-bottom:2px">';
    html += '<div style="height:100%;border-radius:2px;background:' + color + ';width:' + pct + '%;transition:width .6s"></div>';
    html += '</div>';
    html += '<div style="font:400 9px/1 var(--font-sans);color:#B5B0A6">' + v.toFixed(2)
         + (d.decaying ? ' ↓' : '') + '</div>';
    html += '</div>';
  });
  html += '</div>';
  if (typeof res.fatigue === 'number') {
    html += '<div style="font:400 10px/1 var(--font-sans);color:#B5B0A6;margin:-12px 0 20px;text-align:center">累 '
         + res.fatigue.toFixed(2) + '（白天涨夜里落，只改偏好）</div>';
  }

  // 执念区
  html += '<div class="mind-section-title">执念 · 不散反长</div>';
  var obsessions = res.obsessions || [];
  if (!obsessions.length) {
    html += '<div class="mind-empty" style="padding:16px 20px;font-size:13px">还没有执念。<br>闪念被反复点到才会升级。</div>';
  } else {
    obsessions.forEach(function(o, i) {
      var pct = Math.round(o.intensity * 100);
      var pushesLeft = 3 - (o.obsession_pushes || 0);
      html += '<div class="mind-feel-card mind-card-entering" style="animation-delay:' + (i*0.06) + 's;border-left:3px solid #D88080">';
      html += '<div style="padding-left:8px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
      html += '<span style="font:600 11px/1 var(--font-sans);color:#D88080"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M13.35 20.13c-.76.69-1.93.69-2.69-.01l-.11-.1C5.3 15.27 1.87 12.16 2 8.28c.06-1.7.93-3.33 2.34-4.29 2.64-1.8 5.9-.96 7.66 1.1 1.76-2.06 5.02-2.91 7.66-1.1 1.41.96 2.28 2.59 2.34 4.29.14 3.88-3.3 6.99-8.55 11.76l-.1.09z"/></svg> 执念</span>';
      html += '<span style="font:400 10px/1 var(--font-sans);color:#B5B0A6">×' + (o.trigger_count||0) + ' 次触发</span>';
      html += '<span style="font:400 10px/1 var(--font-sans);color:#C89664;margin-left:auto">再推 ' + pushesLeft + ' 次了却</span>';
      html += '</div>';
      html += '<div class="mind-feel-body" style="filter:none;opacity:1">' + escHtml(o.body) + '</div>';
      html += '<div style="margin-top:8px;height:3px;border-radius:2px;background:rgba(0,0,0,.06);overflow:hidden">';
      html += '<div style="height:100%;border-radius:2px;background:linear-gradient(90deg,#D88080,#C89664);width:' + pct + '%;transition:width .5s"></div>';
      html += '</div>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">';
      html += '<span style="font:400 10px/1 var(--font-sans);color:#B5B0A6">强度 ' + (o.intensity||0).toFixed(3) + ' · ×1.10/拍</span>';
      html += '<span style="font:400 10px/1 var(--font-sans);color:#8A8276;cursor:pointer" onclick="_mindResolveFlash(\''+o.id+'\')">了却</span>';
      html += '</div>';
      html += '</div></div>';
    });
  }

  // 闪念区
  html += '<div class="mind-section-title">闪念 · 每拍 ×0.82</div>';
  var flashes = res.flashes || [];
  if (!flashes.length) {
    html += '<div class="mind-empty" style="padding:16px 20px;font-size:13px">水面是静的。<br>写 &lt;flash&gt; 标签丢一颗石子进来。</div>';
  } else {
    flashes.forEach(function(f, i) {
      var pct = Math.round(f.intensity * 100);
      html += '<div class="mind-feel-card mind-card-entering" style="animation-delay:' + (i*0.04) + 's;border-left:3px solid #A0B8C8;opacity:' + (0.4 + f.intensity * 0.6) + '">';
      html += '<div style="padding-left:8px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
      html += '<span style="font:600 11px/1 var(--font-sans);color:#A0B8C8"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg> 闪念</span>';
      html += '<span style="font:400 10px/1 var(--font-sans);color:#B5B0A6">×' + (f.trigger_count||0) + ' 次触发</span>';
      html += '<span style="font:400 10px/1 var(--font-sans);color:#8A8276;margin-left:auto">' + (f.intensity||0).toFixed(3) + '</span>';
      html += '</div>';
      html += '<div class="mind-feel-body" style="filter:none;opacity:' + (0.5 + f.intensity * 0.5) + '">' + escHtml(f.body) + '</div>';
      html += '<div style="margin-top:6px;height:2px;border-radius:1px;background:rgba(0,0,0,.06);overflow:hidden">';
      html += '<div style="height:100%;border-radius:1px;background:#A0B8C8;width:' + pct + '%;transition:width .5s"></div>';
      html += '</div>';
      html += '<div style="font:400 9px/1 var(--font-sans);color:#B5B0A6;margin-top:3px">×0.82/拍 · 0.8 升级 · 0.05 散掉</div>';
      html += '</div></div>';
    });
  }

  container.innerHTML = html;
}

function _renderFlashPage() {
  var el = $('mindContent');
  el.innerHTML = '<div id="mindFlashPool"><div class="mind-empty">探入活水...</div></div>';
  _mindApi('GET', '/api/mind/flash-pool').then(function(res) {
    _renderFlashContent(res);
  }).catch(function() {
    // Fallback mock flash data
    _renderFlashContent(_mockFlashData());
  });
}

function _mindResolveFlash(id) {
  _mindApi('POST', '/api/mind/flash-pool/resolve', { id: id }).then(function(res) {
    if (res && res.ok) { _renderFlashPage(); }
  });
}

// ====== Page 4: 记忆 ======
function _renderMemoryPage() {
  var el = $('mindContent');
  el.innerHTML = '<div class="mind-section-title">我层 · 记得的事 · 慢慢淡，钉住的留下</div><div id="mindMemList"><div class="mind-empty">翻开记忆...</div></div>';
  _fetchMemories('all', function(rows) {
    var container = document.getElementById('mindMemList');
    if (!container) return;
    // Fallback mock data if API returns empty
    if ((!rows || !rows.length) && _mockCache && _mockCache.memories) {
      rows = _mockCache.memories;
    }
    if (!rows || !rows.length) {
      container.innerHTML = '<div class="mind-empty">我层还是空的。<br>当你写 &lt;memory&gt; 标签，它们就会落到这里。</div>';
      return;
    }
    var html = '';
    rows.forEach(function(m, i) {
      var mc = _mindMoodColor(m.mood || 'warm');
      var ts = m.created_at ? new Date(m.created_at * 1000) : null;
      var dateStr = ts ? (ts.getFullYear() + '-' + pad2(ts.getMonth()+1) + '-' + pad2(ts.getDate())) : '';
      var sourceLabel = m.source === 'chat_tag' ? '从聊天写入' : (m.source === 'session_summary' ? '窗口蒸馏' : (m.source || ''));
      // 钉住的永远清晰；没钉的按 weight 连续模糊 —— 1.0 全清，越接近 0 越看不清
      var w = (typeof m.weight === 'number') ? Math.max(0, Math.min(1, m.weight)) : 1;
      var blurPx = m.pinned ? 0 : Math.pow(1 - w, 1.6) * 5;
      var fadeOp = m.pinned ? 1 : (0.42 + w * 0.58);
      var fadeStyle = blurPx > 0.05
        ? ' style="filter:blur(' + blurPx.toFixed(2) + 'px);opacity:' + fadeOp.toFixed(2) + '"'
        : '';
      html += '<div class="mind-mem-card mind-card-entering" style="animation-delay:' + (i * 0.08) + 's" data-id="' + escHtml(m.id) + '" onclick="this.classList.toggle(\'revealed\')">';
      html += '<span class="mind-mem-pin" style="cursor:pointer" onclick="event.stopPropagation();_mindTogglePin(\'memory\',\''+m.id+'\')">' + (m.pinned ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px"><path d="M16 4V2H8v2H3v2h2.46l.64 14h11.8l.64-14H21V4h-5zm-2.54 2H10.5l-.46-1h3.92l-.46 1zM6.09 6h11.82l-.46 10H6.55L6.09 6z"/></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><path d="M16 4V2H8v2H3v2h2.46l.64 14h11.8l.64-14H21V4h-5z"/></svg>') + '</span>';
      html += '<div style="position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px;background:' + mc + '"></div>';
      html += '<div style="padding-left:8px">';
      html += '<div class="mind-mem-title mind-mem-fade"' + fadeStyle + '>' + escHtml(m.body.substring(0, 60) + (m.body.length > 60 ? '...' : '')) + '</div>';
      html += '<div class="mind-mem-summary mind-mem-fade"' + fadeStyle + '>' + escHtml(m.body) + '</div>';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">';
      html += '<span class="mind-mem-source">' + escHtml(sourceLabel) + '</span>';
      html += '<span style="font:400 10px/1 var(--font-sans);color:#B5B0A6">' + _mindMoodName(m.mood || 'warm') + '</span>';
      html += '</div>';
      html += '<div class="mind-mem-meta">';
      html += '<span>' + dateStr + '</span>';
      html += '<span style="display:inline-flex;align-items:center;gap:6px">';
      html += '<span class="mind-mem-weight" title="' + (m.pinned ? '钉住了，不会淡' : '还剩 ' + Math.round(w * 100) + '%') + '"><i style="width:' + Math.round((m.pinned ? 1 : w) * 100) + '%"></i></span>';
      html += '<span class="mind-mem-recall">想起 ' + (m.surface_count || 0) + ' 次</span>';
      html += '</span>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });
    container.innerHTML = html;
  });
}

// ====== Pin / Archive ======
function _mindTogglePin(type, id) {
  _mindApi('PATCH', '/api/mind/' + type + '/' + id + '/pin').then(function(res) {
    if (res && res.ok) {
      if (type === 'feel') { _mindFeelsCache = {}; _renderFeelPage(); }
      if (type === 'memory') _renderMemoryPage();
      if (type === 'dream') _renderDreamPage();
    }
  });
}

function _mindArchive(type, id) {
  if (!confirm('归档后会被沉到最底层。确定？')) return;
  _mindApi('PATCH', '/api/mind/' + type + '/' + id + '/archive').then(function(res) {
    if (res && res.ok) {
      if (type === 'feel') { _mindFeelsCache = {}; _renderFeelPage(); }
      if (type === 'memory') _renderMemoryPage();
      if (type === 'dream') _renderDreamPage();
    }
  });
}

// ====== Init ======
(function() {
  _initMindStyles();
  // Close button binding
  var ready = function() {
    var cb = $('closeMind');
    if (cb) cb.onclick = closeMindPanel;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else { ready(); }
})();
