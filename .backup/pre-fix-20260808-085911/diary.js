// === Diary — Apple HIG Warm Paper Timeline v1 ===
console.log('[diary] v1 — warm paper emotional timeline');

// ====== Mood Palette — 16 moods, line icons, warm colors ======
var _diaryMoods = [
  { id:'tian',      label:'甜',   color:'#C08060', bg:'#FDF3EC', icon:'tian' },
  { id:'xindong',   label:'心动', color:'#C87080', bg:'#FDF1F4', icon:'xindong' },
  { id:'jing',      label:'静',   color:'#7B95A5', bg:'#F1F5F9', icon:'jing' },
  { id:'lie',       label:'烈',   color:'#C05040', bg:'#FDF0EE', icon:'lie' },
  { id:'qidai',     label:'期待', color:'#B09060', bg:'#FDF8F0', icon:'qidai' },
  { id:'lei',       label:'累',   color:'#909AAA', bg:'#F3F4F7', icon:'lei' },
  { id:'nuan',      label:'暖',   color:'#C88840', bg:'#FDF6EC', icon:'nuan' },
  { id:'yu',        label:'雨',   color:'#8098B0', bg:'#F1F5FA', icon:'yu' },
  { id:'fan',       label:'烦',   color:'#A09088', bg:'#F6F3F1', icon:'fan' },
  { id:'huang',     label:'慌',   color:'#B89890', bg:'#F8F3F1', icon:'huang' },
  { id:'weiqu',     label:'委屈', color:'#B890A0', bg:'#F8F2F5', icon:'weiqu' },
  { id:'suan',      label:'酸',   color:'#B8A060', bg:'#F9F6EC', icon:'suan' },
  { id:'shuang',    label:'爽',   color:'#78A880', bg:'#F1F7F2', icon:'shuang' },
  { id:'le',        label:'乐',   color:'#C89050', bg:'#FDF6EE', icon:'le' },
  { id:'kewang',    label:'渴望', color:'#9880B0', bg:'#F5F2F9', icon:'kewang' },
  { id:'men',       label:'闷',   color:'#9098A5', bg:'#F2F4F7', icon:'men' }
];
function _moodById(id) { for (var i=0;i<_diaryMoods.length;i++){ if(_diaryMoods[i].id===id)return _diaryMoods[i]; } return null; }
function _moodIcon(icon) {
  var s='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
  switch(icon) {
    case 'tian':    return s+'<circle cx="12" cy="14" r="2" fill="currentColor" stroke="none"/><path d="M8 8c1-2 3-3 4-3s3 1 4 3"/></svg>';
    case 'xindong': return s+'<path d="M12 20c-3-2.5-8-5.5-8-10 0-2.5 2-4 4-4 1.5 0 3 .8 4 2 1-1.2 2.5-2 4-2 2 0 4 1.5 4 4 0 4.5-5 7.5-8 10z"/></svg>';
    case 'jing':    return s+'<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></svg>';
    case 'lie':     return s+'<path d="M12 2l2 9h7l-6 4.5 2.5 9L12 20l-5.5 4.5L9 15.5 3 11h7z"/></svg>';
    case 'qidai':   return s+'<circle cx="12" cy="12" r="8"/><path d="M12 6v6l4 2"/></svg>';
    case 'lei':     return s+'<path d="M20 12c0 5-3.5 8-8 8s-8-3-8-8c0-3 2-7 8-7s8 4 8 7z"/><path d="M8 11h3"/><path d="M13 11h3"/></svg>';
    case 'nuan':    return s+'<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1"/></svg>';
    case 'yu':      return s+'<path d="M10 4c-3 2-6 5-6 9 0 4 3.5 7 8 7s8-3 8-7c0-4-3-7-6-9"/><path d="M12 15v4"/><circle cx="12" cy="15" r=".8" fill="currentColor" stroke="none"/></svg>';
    case 'fan':     return s+'<path d="M4 4l16 16M8 6c2-2 6-2 8 0"/><path d="M6 8c-2 2-2 6 0 8"/></svg>';
    case 'huang':   return s+'<path d="M6 8c1-2 2.5-3 4-3"/><path d="M10 5c1 0 2 .5 3 2"/><path d="M13 7c1 1 1.5 2.5 1 5"/><path d="M8 13c-.5 2 0 4 1 5"/></svg>';
    case 'weiqu':   return s+'<circle cx="12" cy="12" r="8"/><path d="M9 17c.5-1.5 1.5-2.5 3-2.5"/><path d="M9 9l.01.01"/><path d="M15 9l.01.01"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/></svg>';
    case 'suan':    return s+'<circle cx="12" cy="12" r="8"/><path d="M8 8c0-2 2-3 3-3"/><path d="M16 8c0-2-2-3-3-3"/></svg>';
    case 'shuang':  return s+'<path d="M18 8c1 2 1 5 0 8-1 2-3 3-5 3"/><path d="M6 8c-1 2-1 5 0 8 1 2 3 3 5 3"/><path d="M12 3v4"/></svg>';
    case 'le':      return s+'<circle cx="12" cy="12" r="8"/><path d="M8 14c1.5 2 4 2.5 6 1"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/></svg>';
    case 'kewang':  return s+'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 5v-2m0 18v-2"/></svg>';
    case 'men':     return s+'<path d="M6 18c2-4 4-6 6-6s4 2 6 6"/><path d="M7 8c1-1.5 2.5-2.5 5-2.5s4 1 5 2.5"/></svg>';
    default: return '';
  }
}

// ====== State ======
var _diaryEntries = [];
var _diaryMonth = 'all';
var _diaryWeekStart = null;  // Date object — start of visible week
var _diaryView = 'timeline'; // 'timeline' | 'detail'
var _diaryTab = 'overview';   // 'overview' | 'calendar' | 'year' | 'stats'
var _calendarYear = null;
var _calendarMonth = null;   // 0-indexed
var _diaryDetailDate = null;
var _diaryDetailEntry = null;
var _diaryComments = [];
var _editingEntry = null;    // entry being edited in sheet, or {date:today} for new
var _moodPickerSelections = []; // up to 3 mood ids

// ====== Panel Lifecycle ======
function openDiaryPanel() {
  try { closeDrawer(); } catch(e) {}
  var panel = $('diaryPanel');
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  $('diarySearchBar').classList.add('show');
  $('diarySearchInput').value = '';
  $('diarySearchClear').classList.add('hidden');
  _diaryView = 'timeline';
  _diaryDetailDate = null;
  _diaryDetailEntry = null;
  _loadDiaryEntries().then(function() {
    _renderTimelineShell();
    _renderWeekCalendar();
    _renderTimeline();
  });
}
function closeDiaryPanel() {
  $('diaryPanel').classList.remove('show');
  $('diaryPanel').setAttribute('aria-hidden', 'true');
  $('diarySearchBar').classList.remove('show');
}

// ====== Data ======
async function _loadDiaryEntries() {
  try {
    var r = await api('/api/diary');
    if (!r.ok) throw Error();
    var data = await r.json();
    _diaryEntries = (data.entries || []).reverse(); // oldest first for timeline
  } catch(e) { console.error('[diary] load failed', e); }
}

async function _saveEntry(date, fields) {
  try {
    var r = await api('/api/diary', { method:'POST', body: JSON.stringify(Object.assign({ date:date }, fields)) });
    if (!r.ok) {
      if (r.status === 401) { toast('Please configure API in sidebar first'); }
      else { toast('Save failed — ' + r.status); }
      return;
    }
    await _loadDiaryEntries();
    // 确保 shell 存在后再渲染
    if ($('diaryTimelineList')) {
      _renderTimeline();
    } else {
      _renderTimelineShell();
      _renderTimeline();
    }
    _renderWeekCalendar();
    _renderDiaryMonths();
    toast('Saved');
  } catch(e) {
    console.error('[diary] save failed', e);
    toast('Save failed — check connection');
  }
}

async function _deleteEntry(date) {
  if (!confirm('Delete this entry?')) return;
  try {
    await api('/api/diary/' + date, { method:'DELETE' });
    await _loadDiaryEntries();
    if (_diaryView === 'detail') { closeDiaryPanel(); openDiaryPanel(); }
    else { _renderTimeline(); _renderWeekCalendar(); }
  } catch(e) { console.error('[diary] delete failed', e); }
}

