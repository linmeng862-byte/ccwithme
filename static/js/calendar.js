/* ══════════════════════════════════════════════════════════════════
   Calendar —— 抽屉里的日历页（2026-08-24）

   她要这个页面的原因是原话：「以后接入 iwatch 他能知道我的状况」。
   所以这一页不是「排日程」，是**一天的全部痕迹摊开给他看**：
   写了什么日记 / 做了什么待办 / 聊了多少 / 身体怎么样。
   身体那一格现在是空的 —— her_vitals 表 08-23 就建好了（独立 token、只写不读、
   字段白名单），手表一接上这格自己就有数，不用再回来改前端。

   ⚠️ 天气不在这一页，在抽屉的日期旁边（见 index.html 的 #homeWeather）。
      规矩写在 backend.js 的 /api/weather 上面，改之前先读那段。
   ══════════════════════════════════════════════════════════════════ */

// 时区偏移（分钟，东八区 = 480）。后端是 UTC，不带这个的话她早上说的话
// 会被算进前一天。所有日历接口都要带上，别漏。
function _calTz() { return -new Date().getTimezoneOffset(); }

var _calState = {
  year: null, month: null,     // month 是 0-indexed
  sel: null,                   // 选中的那天 'YYYY-MM-DD'
  monthData: {},               // 服务端给的 days 映射
  dayData: null,
  loading: false
};