// ====== Week Calendar ======
function _renderWeekCalendar() {
  var week = $('diaryWeekCalendar');
  if (!week) return;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Start from Monday of this week
  var dayOfWeek = today.getDay();
  var monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  var daysWithEntries = {};
  _diaryEntries.forEach(function(e) {
    if (e.date) daysWithEntries[e.date] = true;
  });

  var moodsByDay = {};
  _diaryEntries.forEach(function(e) {
    if (e.date && e.mood) {
      if (!moodsByDay[e.date]) moodsByDay[e.date] = [];
      moodsByDay[e.date].push(e.mood);
    }
  });

  var html = '';
  var dayNames = ['M','T','W','T','F','S','S'];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    var ds = _dateStr(d);
    var isToday = ds === _dateStr(today);
    var hasEntry = daysWithEntries[ds];
    var moods = moodsByDay[ds] || [];

    html += '<button class="diary-week-day" data-date="' + ds + '" onclick="_jumpToDate(\'' + ds + '\')">';
    html += '<span class="diary-week-label">' + dayNames[i] + '</span>';
    html += '<span class="diary-week-num' + (isToday ? ' today' : '') + '">' + d.getDate() + '</span>';
    if (moods.length > 0) {
      html += '<span class="diary-week-dots">';
      for (var j = 0; j < Math.min(moods.length, 4); j++) {
        var m = _moodById(moods[j]);
        html += '<span class="diary-week-dot" style="background:' + (m ? m.color : '#CCC') + '"></span>';
      }
      html += '</span>';
    } else if (hasEntry) {
      html += '<span class="diary-week-dots"><span class="diary-week-dot" style="background:#D0C9BD"></span></span>';
    }
    html += '</button>';
  }
  week.innerHTML = html;
}

function _jumpToDate(ds) {
  if (_diaryTab !== 'overview') {
    _diaryTab = 'overview';
    _renderTimelineShell();
    _renderWeekCalendar();
  }
  _diaryMonth = ds.slice(0, 7);
  _renderDiaryMonths();
  _renderTimeline();
  // Scroll to that date's entry
  setTimeout(function() {
    var el = document.querySelector('.diary-date-group[data-date="' + ds + '"]');
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 100);
}

// ====== Timeline Shell (Today header + mood capsule) ======
function _renderTimelineShell() {
  var timeline = $('diaryTimeline');
  var now = new Date();
  var todayStr = _dateStr(now);
  var displayDate = _formatDisplayDate(todayStr);

  // Today's moods — collect all unique moods from today's entries
  var todayMoods = [];
  var todayMoodCount = 0;
  _diaryEntries.forEach(function(e) {
    if (e.date === todayStr && e.mood) { todayMoods.push(e.mood); todayMoodCount++; }
  });
  // Dedupe
  var uniqueMoods = [];
  todayMoods.forEach(function(m) { if (uniqueMoods.indexOf(m) === -1) uniqueMoods.push(m); });

  // Build mood capsule for top right
  var moodCapsule = '';
  if (uniqueMoods.length > 0) {
    var primaryMood = _moodById(uniqueMoods[0]);
    var label = primaryMood ? primaryMood.label : '';
    var countStr = todayMoodCount > 0 ? ' · ' + todayMoodCount : '';
    moodCapsule = '<div class="diary-today-mood" style="background:' + (primaryMood ? primaryMood.bg : '#F2F0ED') + ';color:' + (primaryMood ? primaryMood.color : '#8A8276') + '">' + (primaryMood ? _moodIcon(primaryMood.icon) : '') + '<span>' + label + countStr + '</span></div>';
  }

  timeline.innerHTML =
    // Nav bar — iOS capsule tabs
    '<div class="diary-nav">' +
      '<div class="diary-nav-capsule">' +
        '<button class="diary-nav-tab' + (_diaryTab === 'overview' ? ' active' : '') + '" onclick="_switchDiaryTab(\'overview\')" aria-label="Overview">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
        '</button>' +
        '<button class="diary-nav-tab' + (_diaryTab === 'calendar' ? ' active' : '') + '" onclick="_switchDiaryTab(\'calendar\')" aria-label="Calendar">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '</button>' +
        '<button class="diary-nav-tab' + (_diaryTab === 'year' ? ' active' : '') + '" onclick="_switchDiaryTab(\'year\')" aria-label="Year">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>' +
        '</button>' +
        '<button class="diary-nav-tab' + (_diaryTab === 'stats' ? ' active' : '') + '" onclick="_switchDiaryTab(\'stats\')" aria-label="Mood Stats">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>' +
    // Today header (hidden in calendar/year views)
    (_diaryTab === 'overview' ?
    '<div class="diary-today-header">' +
      '<div class="diary-today-left">' +
        '<h1 class="diary-today-title">TODAY</h1>' +
        '<p class="diary-today-date">' + displayDate + '</p>' +
      '</div>' +
      '<div class="diary-today-right">' + moodCapsule + '</div>' +
    '</div>' +
    '<div class="diary-week-calendar" id="diaryWeekCalendar"></div>'
    : '') +
    '<div class="diary-timeline-list" id="diaryTimelineList"></div>';
}

function _switchDiaryTab(tab) {
  _diaryTab = tab;
  _renderTimelineShell();
  if (tab === 'calendar') {
    var now = new Date();
    _calendarYear = now.getFullYear();
    _calendarMonth = now.getMonth();
    _renderCalendarView();
  } else if (tab === 'overview') {
    _renderWeekCalendar();
    _renderTimeline();
  } else if (tab === 'year') {
    var now = new Date();
    _calendarYear = now.getFullYear();
    _renderYearView();
  } else if (tab === 'stats') {
    _renderStatsView();
  }
}

// ====== Calendar View ======
function _renderCalendarView() {
  var list = $('diaryTimelineList');
  if (!list) return;
  var y = _calendarYear;
  var m = _calendarMonth;
  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  // Build mood map: date -> moods
  var moodMap = {};
  var authorMap = {};
  _diaryEntries.forEach(function(e) {
    if (!e.date) return;
    var key = e.date;
    if (!moodMap[key]) moodMap[key] = [];
    if (e.mood) moodMap[key].push(e.mood);
    if (!authorMap[key]) authorMap[key] = { zhou:0, claude:0 };
    // Count by author — default to zhou for entries without author field
    if (e.author === 'claude') authorMap[key].claude++;
    else authorMap[key].zhou++;
  });

  // Count entries in this month
  var prefix = y + '-' + String(m+1).padStart(2,'0');
  var monthEntries = _diaryEntries.filter(function(e) { return e.date && e.date.slice(0,7) === prefix; });
  var totalEntries = monthEntries.length;
  var zhouCount = 0, claudeCount = 0;
  monthEntries.forEach(function(e) {
    if (e.author === 'claude') claudeCount++;
    else zhouCount++;
  });

  // Build calendar grid
  var firstDay = new Date(y, m, 1).getDay(); // 0=Sun
  var daysInMonth = new Date(y, m+1, 0).getDate();
  var today = new Date();
  var todayStr = _dateStr(today);

  var html = '';
  // Month nav
  html += '<div class="diary-cal-nav">';
  html += '<button class="diary-cal-arrow" onclick="_calPrevMonth()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>';
  html += '<span class="diary-cal-title">' + monthNames[m] + ' ' + y + '</span>';
  html += '<button class="diary-cal-arrow" onclick="_calNextMonth()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>';
  html += '</div>';

  // Grid header
  html += '<div class="diary-cal-grid">';
  var dayHeaders = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  dayHeaders.forEach(function(dh) {
    html += '<span class="diary-cal-dow">' + dh + '</span>';
  });

  // Empty cells before first day
  for (var i = 0; i < firstDay; i++) {
    html += '<span class="diary-cal-cell empty"></span>';
  }

  // Day cells
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var isToday = ds === todayStr;
    var moods = moodMap[ds] || [];
    var authors = authorMap[ds] || { zhou:0, claude:0 };

    html += '<span class="diary-cal-cell' + (isToday ? ' today' : '') + '" onclick="_jumpToDate(\'' + ds + '\')">';
    html += '<span class="diary-cal-num">' + d + '</span>';
    // Mood dots
    if (moods.length > 0) {
      html += '<span class="diary-cal-dots">';
      var shown = 0;
      var seenMoods = {};
      for (var j = 0; j < moods.length && shown < 3; j++) {
        if (seenMoods[moods[j]]) continue;
        seenMoods[moods[j]] = true;
        var mi = _moodById(moods[j]);
        html += '<span class="diary-cal-dot" style="background:' + (mi ? mi.color : '#CCC') + '"></span>';
        shown++;
      }
      html += '</span>';
    }
    html += '</span>';
  }
  html += '</div>';

  // Month overview
  html += '<div class="diary-cal-overview">';
  html += '<h3 class="diary-cal-overview-title">本月概览</h3>';
  html += '<div class="diary-cal-total">' + totalEntries + '</div>';
  html += '<p class="diary-cal-total-label">日记总数</p>';
  html += '<div class="diary-cal-authors">';
  html += '<div class="diary-cal-author"><span class="diary-cal-author-dot" style="background:#D08080"></span><span class="diary-cal-author-name">粥粥</span><span class="diary-cal-author-count">· ' + zhouCount + '</span></div>';
  html += '<div class="diary-cal-author"><span class="diary-cal-author-dot" style="background:#6B8FB0"></span><span class="diary-cal-author-name">Claude</span><span class="diary-cal-author-count">· ' + claudeCount + '</span></div>';
  html += '</div>';
  html += '</div>';

  list.innerHTML = html;
}

function _calPrevMonth() {
  if (_calendarMonth === 0) { _calendarMonth = 11; _calendarYear--; }
  else _calendarMonth--;
  _renderCalendarView();
}
function _calNextMonth() {
  if (_calendarMonth === 11) { _calendarMonth = 0; _calendarYear++; }
  else _calendarMonth++;
  _renderCalendarView();
}

// ====== Year View ======
function _renderYearView() {
  var list = $('diaryTimelineList');
  if (!list) return;
  var y = _calendarYear;
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Total entries for the year
  var prefix = y + '-';
  var yearEntries = _diaryEntries.filter(function(e) { return e.date && e.date.slice(0,4) === String(y); });
  var totalYear = yearEntries.length;

  // Group moods by month
  var monthMoods = [];
  for (var m = 0; m < 12; m++) {
    var mp = y + '-' + String(m+1).padStart(2,'0');
    var moods = [];
    _diaryEntries.forEach(function(e) {
      if (e.date && e.date.slice(0,7) === mp && e.mood) moods.push(e.mood);
    });
    // Also count entries without mood as gray
    var entryCount = _diaryEntries.filter(function(e) { return e.date && e.date.slice(0,7) === mp; }).length;
    monthMoods.push({ moods:moods, count:entryCount });
  }

  var html = '';
  // Year nav
  html += '<div class="diary-cal-nav">';
  html += '<button class="diary-cal-arrow" onclick="_yrPrevYear()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>';
  html += '<span class="diary-year-num">' + y + '</span>';
  html += '<button class="diary-cal-arrow" onclick="_yrNextYear()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>';
  html += '</div>';

  // Total count
  html += '<div class="diary-year-total">' + totalYear + ' 篇</div>';

  // Month blocks
  html += '<div class="diary-year-grid">';
  for (var m = 0; m < 12; m++) {
    var moods = monthMoods[m].moods;
    var count = monthMoods[m].count;
    html += '<div class="diary-year-month">';
    html += '<span class="diary-year-month-label">' + monthNames[m] + '</span>';
    html += '<div class="diary-year-blocks">';
    // Show mood blocks
    var maxBlocks = Math.min(moods.length, 20);
    if (maxBlocks === 0 && count > 0) {
      var emptyCount = Math.min(count, 5);
      for (var j = 0; j < emptyCount; j++) {
        html += '<span class="diary-year-block" style="background:#E5DFD4"></span>';
      }
    }
    for (var i = 0; i < maxBlocks; i++) {
      var mi = _moodById(moods[i]);
      html += '<span class="diary-year-block" style="background:' + (mi ? mi.color : '#CCC') + '"></span>';
    }
    if (moods.length > 20) {
      html += '<span class="diary-year-block-more">+' + (moods.length - 20) + '</span>';
    }
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';

  list.innerHTML = html;
}

function _yrPrevYear() { _calendarYear--; _renderYearView(); }
function _yrNextYear() { _calendarYear++; _renderYearView(); }

// ====== Mood Statistics View ======
var _statsPerson = 'zhou'; // 'zhou' | 'claude'

function _renderStatsView() {
  var list = $('diaryTimelineList');
  if (!list) return;

  // Filter entries by person
  var personEntries = _diaryEntries.filter(function(e) {
    if (_statsPerson === 'claude') return e.author === 'claude';
    return e.author !== 'claude'; // zhou + unset
  });

  // Calculate mood frequencies
  var moodFreq = {};
  var totalMoodEntries = 0;
  personEntries.forEach(function(e) {
    if (e.mood) {
      moodFreq[e.mood] = (moodFreq[e.mood] || 0) + 1;
      totalMoodEntries++;
    }
  });

  // Sort by frequency
  var moodList = [];
  for (var mid in moodFreq) {
    var m = _moodById(mid);
    moodList.push({ id: mid, label: m ? m.label : mid, color: m ? m.color : '#CCC', bg: m ? m.bg : '#F2F0ED', count: moodFreq[mid] });
  }
  moodList.sort(function(a, b) { return b.count - a.count; });

  // This week's dominant mood
  var now = new Date();
  var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var weekMoods = {};
  personEntries.forEach(function(e) {
    if (!e.mood || !e.date) return;
    var d = new Date(e.date + 'T00:00:00');
    if (d >= weekAgo) {
      weekMoods[e.mood] = (weekMoods[e.mood] || 0) + 1;
    }
  });
  var dominantMood = null, dominantCount = 0;
  for (var mid in weekMoods) {
    if (weekMoods[mid] > dominantCount) { dominantMood = mid; dominantCount = weekMoods[mid]; }
  }

  // Latest mood entry
  var latestEntry = null;
  for (var i = personEntries.length - 1; i >= 0; i--) {
    if (personEntries[i].mood && personEntries[i].content) { latestEntry = personEntries[i]; break; }
  }

  var html = '';

  // Header
  html += '<div class="diary-stats-header">';
  html += '<span class="diary-stats-title">Mood Statistics</span>';
  html += '</div>';

  // Segmented control
  html += '<div class="diary-stats-seg-wrap">';
  html += '<div class="diary-stats-seg">';
  html += '<button class="diary-stats-seg-btn' + (_statsPerson === 'zhou' ? ' active' : '') + '" onclick="_switchStatsPerson(\'zhou\')">粥粥</button>';
  html += '<button class="diary-stats-seg-btn' + (_statsPerson === 'claude' ? ' active' : '') + '" onclick="_switchStatsPerson(\'claude\')">Claude</button>';
  html += '</div>';
  html += '</div>';

  // Emotional cloud — colors from real mood data
  var cloudColors = [];
  for (var i = 0; i < Math.min(moodList.length, 4); i++) {
    cloudColors.push(moodList[i].color);
  }
  // Fill with soft pastels if not enough moods
  while (cloudColors.length < 4) {
    var fallbacks = ['#E8B496','#DAAAB4','#96B9D2','#DCC8A0'];
    cloudColors.push(fallbacks[cloudColors.length]);
  }
  var gradStops = [
    'circle at 30% 40%, ' + cloudColors[0] + '99',
    cloudColors[1] + '88 30%',
    cloudColors[2] + '80 60%',
    cloudColors[3] + '70 80%'
  ];
  if (cloudColors.length > 4) gradStops.push(cloudColors[4] + '60 100%');
  html += '<div class="diary-stats-cloud">';
  html += '<div class="diary-stats-cloud-inner" style="background:radial-gradient(' + gradStops.join(', ') + ')"></div>';
  html += '</div>';

  // Summary card
  if (dominantMood) {
    var dm = _moodById(dominantMood);
    var desc = dominantCount >= 5 ? 'A week full of feeling' : (dominantCount >= 2 ? 'Gentle days' : 'A quiet week');
    html += '<div class="diary-stats-summary">';
    html += '<div class="diary-stats-summary-left">';
    if (dm) html += '<span class="diary-stats-summary-icon">' + _moodIcon(dm.icon) + '</span>';
    html += '<div><span class="diary-stats-summary-label">This week</span><span class="diary-stats-summary-mood" style="color:' + (dm ? dm.color : '#999') + '">' + (dm ? dm.label : '—') + '</span></div>';
    html += '</div>';
    html += '<div class="diary-stats-summary-right"><span class="diary-stats-summary-desc">' + desc + '</span><span class="diary-stats-summary-count">' + dominantCount + ' times</span></div>';
    html += '</div>';
  }

  // Mood distribution
  html += '<div class="diary-stats-section">';
  html += '<h3 class="diary-stats-section-title">Total ' + totalMoodEntries + ' entries · Mood frequency</h3>';

  moodList.forEach(function(m) {
    var pct = totalMoodEntries > 0 ? Math.round(m.count / totalMoodEntries * 100) : 0;
    // Find latest entry for this mood
    var latestForMood = null;
    for (var i = personEntries.length - 1; i >= 0; i--) {
      if (personEntries[i].mood === m.id && personEntries[i].content) { latestForMood = personEntries[i]; break; }
    }

    html += '<div class="diary-stats-mood-row">';
    html += '<div class="diary-stats-mood-info">';
    html += '<span class="diary-stats-mood-icon" style="color:' + m.color + '">' + _moodIcon(m.id) + '</span>';
    html += '<span class="diary-stats-mood-name">' + m.label + '</span>';
    html += '<span class="diary-stats-mood-count">' + m.count + ' times</span>';
    html += '<span class="diary-stats-mood-pct">' + pct + '%</span>';
    html += '</div>';
    html += '<div class="diary-stats-bar-wrap"><div class="diary-stats-bar" style="width:' + pct + '%;background:' + m.color + '"></div></div>';
    if (latestForMood) {
      var previewText = latestForMood.content.replace(/[#*`\n]/g, ' ').trim().slice(0, 80);
      var previewDate = latestForMood.date;
      var previewDateFormatted = '';
      try {
        var pp = previewDate.split('-');
        previewDateFormatted = pp[1] + '/' + pp[2];
      } catch(e) {}
      html += '<p class="diary-stats-memory">Last time · ' + previewDateFormatted + '<br>"' + escHtml(previewText) + (previewText.length >= 80 ? '…' : '') + '"</p>';
    }
    html += '</div>';
  });
  html += '</div>';

  if (totalMoodEntries === 0) {
    html = html.split('<div class="diary-stats-section">')[0] + '<div class="diary-empty" style="padding:60px 24px"><p style="color:var(--d-muted)">No mood entries yet</p></div>';
  }

  list.innerHTML = html;
}

function _switchStatsPerson(person) {
  _statsPerson = person;
  _renderStatsView();
}

// ====== Timeline Rendering ======
function _renderTimeline() {
  var list = $('diaryTimelineList');
  if (!list) return;
  var q = ($('diarySearchInput')?.value || '').trim().toLowerCase();
  var items = _diaryEntries;
  if (_diaryMonth !== 'all') items = items.filter(function(e) { return e.date && e.date.slice(0,7) === _diaryMonth; });
  if (q) items = items.filter(function(e) { return (e.content||'').toLowerCase().indexOf(q) !== -1 || (e.title||'').toLowerCase().indexOf(q) !== -1; });

  if (!items.length) {
    list.innerHTML = '<div class="diary-empty">' + (q ? 'No matching entries' : '<div style="font:400 48px/1 var(--font-serif);color:#D0C9BD;margin-bottom:12px">—</div><p style="color:#A0988B">Your shared timeline begins here</p>') + '</div>';
    return;
  }

  // Group by date
  var groups = [];
  var currentDate = '';
  items.forEach(function(e) {
    if (e.date !== currentDate) { groups.push({ date:e.date, entries:[] }); currentDate = e.date; }
    groups[groups.length-1].entries.push(e);
  });

  var html = '';
  groups.forEach(function(g, gi) {
    var isLastGroup = gi === groups.length - 1;
    html += '<div class="diary-date-group" data-date="' + g.date + '">';
    // Date header
    html += '<div class="diary-date-marker">';
    html += '<span class="diary-timeline-dot"></span>';
    html += '<span class="diary-date-label">' + _formatDisplayDate(g.date) + '</span>';
    if (!isLastGroup) html += '<span class="diary-timeline-line"></span>';
    html += '</div>';
    // Cards
    html += '<div class="diary-date-cards">';
    g.entries.forEach(function(entry, ei) {
      html += _renderEntryCard(entry, ei === 0, ei === g.entries.length - 1);
    });
    html += '</div>';
    html += '</div>';
  });
  list.innerHTML = html;
}

function _renderEntryCard(entry, isFirst, isLast) {
  var mood = _moodById(entry.mood);
  var locked = entry.locked === 1 || entry.locked === true;
  var commentCount = entry.comment_count || 0;
  var body = entry.content || '';
  // Strip markdown for preview
  var preview = body.replace(/[#*`>\-\[\]!]/g, '').trim();
  var lines = preview.split('\n').filter(function(l) { return l.trim(); });
  var maxLines = 4;
  var displayText = '';
  var lineCount = 0;
  for (var i = 0; i < lines.length && lineCount < maxLines; i++) {
    if (lineCount > 0) displayText += ' ';
    displayText += lines[i];
    lineCount++;
  }
  if (lines.length > maxLines) displayText += '…';

  var cardClass = 'diary-card';
  if (locked) cardClass += ' locked';

  var html = '<div class="' + cardClass + '" onclick="_openDetail(\'' + entry.date + '\')">';

  // Top row: mood + lock + comment count
  html += '<div class="diary-card-top">';
  if (mood) {
    html += '<span class="diary-card-mood" style="background:' + mood.bg + ';color:' + mood.color + '">' + _moodIcon(mood.icon) + '<span>' + mood.label + '</span></span>';
  }
  if (locked) {
    html += '<span class="diary-card-lock" title="Locked until ' + (entry.unlock_date || 'forever') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1"/></svg></span>';
  }
  html += '<span class="diary-card-spacer"></span>';
  if (commentCount > 0) {
    html += '<span class="diary-card-comments"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> ' + commentCount + '</span>';
  }
  if (entry.unlock_date) {
    html += '<span class="diary-card-unlock-countdown">' + _countdown(entry.unlock_date) + '</span>';
  }
  html += '</div>';

  // Title
  if (entry.title) {
    html += '<h3 class="diary-card-title">' + escHtml(entry.title) + '</h3>';
  }

  // Body
  if (locked) {
    html += '<div class="diary-locked-body">';
    html += '<div class="diary-locked-pattern"></div>';
    html += '<div class="diary-locked-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>';
    if (entry.unlock_date) {
      html += '<p class="diary-unlock-date">Unlocks ' + _formatDisplayDate(entry.unlock_date) + '</p>';
    } else {
      html += '<p class="diary-unlock-date">Private entry</p>';
    }
    html += '</div>';
  } else {
    html += '<p class="diary-card-body">' + escHtml(displayText || '(empty)') + '</p>';
  }

  html += '</div>';
  return html;
}

// ====== Detail View ======
function _openDetail(date) {
  var entry = null;
  for (var i = 0; i < _diaryEntries.length; i++) {
    if (_diaryEntries[i].date === date) { entry = _diaryEntries[i]; break; }
  }
  if (!entry) return;
  if (entry.locked === 1 || entry.locked === true) {
    // Locked entries: tap to reveal inline
    _unlockEntry(date);
    return;
  }
  _diaryView = 'detail';
  _diaryDetailDate = date;
  _diaryDetailEntry = entry;
  _loadComments(date).then(function() { _renderDetail(); });
}

async function _unlockEntry(date) {
  // Client-side reveal — ask for confirmation first
  if (!confirm('This entry is private. View it?')) return;
  // Temporarily unlock in UI only
  for (var i = 0; i < _diaryEntries.length; i++) {
    if (_diaryEntries[i].date === date) {
      _diaryEntries[i]._unlocked = true;
      break;
    }
  }
  _renderTimeline();
}

async function _loadComments(date) {
  try {
    var r = await api('/api/diary/' + date + '/comments');
    if (!r.ok) { _diaryComments = []; return; }
    var data = await r.json();
    _diaryComments = data.comments || [];
  } catch(e) { _diaryComments = []; }
}

function _renderDetail() {
  var entry = _diaryDetailEntry;
  if (!entry) return;
  var mood = _moodById(entry.mood);
  var timeline = $('diaryTimeline');
  var bodyHtml = (entry.content || '(empty)').split('\n').filter(function(l){return l.trim();}).map(function(l){ return '<p style="margin:0 0 .8em">'+escHtml(l)+'</p>'; }).join('');

  var html = '';
  // Back button
  html += '<button class="diary-back-btn" onclick="_backToTimeline()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg> Back</button>';

  // Date & mood
  html += '<div class="diary-detail-header">';
  html += '<h2 class="diary-detail-date">' + _formatDisplayDate(entry.date) + '</h2>';
  if (entry.title) html += '<h1 class="diary-detail-title">' + escHtml(entry.title) + '</h1>';
  if (mood) {
    html += '<span class="diary-card-mood" style="background:' + mood.bg + ';color:' + mood.color + ';font-size:15px;padding:8px 14px">' + _moodIcon(mood.icon) + '<span>' + mood.label + '</span></span>';
  }
  html += '</div>';

  // Body — large typography, generous spacing
  html += '<div class="diary-detail-body">' + bodyHtml + '</div>';

  // Actions
  html += '<div class="diary-detail-actions">';
  html += '<button class="diary-action-btn" onclick="_openEditSheet(\'' + entry.date + '\')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit</button>';
  html += '<button class="diary-action-btn danger" onclick="_deleteEntry(\'' + entry.date + '\')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> Delete</button>';
  html += '</div>';

  // Divider
  html += '<div class="diary-detail-divider"></div>';

  // Comments section
  html += '<div class="diary-comments-section">';
  html += '<h3 class="diary-comments-title">Thoughts</h3>';
  if (_diaryComments.length === 0) {
    html += '<p class="diary-comments-empty">No thoughts yet. Be the first.</p>';
  } else {
    _diaryComments.forEach(function(c) {
      html += _renderCommentCard(c);
    });
  }
  html += '</div>';

  // Comment input
  html += '<div class="diary-comment-input-wrap" id="diaryCommentInputWrap">';
  html += '<input class="diary-comment-input" id="diaryCommentInput" type="text" placeholder="Share your thoughts…" autocomplete="off" oninput="_onCommentInput()">';
  html += '<button class="diary-comment-send hidden" id="diaryCommentSend" onclick="_sendComment()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>';
  html += '</div>';

  timeline.innerHTML = html;
  // Scroll to top
  timeline.scrollTop = 0;
}

function _renderCommentCard(c) {
  var t = new Date(c.created_at * 1000);
  var timeStr = _timeAgo(t);
  var avatarHtml = c.avatar ?
    '<span class="diary-comment-avatar"><img src="' + escHtml(c.avatar) + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover"></span>' :
    '<span class="diary-comment-avatar" style="background:#E8E3D8;color:#8A8276;display:grid;place-items:center;font-size:14px;font-weight:600">' + (c.author||'Z')[0].toUpperCase() + '</span>';

  return '' +
    '<div class="diary-comment-card">' +
      avatarHtml +
      '<div class="diary-comment-body">' +
        '<div class="diary-comment-meta"><span class="diary-comment-author">' + escHtml(c.author || 'zhou') + '</span><span class="diary-comment-time">' + timeStr + '</span></div>' +
        '<p class="diary-comment-text">' + escHtml(c.content) + '</p>' +
      '</div>' +
    '</div>';
}

function _backToTimeline() {
  _diaryView = 'timeline';
  _diaryDetailDate = null;
  _diaryDetailEntry = null;
  _diaryComments = [];
  _renderTimelineShell();
  _renderWeekCalendar();
  _renderTimeline();
}

function _onCommentInput() {
  var v = $('diaryCommentInput').value.trim();
  $('diaryCommentSend').classList.toggle('hidden', !v);
}

async function _sendComment() {
  var input = $('diaryCommentInput');
  var content = input.value.trim();
  if (!content) return;
  try {
    var r = await api('/api/diary/' + _diaryDetailDate + '/comments', {
      method:'POST',
      body: JSON.stringify({ author:'zhou', content:content })
    });
    if (!r.ok) throw Error();
    input.value = '';
    $('diaryCommentSend').classList.add('hidden');
    await _loadComments(_diaryDetailDate);
    _renderDetail();
    // Scroll to bottom of comments
    setTimeout(function() {
      var section = document.querySelector('.diary-comments-section');
      if (section) section.scrollIntoView({ behavior:'smooth', block:'end' });
    }, 100);
  } catch(e) { console.error('[diary] comment failed', e); }
}

// ====== Edit / New Entry Sheet ======
function _openEditSheet(date) {
  _editingEntry = null;
  _moodPickerSelections = [];
  for (var i = 0; i < _diaryEntries.length; i++) {
    if (_diaryEntries[i].date === date) {
      _editingEntry = Object.assign({}, _diaryEntries[i]);
      if (_editingEntry.mood) _moodPickerSelections = [_editingEntry.mood];
      break;
    }
  }
  if (!_editingEntry) _editingEntry = { date: date, title:'', content:'', mood:'', locked:0, unlock_date:'' };
  _renderEditSheet();
}

function _openNewEntrySheet() {
  var today = _dateStr(new Date());
  _editingEntry = { date: today, title:'', content:'', mood:'', locked:0, unlock_date:'' };
  _moodPickerSelections = [];
  _renderEditSheet();
}

function _renderEditSheet() {
  var existing = document.getElementById('diaryEditSheet');
  if (existing) existing.remove();

  var entry = _editingEntry;
  var isNew = !entry.content && !entry.title;
  var mood = _moodById(entry.mood);

  var sheet = document.createElement('div');
  sheet.id = 'diaryEditSheet';
  sheet.className = 'diary-edit-sheet';
  sheet.innerHTML =
    '<div class="diary-edit-overlay" onclick="_closeEditSheet()"></div>' +
    '<div class="diary-edit-panel">' +
      '<div class="diary-edit-handle"></div>' +
      '<div class="diary-edit-head">' +
        '<button class="diary-edit-cancel" onclick="_closeEditSheet()">Cancel</button>' +
        '<span class="diary-edit-date-sm">' + _formatDisplayDate(entry.date) + '</span>' +
        '<button class="diary-edit-save" onclick="_saveEditSheet()">Save</button>' +
      '</div>' +
      '<div class="diary-edit-scroll">' +
        '<input class="diary-edit-title" id="diaryEditTitle" type="text" placeholder="Title (optional)" value="' + escHtml(entry.title || '') + '" autocomplete="off">' +
        // Mood picker
        '<div class="diary-mood-picker" id="diaryMoodPicker">' + _renderMoodPickerHTML() + '</div>' +
        // Content
        '<textarea class="diary-edit-content" id="diaryEditContent" placeholder="What happened today…">' + escHtml(entry.content || '') + '</textarea>' +
        // Lock toggle
        '<div class="diary-edit-lock-row">' +
          '<span class="diary-edit-lock-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Private entry</span>' +
          '<button class="diary-lock-toggle' + (entry.locked ? ' on' : '') + '" id="diaryLockToggle" onclick="_toggleLock()"></button>' +
        '</div>' +
        (entry.locked ? '<div class="diary-edit-unlock-row"><label>Unlock date</label><input class="diary-edit-unlock-input" id="diaryEditUnlockDate" type="date" value="' + (entry.unlock_date || '') + '"></div>' : '') +
      '</div>' +
    '</div>';

  document.body.appendChild(sheet);
  // Animate in
  requestAnimationFrame(function() {
    sheet.classList.add('show');
  });
  // Focus content
  setTimeout(function() {
    var ta = $('diaryEditContent');
    if (ta) ta.focus();
  }, 300);
}

function _renderMoodPickerHTML() {
  var html = '<p class="diary-mood-picker-label">How are you feeling?</p><div class="diary-mood-grid">';
  _diaryMoods.forEach(function(m, idx) {
    var selIdx = _moodPickerSelections.indexOf(m.id);
    var selected = selIdx !== -1;
    html += '<button class="diary-mood-tile' + (selected ? ' selected' : '') + '" onclick="_toggleMood(\'' + m.id + '\')" style="' + (selected ? 'border-color:' + m.color + ';background:' + m.bg : '') + '">';
    if (selected && _moodPickerSelections.length > 1) {
      html += '<span class="diary-mood-order" style="background:' + m.color + '">' + (selIdx + 1) + '</span>';
    }
    html += '<span class="diary-mood-tile-icon" style="color:' + m.color + '">' + _moodIcon(m.icon) + '</span>';
    html += '<span class="diary-mood-tile-label">' + m.label + '</span>';
    html += '</button>';
  });
  html += '</div>';
  return html;
}

function _toggleMood(id) {
  var idx = _moodPickerSelections.indexOf(id);
  if (idx !== -1) {
    _moodPickerSelections.splice(idx, 1);
  } else {
    if (_moodPickerSelections.length >= 3) _moodPickerSelections.shift();
    _moodPickerSelections.push(id);
  }
  // Refresh mood picker
  var picker = $('diaryMoodPicker');
  if (picker) picker.innerHTML = _renderMoodPickerHTML();
}

function _toggleLock() {
  _editingEntry.locked = _editingEntry.locked ? 0 : 1;
  _renderEditSheet();
}

function _closeEditSheet() {
  var sheet = document.getElementById('diaryEditSheet');
  if (!sheet) return;
  sheet.classList.remove('show');
  setTimeout(function() { sheet.remove(); }, 250);
  _editingEntry = null;
  _moodPickerSelections = [];
}

async function _saveEditSheet() {
  var entry = _editingEntry;
  if (!entry) return;
  entry.title = ($('diaryEditTitle')?.value || '').trim();
  entry.content = ($('diaryEditContent')?.value || '').trim();
  entry.mood = _moodPickerSelections.length > 0 ? _moodPickerSelections[0] : '';
  if ($('diaryEditUnlockDate')) entry.unlock_date = $('diaryEditUnlockDate').value;

  await _saveEntry(entry.date, {
    title: entry.title,
    content: entry.content,
    mood: entry.mood,
    locked: entry.locked,
    unlock_date: entry.unlock_date
  });

  _closeEditSheet();
  if (_diaryView === 'detail') {
    // Refresh detail
    _diaryDetailEntry = null;
    _openDetail(entry.date);
  }
}

// ====== Months Filter ======
function _renderDiaryMonths() {
  var el = $('diaryMonths');
  if (!el) return;
  var months = {};
  _diaryEntries.forEach(function(e) { if (e.date) months[e.date.slice(0,7)] = true; });
  var sorted = Object.keys(months).sort().reverse();
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var html = '<button class="diary-month-pill' + (_diaryMonth === 'all' ? ' active' : '') + '" onclick="_setDiaryMonth(\'all\')">All</button>';
  sorted.forEach(function(m) {
    var parts = m.split('-');
    html += '<button class="diary-month-pill' + (_diaryMonth === m ? ' active' : '') + '" onclick="_setDiaryMonth(\'' + m + '\')">' + monthNames[parseInt(parts[1])-1] + ' ' + parts[0] + '</button>';
  });
  el.innerHTML = html;
}

function _setDiaryMonth(m) {
  _diaryMonth = m;
  _renderDiaryMonths();
  _renderTimeline();
}

// ====== Helpers ======
function _dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _formatDisplayDate(ds) {
  try {
    var parts = ds.split('-').map(Number);
    var dt = new Date(parts[0], parts[1]-1, parts[2]);
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return days[dt.getDay()] + ', ' + months[dt.getMonth()] + ' ' + parts[2] + ', ' + parts[0];
  } catch(e) { return ds; }
}
function _countdown(ds) {
  if (!ds) return '';
  try {
    var target = new Date(ds + 'T00:00:00');
    var now = new Date();
    var diff = Math.ceil((target - now) / (1000*60*60*24));
    if (diff <= 0) return 'Unlocked';
    if (diff === 1) return '1 day left';
    return diff + ' days left';
  } catch(e) { return ''; }
}
function _timeAgo(t) {
  var diff = Math.floor((Date.now() - t.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
  return t.toLocaleDateString();
}

// ====== Event Binding ======
function _initDiaryEvents() {
  // Mobile sidebar button
  var openBtn = $('openDiary');
  if (openBtn) openBtn.onclick = function() { openDiaryPanel(); };

  // Close button
  var closeBtn = $('closeDiary');
  if (closeBtn) closeBtn.onclick = function() { closeDiaryPanel(); };

  // Search
  var searchInput = $('diarySearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var v = searchInput.value;
      var clear = $('diarySearchClear');
      if (clear) clear.classList.toggle('hidden', !v);
      if (_diaryView === 'timeline') _renderTimeline();
    });
  }
  var searchClear = $('diarySearchClear');
  if (searchClear) {
    searchClear.onclick = function() {
      $('diarySearchInput').value = '';
      searchClear.classList.add('hidden');
      if (_diaryView === 'timeline') _renderTimeline();
    };
  }

  // Search icon
  var searchIcon = document.querySelector('#diarySearchBar .diary-search-icon');
  if (searchIcon) searchIcon.innerHTML = icon ? icon('search') : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

  // Floating add button
  _ensureFab();
}

function _ensureFab() {
  if (document.getElementById('diaryFab')) return;
  var fab = document.createElement('button');
  fab.id = 'diaryFab';
  fab.className = 'diary-fab';
  fab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  fab.onclick = function() { _openNewEntrySheet(); };
  $('diaryPanel').appendChild(fab);
}

// ====== CSS Injection ======
function _initDiaryStyles() {
  if (document.getElementById('diaryStyles')) return;
  var style = document.createElement('style');
  style.id = 'diaryStyles';
  style.textContent = [
    '/* === Diary — Apple HIG Warm Paper === */',
    '#diaryPanel { --d-bg: #F8F7F4; --d-card: #FFFDF9; --d-text: #2C2821; --d-muted: #A0988B; --d-line: #E5DFD4; --d-accent: #2C2821; }',
    '@media (prefers-color-scheme: dark) { #diaryPanel { --d-bg: #1C1A17; --d-card: #25221E; --d-text: #E8E4DB; --d-muted: #8A8276; --d-line: #3A3530; --d-accent: #E8E4DB; } .diary-card { background:#25221E; } .diary-today-header { color:#E8E4DB; } .diary-cal-overview,.diary-year-month,.diary-stats-summary { background:#25221E; } }',
    'html[data-theme="dark"] #diaryPanel { --d-bg: #1C1A17; --d-card: #25221E; --d-text: #E8E4DB; --d-muted: #8A8276; --d-line: #3A3530; --d-accent: #E8E4DB; } html[data-theme="dark"] .diary-card { background:#25221E; } html[data-theme="dark"] .diary-cal-overview,html[data-theme="dark"] .diary-year-month,html[data-theme="dark"] .diary-stats-summary { background:#25221E; }',

    /* Timeline shell */
    '#diaryTimeline { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:0 0 calc(env(safe-area-inset-bottom) + 80px); }',

    /* Nav bar — iOS capsule */
    '.diary-nav { display:flex; justify-content:center; padding:0 24px 0; position:sticky; top:0; z-index:10; }',
    '.diary-nav-capsule { display:flex; gap:2px; padding:4px; border-radius:999px; background:rgba(0,0,0,.04); }',
    '.diary-nav-tab { width:42px; height:38px; display:grid; place-items:center; border:0; border-radius:999px; background:transparent; color:#A0988B; cursor:pointer; transition:all .2s; }',
    '.diary-nav-tab.active { background:#201F1D; color:#F8F7F4; border-radius:999px; }',
    '.diary-nav-tab svg { width:20px; height:20px; }',
    '@media (prefers-color-scheme: dark) { .diary-nav-capsule { background:rgba(255,255,255,.06); } .diary-nav-tab { color:#8A8276; } .diary-nav-tab.active { background:#E8E4DB; color:#1C1A17; } }',
    'html[data-theme="dark"] .diary-nav-capsule { background:rgba(255,255,255,.06); } html[data-theme="dark"] .diary-nav-tab { color:#8A8276; } html[data-theme="dark"] .diary-nav-tab.active { background:#E8E4DB; color:#1C1A17; }',
    '.diary-today-header { display:flex; align-items:flex-start; justify-content:space-between; padding:32px 24px 0; }',
    '.diary-today-left { flex:1; min-width:0; }',
    '.diary-today-title { font:700 38px/1 var(--font-sans); color:var(--d-text); letter-spacing:-.02em; margin:0; }',
    '.diary-today-date { font:400 15px/1.3 var(--font-sans); color:var(--d-muted); margin:8px 0 0; }',
    '.diary-today-right { flex:none; padding-top:4px; }',
    '.diary-today-mood { display:inline-flex; align-items:center; gap:5px; padding:8px 14px; border-radius:999px; font:500 13px/1 var(--font-sans); white-space:nowrap; }',
    '.diary-today-mood svg { width:16px; height:16px; }',

    /* Week calendar */
    '.diary-week-calendar { display:flex; justify-content:space-between; padding:28px 20px 12px; }',
    '.diary-week-day { flex:1; max-width:48px; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 0; border:0; background:transparent; cursor:pointer; border-radius:12px; transition:background .15s; }',
    '.diary-week-day:active { background:rgba(0,0,0,.04); }',
    '.diary-week-label { font:500 11px/1 var(--font-sans); color:var(--d-muted); text-transform:uppercase; letter-spacing:.04em; }',
    '.diary-week-num { width:34px; height:34px; display:grid; place-items:center; border-radius:50%; font:500 16px/1 var(--font-sans); color:var(--d-text); transition:all .15s; }',
    '.diary-week-num.today { background:var(--d-accent); color:var(--d-bg); font-weight:600; }',
    '.diary-week-dots { display:flex; gap:2px; min-height:8px; }',
    '.diary-week-dot { width:5px; height:5px; border-radius:50%; flex:none; }',

    /* Calendar view */
    '.diary-cal-nav { display:flex; align-items:center; justify-content:center; gap:16px; padding:12px 24px 16px; }',
    '.diary-cal-arrow { width:36px; height:36px; border-radius:50%; border:0; background:transparent; color:var(--d-text); display:grid; place-items:center; cursor:pointer; }',
    '.diary-cal-arrow:active { background:rgba(0,0,0,.05); }',
    '.diary-cal-title { font:600 18px/1 var(--font-sans); color:var(--d-text); min-width:160px; text-align:center; }',
    '.diary-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; padding:0 16px; }',
    '.diary-cal-dow { text-align:center; font:500 11px/1 var(--font-sans); color:var(--d-muted); padding:8px 0 12px; letter-spacing:.04em; }',
    '.diary-cal-cell { display:flex; flex-direction:column; align-items:center; gap:2px; padding:6px 0 8px; border-radius:12px; cursor:pointer; min-height:42px; }',
    '.diary-cal-cell.empty { cursor:default; }',
    '.diary-cal-cell:active { background:rgba(0,0,0,.03); }',
    '.diary-cal-cell.today { background:var(--d-accent); }',
    '.diary-cal-cell.today .diary-cal-num { color:var(--d-bg); font-weight:600; }',
    '.diary-cal-num { font:500 15px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-cal-dots { display:flex; gap:2px; min-height:6px; }',
    '.diary-cal-dot { width:5px; height:5px; border-radius:50%; flex:none; }',
    '.diary-cal-overview { margin:24px 24px; padding:24px; background:var(--d-card); border-radius:20px; }',
    '.diary-cal-overview-title { font:600 14px/1 var(--font-sans); color:var(--d-muted); margin:0 0 16px; }',
    '.diary-cal-total { font:700 48px/1 var(--font-sans); color:var(--d-text); letter-spacing:-.02em; }',
    '.diary-cal-total-label { font:400 14px/1 var(--font-sans); color:var(--d-muted); margin:4px 0 20px; }',
    '.diary-cal-authors { display:flex; gap:28px; }',
    '.diary-cal-author { display:flex; align-items:center; gap:6px; font:500 15px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-cal-author-dot { width:10px; height:10px; border-radius:50%; flex:none; }',
    '.diary-cal-author-name { }',
    '.diary-cal-author-count { color:var(--d-muted); }',

    /* Year view */
    '.diary-year-num { font:700 40px/1 var(--font-sans); color:var(--d-text); letter-spacing:-.02em; min-width:120px; text-align:center; }',
    '.diary-year-total { text-align:center; font:400 16px/1 var(--font-sans); color:var(--d-muted); margin:0 0 24px; }',
    '.diary-year-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; padding:0 20px; }',
    '.diary-year-month { background:var(--d-card); border-radius:20px; padding:16px 14px 18px; display:flex; flex-direction:column; gap:10px; min-height:120px; }',
    '.diary-year-month-label { font:600 15px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-year-blocks { display:flex; flex-wrap:wrap; gap:5px; align-items:center; }',
    '.diary-year-block { width:16px; height:16px; border-radius:4px; flex:none; }',
    '.diary-year-block-more { font:500 12px/1 var(--font-sans); color:var(--d-muted); }',

    /* Stats view */
    '.diary-stats-header { text-align:center; padding:20px 24px 0; }',
    '.diary-stats-title { font:600 18px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-stats-seg-wrap { display:flex; justify-content:center; padding:16px 24px; }',
    '.diary-stats-seg { display:flex; gap:2px; padding:3px; border-radius:999px; background:rgba(0,0,0,.04); }',
    '.diary-stats-seg-btn { padding:8px 20px; border:0; border-radius:999px; font:500 14px/1 var(--font-sans); cursor:pointer; background:transparent; color:var(--d-muted); transition:all .2s; }',
    '.diary-stats-seg-btn.active { background:#FFF; color:var(--d-text); box-shadow:0 1px 4px rgba(0,0,0,.08); }',
    '@media (prefers-color-scheme:dark) { .diary-stats-seg-btn.active { background:#3A3530; color:#E8E4DB; } .diary-stats-seg { background:rgba(255,255,255,.06); } }',
    'html[data-theme="dark"] .diary-stats-seg-btn.active { background:#3A3530; color:#E8E4DB; } html[data-theme="dark"] .diary-stats-seg { background:rgba(255,255,255,.06); }',

    /* Emotional cloud */
    '.diary-stats-cloud { display:flex; justify-content:center; padding:12px 24px; }',
    '.diary-stats-cloud-inner { width:180px; height:140px; border-radius:50%; filter:blur(28px); }',

    /* Summary card */
    '.diary-stats-summary { margin:8px 24px 20px; padding:18px 20px; background:var(--d-card); border-radius:20px; display:flex; align-items:center; justify-content:space-between; }',
    '.diary-stats-summary-left { display:flex; align-items:center; gap:10px; }',
    '.diary-stats-summary-icon { display:grid; place-items:center; }',
    '.diary-stats-summary-icon svg { width:24px; height:24px; }',
    '.diary-stats-summary-label { display:block; font:400 12px/1 var(--font-sans); color:var(--d-muted); margin-bottom:3px; }',
    '.diary-stats-summary-mood { font:600 16px/1 var(--font-sans); }',
    '.diary-stats-summary-right { text-align:right; }',
    '.diary-stats-summary-desc { display:block; font:400 13px/1.3 var(--font-sans); color:var(--d-muted); }',
    '.diary-stats-summary-count { font:500 12px/1 var(--font-sans); color:var(--d-muted); }',

    /* Mood distribution */
    '.diary-stats-section { padding:0 24px 40px; }',
    '.diary-stats-section-title { font:600 14px/1 var(--font-sans); color:var(--d-muted); margin:0 0 18px; }',
    '.diary-stats-mood-row { margin-bottom:20px; }',
    '.diary-stats-mood-info { display:flex; align-items:center; gap:8px; margin-bottom:6px; }',
    '.diary-stats-mood-icon { display:grid; place-items:center; }',
    '.diary-stats-mood-icon svg { width:18px; height:18px; }',
    '.diary-stats-mood-name { font:500 14px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-stats-mood-count { font:400 13px/1 var(--font-sans); color:var(--d-muted); flex:1; text-align:right; }',
    '.diary-stats-mood-pct { font:500 13px/1 var(--font-sans); color:var(--d-muted); min-width:36px; text-align:right; }',
    '.diary-stats-bar-wrap { height:4px; background:rgba(0,0,0,.05); border-radius:2px; margin-bottom:6px; overflow:hidden; }',
    '.diary-stats-bar { height:100%; border-radius:2px; transition:width .5s ease; }',
    '.diary-stats-memory { font:400 13px/1.45 var(--font-sans); color:var(--d-muted); margin:2px 0 0; padding-left:26px; }',

    /* Timeline */
    '.diary-timeline-list { padding:0 24px; }',
    '.diary-date-group { position:relative; }',
    '.diary-date-marker { display:flex; align-items:center; gap:10px; padding:24px 0 8px; position:relative; }',
    '.diary-timeline-dot { flex:none; width:10px; height:10px; border-radius:50%; border:2px solid var(--d-line); background:var(--d-bg); position:relative; z-index:1; margin-left:2px; }',
    '.diary-timeline-line { position:absolute; left:6px; top:34px; bottom:-8px; width:1px; background:var(--d-line); }',
    '.diary-date-label { font:600 15px/1 var(--font-sans); color:var(--d-muted); }',
    '.diary-date-cards { padding-left:22px; }',

    /* Cards */
    '.diary-card { background:var(--d-card); border-radius:20px; padding:18px 20px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.04); cursor:pointer; transition:box-shadow .2s, transform .15s; position:relative; }',
    '.diary-card:active { transform:scale(.99); }',
    '.diary-card.locked { opacity:.85; }',
    '.diary-card-top { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap; }',
    '.diary-card-mood { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:999px; font:500 12px/1 var(--font-sans); }',
    '.diary-card-mood svg { width:14px; height:14px; }',
    '.diary-card-lock { color:var(--d-muted); display:grid; place-items:center; }',
    '.diary-card-spacer { flex:1; }',
    '.diary-card-comments { display:inline-flex; align-items:center; gap:3px; font:400 12px/1 var(--font-sans); color:var(--d-muted); }',
    '.diary-card-unlock-countdown { font:400 11px/1 var(--font-sans); color:var(--d-muted); background:rgba(0,0,0,.03); padding:4px 8px; border-radius:999px; }',
    '.diary-card-title { font:600 17px/1.3 var(--font-sans); color:var(--d-text); margin:0 0 6px; }',
    '.diary-card-body { font:400 15px/1.65 var(--font-serif, Georgia); color:var(--d-text); margin:0; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }',

    /* Locked card */
    '.diary-locked-body { position:relative; overflow:hidden; border-radius:12px; padding:28px 16px; text-align:center; background:rgba(0,0,0,.02); }',
    '.diary-locked-pattern { position:absolute; inset:0; opacity:.06; background:repeating-linear-gradient(45deg, var(--d-text) 0, var(--d-text) 1px, transparent 1px, transparent 8px); }',
    '.diary-locked-badge { color:var(--d-muted); margin-bottom:8px; }',
    '.diary-unlock-date { font:400 13px/1 var(--font-sans); color:var(--d-muted); margin:0; }',

    /* Detail view */
    '.diary-back-btn { display:inline-flex; align-items:center; gap:4px; padding:12px 24px 0; border:0; background:transparent; font:500 15px/1 var(--font-sans); color:var(--d-muted); cursor:pointer; }',
    '.diary-detail-header { padding:16px 24px 0; }',
    '.diary-detail-date { font:600 15px/1 var(--font-sans); color:var(--d-muted); margin:0 0 4px; }',
    '.diary-detail-title { font:700 28px/1.2 var(--font-sans); color:var(--d-text); margin:0 0 14px; letter-spacing:-.01em; }',
    '.diary-detail-body { padding:24px 24px 0; font:400 18px/1.85 var(--font-serif, Georgia); color:var(--d-text); }',
    '.diary-detail-actions { display:flex; gap:10px; padding:20px 24px; }',
    '.diary-action-btn { display:inline-flex; align-items:center; gap:5px; padding:8px 16px; border:1px solid var(--d-line); border-radius:999px; background:transparent; font:400 14px/1 var(--font-sans); color:var(--d-text); cursor:pointer; }',
    '.diary-action-btn.danger { color:#C0504A; border-color:#E8D0CE; }',
    '.diary-action-btn:active { background:rgba(0,0,0,.03); }',
    '.diary-detail-divider { height:1px; background:var(--d-line); margin:4px 24px 24px; }',

    /* Comments */
    '.diary-comments-section { padding:0 24px; }',
    '.diary-comments-title { font:600 15px/1 var(--font-sans); color:var(--d-muted); margin:0 0 16px; }',
    '.diary-comments-empty { font:400 14px/1.5 var(--font-sans); color:var(--d-muted); }',
    '.diary-comment-card { display:flex; gap:12px; margin-bottom:16px; padding:14px 16px; background:var(--d-card); border-radius:18px; max-width:90%; box-shadow:0 1px 2px rgba(0,0,0,.03); }',
    '.diary-comment-avatar { flex:none; width:32px; height:32px; border-radius:50%; overflow:hidden; }',
    '.diary-comment-body { flex:1; min-width:0; }',
    '.diary-comment-meta { display:flex; align-items:center; gap:8px; margin-bottom:4px; }',
    '.diary-comment-author { font:600 13px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-comment-time { font:400 11px/1 var(--font-sans); color:var(--d-muted); }',
    '.diary-comment-text { font:400 14px/1.55 var(--font-sans); color:var(--d-text); margin:0; }',

    /* Comment input */
    '.diary-comment-input-wrap { position:sticky; bottom:0; display:flex; align-items:center; gap:8px; padding:14px 24px calc(env(safe-area-inset-bottom) + 10px); background:var(--d-bg); border-top:1px solid var(--d-line); }',
    '.diary-comment-input { flex:1; min-width:0; height:42px; padding:0 18px; border:0; border-radius:999px; background:var(--d-card); font:400 15px/1 var(--font-sans); color:var(--d-text); outline:0; box-shadow:0 1px 3px rgba(0,0,0,.04); }',
    '.diary-comment-input::placeholder { color:var(--d-muted); }',
    '.diary-comment-send { flex:none; width:42px; height:42px; border-radius:50%; border:0; background:var(--d-accent); color:var(--d-bg); display:grid; place-items:center; cursor:pointer; transition:opacity .2s, transform .15s; }',
    '.diary-comment-send:active { transform:scale(.94); }',
    '.diary-comment-send.hidden { opacity:0; pointer-events:none; transform:scale(.8); }',

    /* Edit sheet */
    '.diary-edit-sheet { position:fixed; inset:0; z-index:200; display:flex; align-items:flex-start; justify-content:center; opacity:0; pointer-events:none; transition:opacity .25s; }',
    '.diary-edit-sheet, .diary-edit-panel { --d-bg:#F8F7F4; --d-card:#FFFDF9; --d-text:#2C2821; --d-muted:#A0988B; --d-line:#E5DFD4; --d-accent:#2C2821; }',
    '.diary-edit-sheet.show { opacity:1; pointer-events:auto; }',
    '@media (prefers-color-scheme:dark) { .diary-edit-sheet, .diary-edit-panel { --d-bg:#1C1A17; --d-card:#25221E; --d-text:#E8E4DB; --d-muted:#8A8276; --d-line:#3A3530; --d-accent:#E8E4DB; } .diary-edit-panel { background:#1C1A17; } .diary-edit-content,.diary-edit-title,.diary-edit-lock-row { background:#25221E; color:#E8E4DB; } }',
    'html[data-theme="dark"] .diary-edit-sheet, html[data-theme="dark"] .diary-edit-panel { --d-bg:#1C1A17; --d-card:#25221E; --d-text:#E8E4DB; --d-muted:#8A8276; --d-line:#3A3530; --d-accent:#E8E4DB; } html[data-theme="dark"] .diary-edit-panel { background:#1C1A17; } html[data-theme="dark"] .diary-edit-content,html[data-theme="dark"] .diary-edit-title,html[data-theme="dark"] .diary-edit-lock-row { background:#25221E; color:#E8E4DB; }',
    '.diary-edit-overlay { position:absolute; inset:0; background:rgba(0,0,0,.25); }',
    '.diary-edit-panel { position:relative; z-index:1; width:100%; max-height:92dvh; background:var(--d-bg); border-radius:0 0 24px 24px; display:flex; flex-direction:column; overflow:hidden; transform:translateY(-24px); transition:transform .3s cubic-bezier(.32,.72,0,1); }',
    '.diary-edit-sheet.show .diary-edit-panel { transform:translateY(0); }',
    '.diary-edit-handle { width:36px; height:5px; background:var(--d-line); border-radius:999px; margin:10px auto 0; flex:none; }',
    '.diary-edit-head { display:flex; align-items:center; justify-content:space-between; padding:calc(env(safe-area-inset-top) + 10px) 20px 12px; flex:none; background:#201F1D; color:#F8F7F4; }',
    '.diary-edit-cancel { border:0; background:transparent; font:400 15px/1 var(--font-sans); color:rgba(255,255,255,.6); cursor:pointer; }',
    '.diary-edit-date-sm { font:500 13px/1 var(--font-sans); color:rgba(255,255,255,.45); }',
    '.diary-edit-save { border:0; background:#F8F7F4; font:600 14px/1 var(--font-sans); color:#201F1D; cursor:pointer; padding:9px 20px; border-radius:999px; }',
    '.diary-edit-save:active { background:#E8E4DB; }',
    '.diary-edit-scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:24px 20px 30px; }',
    '.diary-edit-date-label { font:400 14px/1 var(--font-sans); color:var(--d-muted); margin:0 0 14px; }',
    '.diary-edit-title { width:100%; height:44px; padding:0 14px; border:0; border-radius:14px; background:var(--d-card); font:600 18px/1 var(--font-sans); color:var(--d-text); outline:0; box-sizing:border-box; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,.03); }',
    '.diary-edit-title::placeholder { color:var(--d-muted); font-weight:400; }',
    '.diary-edit-content { width:100%; min-height:160px; padding:16px; border:0; border-radius:16px; background:var(--d-card); font:400 16px/1.7 var(--font-serif, Georgia); color:var(--d-text); outline:0; resize:vertical; box-sizing:border-box; margin-bottom:18px; box-shadow:0 1px 3px rgba(0,0,0,.03); }',
    '.diary-edit-content::placeholder { color:var(--d-muted); }',
    '.diary-edit-lock-row { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:var(--d-card); border-radius:14px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.03); }',
    '.diary-edit-lock-label { display:inline-flex; align-items:center; gap:8px; font:400 15px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-lock-toggle { width:50px; height:30px; border-radius:999px; border:0; background:#D7D2CB; padding:3px; transition:background .2s; cursor:pointer; }',
    '.diary-lock-toggle::after { content:""; display:block; width:24px; height:24px; border-radius:50%; background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.15); transition:transform .2s; }',
    '.diary-lock-toggle.on { background:#C0504A; }',
    '.diary-lock-toggle.on::after { transform:translateX(20px); }',
    '.diary-edit-unlock-row { padding:0 4px; }',
    '.diary-edit-unlock-row label { display:block; font:400 13px/1 var(--font-sans); color:var(--d-muted); margin-bottom:6px; }',
    '.diary-edit-unlock-input { width:100%; height:40px; padding:0 14px; border:1px solid var(--d-line); border-radius:12px; background:var(--d-card); font:400 15px/1 var(--font-sans); color:var(--d-text); outline:0; box-sizing:border-box; }',

    /* Mood picker */
    '.diary-mood-picker-label { font:400 13px/1 var(--font-sans); color:var(--d-muted); margin:0 0 10px 4px; }',
    '.diary-mood-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:18px; }',
    '.diary-mood-tile { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; height:72px; padding:8px 4px; border:1px solid var(--d-line); border-radius:16px; background:var(--d-card); cursor:pointer; transition:border-color .2s, background .2s; position:relative; }',
    '.diary-mood-tile:active { background:rgba(0,0,0,.02); }',
    '.diary-mood-tile.selected { border-width:1.5px; }',
    '.diary-mood-tile-icon { display:grid; place-items:center; }',
    '.diary-mood-tile-label { font:500 11px/1 var(--font-sans); color:var(--d-text); }',
    '.diary-mood-order { position:absolute; top:-5px; right:-5px; width:18px; height:18px; border-radius:50%; color:#fff; font:600 10px/18px var(--font-sans); text-align:center; }',

    /* FAB */
    '.diary-fab { position:fixed; bottom:calc(env(safe-area-inset-bottom) + 100px); right:24px; z-index:85; width:52px; height:52px; border-radius:50%; border:0; background:#201F1D; color:#F8F7F4; display:grid; place-items:center; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.15), 0 1px 4px rgba(0,0,0,.08); transition:transform .2s, box-shadow .2s; }',
    '.diary-fab:active { transform:scale(.92); box-shadow:0 2px 8px rgba(0,0,0,.12); }',
    '@media (prefers-color-scheme: dark) { .diary-fab { background:#E8E4DB; color:#1C1A17; } .diary-comment-card { background:#25221E; } .diary-comment-input { background:#25221E; color:#E8E4DB; } .diary-comment-input-wrap { background:#1C1A17; border-color:#3A3530; } }',
    'html[data-theme="dark"] .diary-fab { background:#E8E4DB; color:#1C1A17; } html[data-theme="dark"] .diary-comment-card { background:#25221E; } html[data-theme="dark"] .diary-comment-input { background:#25221E; color:#E8E4DB; } html[data-theme="dark"] .diary-comment-input-wrap { background:#1C1A17; border-color:#3A3530; }',

    /* Empty state */
    '.diary-empty { padding:60px 24px; text-align:center; }',

    /* Month pills — kept from existing */
    '.diary-month-pill { flex:none; padding:8px 18px; border:0; border-radius:999px; background:var(--d-card); color:var(--d-muted); font:500 14px/1 var(--font-sans); white-space:nowrap; cursor:pointer; transition:all .15s; }',
    '.diary-month-pill.active { background:var(--d-accent); color:var(--d-bg); }',
  ].join('\n');
  document.head.appendChild(style);
}

// ====== Init ======
(function() {
  _initDiaryStyles();
  // Defer event binding until DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initDiaryEvents);
  } else {
    _initDiaryEvents();
  }
  // 暗色模式——强制面板背景
  function _diaryApplyTheme() {
    var isDark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
    var panel = document.getElementById('diaryPanel');
    if (panel) panel.style.background = isDark ? '#1C1A17' : '#F8F7F4';
  }
  _diaryApplyTheme();
  new MutationObserver(_diaryApplyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', _diaryApplyTheme);
})();