function _calDs(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _calMonthStr() {
  return _calState.year + '-' + String(_calState.month + 1).padStart(2, '0');
}
function _calIsToday(ds) { return ds === _calDs(new Date()); }

// ── 生命周期 ─────────────────────────────────────────────
function openCalendarPanel() {
  try { closeDrawer(); } catch (e) {}
  _initCalendarStyles();
  var panel = document.getElementById('calendarPanel');
  if (!panel) { panel = _buildCalendarPanel(); document.body.appendChild(panel); }
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  var now = new Date();
  if (_calState.year === null) { _calState.year = now.getFullYear(); _calState.month = now.getMonth(); }
  _calState.sel = _calDs(now);
  _renderCalendarMonth();
  _loadCalMonth();
  _loadCalDay(_calState.sel);
}
function closeCalendarPanel() {
  var p = document.getElementById('calendarPanel');
  if (!p) return;
  p.classList.remove('show');
  p.setAttribute('aria-hidden', 'true');
}

function _buildCalendarPanel() {
  var s = document.createElement('section');
  s.id = 'calendarPanel';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML =
    '<header class="cal-header">' +
      '<button class="cal-round-btn" id="closeCalendar" aria-label="关闭">×</button>' +
      '<div class="cal-title">Calendar</div>' +
      '<button class="cal-round-btn" id="calToday" aria-label="回到今天" title="回到今天">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="16" height="16"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>' +
      '</button>' +
    '</header>' +
    '<div class="cal-monthbar">' +
      '<button class="cal-nav" id="calPrev" aria-label="上个月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<div class="cal-monthlabel" id="calMonthLabel"></div>' +
      '<button class="cal-nav" id="calNext" aria-label="下个月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18"><path d="M9 5l7 7-7 7"/></svg></button>' +
    '</div>' +
    '<div class="cal-grid" id="calGrid"></div>' +
    '<div class="cal-day" id="calDay"></div>';
  s.querySelector('#closeCalendar').onclick = closeCalendarPanel;
  s.querySelector('#calToday').onclick = function () {
    var now = new Date();
    _calState.year = now.getFullYear(); _calState.month = now.getMonth();
    _renderCalendarMonth(); _loadCalMonth(); _selectCalDay(_calDs(now));
  };
  s.querySelector('#calPrev').onclick = function () { _calShiftMonth(-1); };
  s.querySelector('#calNext').onclick = function () { _calShiftMonth(1); };
  return s;
}

function _calShiftMonth(delta) {
  _calState.month += delta;
  if (_calState.month < 0) { _calState.month = 11; _calState.year--; }
  if (_calState.month > 11) { _calState.month = 0; _calState.year++; }
  _renderCalendarMonth();
  _loadCalMonth();
}

// ── 取数 ─────────────────────────────────────────────────
async function _loadCalMonth() {
  var m = _calMonthStr();
  try {
    var r = await api('/api/calendar/month?month=' + m + '&tz=' + _calTz());
    if (!r.ok) return;
    var j = await r.json();
    if (_calMonthStr() !== m) return;      // 她翻得比网络快，回来的是旧月份就丢掉
    _calState.monthData = j.days || {};
    _renderCalendarMonth();
  } catch (e) { /* 月历上没小点而已，不值得报错打扰她 */ }
}

async function _loadCalDay(ds) {
  _calState.loading = true;
  _renderCalDay();
  try {
    var r = await api('/api/calendar/day?date=' + ds + '&tz=' + _calTz());
    if (!r.ok) throw new Error('load failed');
    var j = await r.json();
    if (_calState.sel !== ds) return;
    _calState.dayData = j;
  } catch (e) {
    _calState.dayData = { date: ds, _error: true };
  }
  _calState.loading = false;
  _renderCalDay();
}

function _selectCalDay(ds) {
  _calState.sel = ds;
  _renderCalendarMonth();
  _loadCalDay(ds);
}

// ── 月历 ─────────────────────────────────────────────────
function _renderCalendarMonth() {
  var label = document.getElementById('calMonthLabel');
  var grid = document.getElementById('calGrid');
  if (!grid) return;
  var y = _calState.year, m = _calState.month;
  if (label) label.textContent = y + ' 年 ' + (m + 1) + ' 月';

  // 周一开头 —— 跟日记那边的周历一致，别两个页面两套规矩
  var firstDay = new Date(y, m, 1).getDay();      // 0=周日
  var lead = firstDay === 0 ? 6 : firstDay - 1;
  var daysInMonth = new Date(y, m + 1, 0).getDate();

  var html = '';
  ['一', '二', '三', '四', '五', '六', '日'].forEach(function (d) {
    html += '<span class="cal-dow">' + d + '</span>';
  });
  for (var i = 0; i < lead; i++) html += '<span class="cal-cell empty"></span>';

  for (var d = 1; d <= daysInMonth; d++) {
    var ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var info = _calState.monthData[ds] || {};
    var cls = 'cal-cell';
    if (_calIsToday(ds)) cls += ' today';
    if (ds === _calState.sel) cls += ' sel';
    html += '<button class="' + cls + '" data-date="' + ds + '">';
    html += '<span class="cal-num">' + d + '</span>';
    // 小点：日记 / 待办 / 身体 / 聊天。顺序固定，她扫一眼就知道哪个是哪个。
    var dots = '';
    if (info.diary)  dots += '<i class="cal-dot d-diary"></i>';
    if (info.todo || info.cmd) dots += '<i class="cal-dot d-todo"></i>';
    if (info.vitals) dots += '<i class="cal-dot d-vitals"></i>';
    if (info.chat)   dots += '<i class="cal-dot d-chat"></i>';
    html += '<span class="cal-dots">' + dots + '</span>';
    html += '</button>';
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(function (el) {
    el.onclick = function () { _selectCalDay(this.dataset.date); };
  });
}

// ── 某一天 ───────────────────────────────────────────────
var _VITAL_LABEL = {
  heart_rate: ['心率', 'bpm'], resting_hr: ['静息心率', 'bpm'], hrv: ['HRV', 'ms'],
  steps: ['步数', '步'], sleep: ['睡眠', '小时'], active_energy: ['活动消耗', 'kcal'],
  respiratory: ['呼吸', '次/分'], blood_oxygen: ['血氧', '%']
};

function _calEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function _calTime(ts) {
  if (!ts) return '';
  var d = new Date(ts * 1000);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function _renderCalDay() {
  var el = document.getElementById('calDay');
  if (!el) return;
  var ds = _calState.sel;
  var head = '<div class="cal-day-head">' + _calEsc(ds) + (_calIsToday(ds) ? ' <span class="cal-today-tag">今天</span>' : '') + '</div>';

  if (_calState.loading) { el.innerHTML = head + '<div class="cal-empty">读取中…</div>'; return; }
  var d = _calState.dayData;
  if (!d || d.date !== ds) { el.innerHTML = head + '<div class="cal-empty">读取中…</div>'; return; }
  if (d._error) { el.innerHTML = head + '<div class="cal-empty">这一天读不出来。</div>'; return; }

  var html = head;

  // 身体 —— 放最上面。这一页是为它做的，空着也要占位，
  // 因为「今天还没数据」本身就是一条信息。
  html += '<section class="cal-sec"><h3 class="cal-sec-title">身体</h3>';
  if (d.vitals && d.vitals.length) {
    html += '<div class="cal-vitals">';
    d.vitals.forEach(function (v) {
      var lab = _VITAL_LABEL[v.kind] || [v.kind, v.unit || ''];
      var sub = v.agg === 'avg' && v.lo != null && v.hi != null && v.lo !== v.hi
        ? v.lo + '–' + v.hi : (v.n > 1 ? v.n + ' 条' : '');
      html += '<div class="cal-vital"><span class="cal-vital-label">' + _calEsc(lab[0]) + '</span>' +
              '<span class="cal-vital-value">' + _calEsc(v.value) + '<i>' + _calEsc(lab[1]) + '</i></span>' +
              (sub ? '<span class="cal-vital-sub">' + _calEsc(sub) + '</span>' : '') + '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="cal-empty small">手表还没接上，这一格先空着。</div>';
  }
  html += '</section>';

  // 日记
  html += '<section class="cal-sec"><h3 class="cal-sec-title">日记</h3>';
  if (d.diary && d.diary.length) {
    d.diary.forEach(function (e) {
      var who = (e.who === 'ai' || e.who === 'claude') ? 'Claude' : '粥粥';
      var body = e.locked ? '（上锁了）' : String(e.content || '').replace(/\s+/g, ' ').slice(0, 90);
      html += '<div class="cal-item"><span class="cal-item-who">' + who + '</span>' +
              '<span class="cal-item-body">' + _calEsc(body) + '</span>' +
              (e.mood ? '<span class="cal-item-tag">' + _calEsc(e.mood) + '</span>' : '') + '</div>';
    });
  } else {
    html += '<div class="cal-empty small">这一天没写。</div>';
  }
  html += '</section>';

  // 待办 + 番茄钟/提醒 合成一格 —— 它们在她眼里是同一件事：今天要做的
  var acts = [];
  (d.todos || []).forEach(function (t) {
    acts.push({ done: !!t.done, text: t.body, time: t.done_at || t.trigger_at || t.created_at });
  });
  (d.commands || []).forEach(function (c) {
    acts.push({ done: c.status === 'done', text: c.title, time: c.completed_at || c.created_at });
  });
  acts.sort(function (a, b) { return (a.time || 0) - (b.time || 0); });
  html += '<section class="cal-sec"><h3 class="cal-sec-title">做了什么</h3>';
  if (acts.length) {
    acts.forEach(function (a) {
      html += '<div class="cal-item"><span class="cal-check' + (a.done ? ' on' : '') + '"></span>' +
              '<span class="cal-item-body' + (a.done ? ' done' : '') + '">' + _calEsc(a.text) + '</span>' +
              '<span class="cal-item-tag">' + _calTime(a.time) + '</span></div>';
    });
  } else {
    html += '<div class="cal-empty small">没有记录。</div>';
  }
  html += '</section>';

  // 聊天只给个量，不给内容 —— 这一页是给她看状态的，翻对话有别的地方
  if (d.chat && d.chat.total) {
    html += '<section class="cal-sec"><h3 class="cal-sec-title">聊天</h3>' +
            '<div class="cal-chatline">这一天说了 <b>' + d.chat.total + '</b> 句，其中你 <b>' + d.chat.mine + '</b> 句</div></section>';
  }

  el.innerHTML = html;
}

// ── 样式（跟日记一样自带，不动 home.css）────────────────
var _calStylesDone = false;
function _initCalendarStyles() {
  if (_calStylesDone) return;
  _calStylesDone = true;
  var css = [
    '#calendarPanel { --c-bg:#F8F7F4; --c-card:#FFFDF9; --c-text:#2C2821; --c-muted:#A0988B; --c-line:#E5DFD4; --c-accent:#2C2821; ' +
      'position:fixed; inset:0; z-index:80; display:none; flex-direction:column; background:var(--c-bg); color:var(--c-text); overflow:hidden; }',
    '#calendarPanel.show { display:flex; }',
    '@media (prefers-color-scheme: dark) { #calendarPanel { --c-bg:#1C1A17; --c-card:#25221E; --c-text:#E8E4DB; --c-muted:#8A8276; --c-line:#3A3530; --c-accent:#E8E4DB; } }',
    'html[data-theme="dark"] #calendarPanel { --c-bg:#1C1A17; --c-card:#25221E; --c-text:#E8E4DB; --c-muted:#8A8276; --c-line:#3A3530; --c-accent:#E8E4DB; }',
    'html[data-theme="light"] #calendarPanel { --c-bg:#F8F7F4; --c-card:#FFFDF9; --c-text:#2C2821; --c-muted:#A0988B; --c-line:#E5DFD4; --c-accent:#2C2821; }',

    '.cal-header { flex:none; display:grid; grid-template-columns:36px 1fr 36px; align-items:center; padding:calc(env(safe-area-inset-top) + 10px) 18px 6px; }',
    '.cal-title { text-align:center; font:500 17px var(--font-sans); }',
    /* 圆钮跟输入框同一套玻璃 —— 见 home.css 的 .glass-btn，那儿有三处同步的提醒 */
    '.cal-round-btn { width:36px; height:36px; display:grid; place-items:center; border:0; border-radius:50%; cursor:pointer; color:var(--c-text); font:20px/1 var(--font-sans); ' +
      'background:rgba(242,239,237,.25); backdrop-filter:blur(28px) saturate(1.1); -webkit-backdrop-filter:blur(28px) saturate(1.1); ' +
      'box-shadow:0 6px 20px rgba(0,0,0,.07), 0 2px 6px rgba(0,0,0,.04), 0 0 0 1px rgba(255,255,255,.30) inset; }',
    '@media (prefers-color-scheme: dark) { .cal-round-btn { background:rgba(35,32,29,.55); box-shadow:0 6px 20px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.18), 0 0 0 1px rgba(255,255,255,.10) inset; } }',
    'html[data-theme="dark"] .cal-round-btn { background:rgba(35,32,29,.55); box-shadow:0 6px 20px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.18), 0 0 0 1px rgba(255,255,255,.10) inset; }',

    '.cal-monthbar { flex:none; display:flex; align-items:center; justify-content:center; gap:14px; padding:6px 18px 10px; }',
    '.cal-monthlabel { min-width:132px; text-align:center; font:500 15px var(--font-sans); }',
    '.cal-nav { width:32px; height:32px; display:grid; place-items:center; border:0; border-radius:50%; background:transparent; color:var(--c-muted); cursor:pointer; }',
    '.cal-nav:active { background:rgba(0,0,0,.05); }',

    '.cal-grid { flex:none; display:grid; grid-template-columns:repeat(7,1fr); gap:2px; padding:0 12px 8px; }',
    '.cal-dow { text-align:center; font:500 11px var(--font-sans); color:var(--c-muted); padding-bottom:4px; }',
    '.cal-cell { position:relative; height:46px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; ' +
      'border:0; border-radius:12px; background:transparent; color:var(--c-text); cursor:pointer; padding:0; }',
    '.cal-cell.empty { pointer-events:none; }',
    '.cal-num { font:500 15px/1 var(--font-sans); }',
    '.cal-cell.today .cal-num { color:#C87050; font-weight:700; }',
    '.cal-cell.sel { background:rgba(0,0,0,.06); }',
    '@media (prefers-color-scheme: dark) { .cal-cell.sel { background:rgba(255,255,255,.08); } }',
    'html[data-theme="dark"] .cal-cell.sel { background:rgba(255,255,255,.08); }',
    '.cal-dots { display:flex; gap:2px; height:4px; align-items:center; }',
    '.cal-dot { width:4px; height:4px; border-radius:50%; display:block; }',
    '.cal-dot.d-diary { background:#C08060; }',
    '.cal-dot.d-todo { background:#78A880; }',
    '.cal-dot.d-vitals { background:#C87080; }',
    '.cal-dot.d-chat { background:#8098B0; }',

    '.cal-day { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:4px 18px calc(env(safe-area-inset-bottom) + 32px); }',
    '.cal-day-head { display:flex; align-items:center; gap:8px; font:500 15px var(--font-sans); padding:10px 0 2px; }',
    '.cal-today-tag { font:500 11px var(--font-sans); color:#C87050; background:rgba(200,112,80,.10); padding:2px 8px; border-radius:999px; }',
    '.cal-sec { margin-top:16px; }',
    '.cal-sec-title { margin:0 0 8px; font:500 12px var(--font-sans); letter-spacing:.06em; color:var(--c-muted); }',
    '.cal-empty { padding:22px 0; text-align:center; color:var(--c-muted); font:14px var(--font-sans); }',
    '.cal-empty.small { padding:12px 14px; text-align:left; font-size:13px; background:var(--c-card); border-radius:12px; }',

    '.cal-vitals { display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr)); gap:8px; }',
    '.cal-vital { padding:10px 12px; background:var(--c-card); border-radius:12px; }',
    '.cal-vital-label { display:block; font:12px var(--font-sans); color:var(--c-muted); }',
    '.cal-vital-value { display:block; margin-top:2px; font:600 20px/1.2 var(--font-sans); }',
    '.cal-vital-value i { margin-left:3px; font:400 11px var(--font-sans); color:var(--c-muted); font-style:normal; }',
    '.cal-vital-sub { display:block; margin-top:2px; font:11px var(--font-sans); color:var(--c-muted); }',

    '.cal-item { display:flex; align-items:center; gap:8px; padding:10px 12px; margin-bottom:6px; background:var(--c-card); border-radius:12px; }',
    '.cal-item-who { flex:none; font:500 11px var(--font-sans); color:var(--c-muted); }',
    '.cal-item-body { flex:1; min-width:0; font:14px var(--font-sans); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
    '.cal-item-body.done { color:var(--c-muted); text-decoration:line-through; }',
    '.cal-item-tag { flex:none; font:11px var(--font-sans); color:var(--c-muted); }',
    '.cal-check { flex:none; width:14px; height:14px; border-radius:4px; box-shadow:0 0 0 1.5px var(--c-line) inset; }',
    '.cal-check.on { background:#78A880; box-shadow:none; }',
    '.cal-chatline { padding:12px 14px; background:var(--c-card); border-radius:12px; font:14px var(--font-sans); color:var(--c-muted); }',
    '.cal-chatline b { color:var(--c-text); font-weight:600; }'
  ].join('\n');
  var st = document.createElement('style');
  st.id = 'calendarStyles';
  st.textContent = css;
  document.head.appendChild(st);
}

/* ══════════════════════════════════════════════════════════════════
   抽屉里日期旁边的天气
   ⚠️ 只在这儿画。**绝不往他的上下文里塞** —— 一旦写进提示词，
      那行字就跟着对话去 Anthropic 了。要给他看的话只送天气+温度，
      不带地名不带坐标（她 08-24 的原话是「我怕你爸」）。
   ⚠️ 前端不直连 open-meteo，走自己后端的 /api/weather。
   ══════════════════════════════════════════════════════════════════ */
var _WEATHER_ICONS = {
  sun:   '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  'cloud-sun': '<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.8v1.6M2.8 8.5h1.6M4.5 4.5l1.1 1.1M12.4 4.5l-1.1 1.1"/><path d="M17 19H8.6a3.6 3.6 0 010-7.2 5 5 0 019.4 1.3A3 3 0 0117 19z"/>',
  cloud: '<path d="M17.5 19h-10a4 4 0 010-8 5.5 5.5 0 0110.6 1.5A3.3 3.3 0 0117.5 19z"/>',
  fog:   '<path d="M17.5 15h-10a4 4 0 010-8 5.5 5.5 0 0110.6 1.5A3.3 3.3 0 0117.5 15z"/><path d="M5 19h14M7 22h10"/>',
  drizzle: '<path d="M17.5 15h-10a4 4 0 010-8 5.5 5.5 0 0110.6 1.5A3.3 3.3 0 0117.5 15z"/><path d="M9 18.5v1.5M13 18.5v1.5"/>',
  rain:  '<path d="M17.5 14h-10a4 4 0 010-8 5.5 5.5 0 0110.6 1.5A3.3 3.3 0 0117.5 14z"/><path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
  snow:  '<path d="M17.5 14h-10a4 4 0 010-8 5.5 5.5 0 0110.6 1.5A3.3 3.3 0 0117.5 14z"/><path d="M9 18h.01M12.5 20h.01M16 18h.01"/>',
  storm: '<path d="M17.5 13h-10a4 4 0 010-8 5.5 5.5 0 0110.6 1.5A3.3 3.3 0 0117.5 13z"/><path d="M13 15l-3 4h3l-1.5 4"/>'
};

// 位置来源，按顺序试：
//   1) 她手动设过的城市坐标（localStorage，纯本地，服务器上没有）
//   2) 浏览器定位（问一次，答应了就缓存 12 小时，不会天天弹）
// 两条都拿不到就整块不显示 —— 宁可没有，也不要在她界面上放一句报错。
async function _getWeatherCoords() {
  try {
    var fixed = localStorage.getItem('weather_fixed');
    if (fixed) { var f = JSON.parse(fixed); if (f && isFinite(f.lat) && isFinite(f.lon)) return f; }
  } catch (e) {}
  try {
    var cached = JSON.parse(localStorage.getItem('weather_coords') || 'null');
    if (cached && Date.now() - cached.at < 12 * 3600 * 1000) return cached;
  } catch (e) {}
  if (!navigator.geolocation) return null;
  return new Promise(function (resolve) {
    navigator.geolocation.getCurrentPosition(function (pos) {
      // 存进 localStorage 之前就砍到 2 位小数 —— 精确坐标一秒都不留
      var c = {
        lat: Math.round(pos.coords.latitude * 100) / 100,
        lon: Math.round(pos.coords.longitude * 100) / 100,
        at: Date.now()
      };
      try { localStorage.setItem('weather_coords', JSON.stringify(c)); } catch (e) {}
      resolve(c);
    }, function () { resolve(null); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 3600000 });
  });
}

async function refreshHomeWeather() {
  var el = document.getElementById('homeWeather');
  if (!el) return;
  var c = await _getWeatherCoords();
  if (!c) { el.style.display = 'none'; return; }
  try {
    var r = await api('/api/weather?lat=' + c.lat + '&lon=' + c.lon);
    if (!r.ok) throw new Error('weather ' + r.status);
    var w = await r.json();
    var path = _WEATHER_ICONS[w.icon] || _WEATHER_ICONS.cloud;
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">' + path + '</svg>' +
      '<span>' + _calEsc(w.text) + (w.temp != null ? ' ' + w.temp + '°' : '') + '</span>';
    el.title = (w.hi != null ? w.hi + '° / ' + w.lo + '°' : '') + (w.feels != null ? '　体感 ' + w.feels + '°' : '');
    el.style.display = '';
  } catch (e) {
    el.style.display = 'none';   // 取不到就当没有，别在她眼前挂个失败
  }
}
