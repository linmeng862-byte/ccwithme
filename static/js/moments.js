// === Moments 朋友圈（2026-09-18 她要的）===
// 她原话：「都能发互相评论点赞的，得是主线的他，不要是分身」
//        「他独处的时候看见什么有什么感想可以发朋友圈，他自己也可以翻我们两的朋友圈」
//
// 他那半在 backend.js：post_moment / read_moments / moment_comment 三个工具，
// 加醒来提示词里的 <moment> 标记。这份只管**她**这半：翻、发、评论、点赞。
//
// ⚠️ 这份自带 _moEsc，不用 index.html 里的 escHtml —— 那个定义在页面中段，
//    这份在 head 里加载，不想赌加载顺序。正文一律走 textContent / _moEsc，
//    别学聊天气泡那条路去 marked.parse（那条至今没过滤，见未竟）。
console.log('[moments] v2 — feed 结构（微信骨架 + ins 干净）');

var _moData = [];
var _moDraftImgs = [];
var _moUploading = false;

function _moEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 名字和头像跟聊天窗共用同一份（她在「家」那页点头像改的就是这两个 key）。
// 没设过就落回默认：她 Vicky / 他 Cis，头像落回线条图标（她小人 / 他 Claude 标），不用 emoji。
function _moLS(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function _moName(a) {
  var n = _moLS(a === 'cis' ? 'claude_name' : 'home_name').trim();
  return n || (a === 'cis' ? 'Cis' : 'Vicky');
}
function _moAvatar(a, cls) {
  var src = _moLS(a === 'cis' ? 'claude_avatar' : 'home_avatar');
  if (src) return '<div class="' + cls + '"><img src="' + _moEsc(src) + '" alt=""></div>';
  // 没设头像时的兜底。**不用 emoji**（09-18 她定的：UI 不要 emoji）——
  // 他是 Claude 标（#claude-mark 那个 sprite 就在这一页里），她是一个线条小人。
  return a === 'cis'
    ? '<div class="' + cls + ' cis"><svg viewBox="0 0 16 16" fill="currentColor"><use href="#claude-mark"/></svg></div>'
    : '<div class="' + cls + ' zhou"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.5"/>'
      + '<path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg></div>';
}
var _MO_HEART = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20c-3.2-2.6-8-5.8-8-10.4C4 6.5 6.2 4.6 8.6 4.6c1.5 0 2.7.7 3.4 1.8.7-1.1 1.9-1.8 3.4-1.8 2.4 0 4.6 1.9 4.6 5 0 4.6-4.8 7.8-8 10.4z"/></svg>';
var _MO_HEART_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20c-3.2-2.6-8-5.8-8-10.4C4 6.5 6.2 4.6 8.6 4.6c1.5 0 2.7.7 3.4 1.8.7-1.1 1.9-1.8 3.4-1.8 2.4 0 4.6 1.9 4.6 5 0 4.6-4.8 7.8-8 10.4z"/></svg>';
var _MO_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 21c4-5 7-8.1 7-11a7 7 0 1 0-14 0c0 2.9 3 6 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
var _MO_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>';
var _MO_CMT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 12c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L5 20l1.4-3.3C5.2 15.5 4 13.9 4 12c0-3.9 3.6-7 8-7s8 3.1 8 7z"/></svg>';
// 相对时间，跟朋友圈一个脾气：刚刚 / 12 分钟前 / 昨天 14:03 / 9月2日
function _moWhen(ts) {
  var d = new Date(ts * 1000), now = new Date();
  var diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  var sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return hm;
  var y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

function openMomentsPanel() {
  try { closeDrawer(); } catch (e) {}
  var p = document.getElementById('momentsPanel');
  if (!p) return;
  // 进朋友圈就算「白点看过了」——抬白点水位、灭掉入口那颗。
  // ⚠️ 顶上那条胶囊是另一个水位 moments_seen_at，要她点了才灭，别在这动它。
  try { localStorage.setItem('moments_dot_seen_at', String(Math.floor(Date.now() / 1000))); } catch (e) {}
  _moSetEntryDot(false);
  p.classList.add('show');
  p.setAttribute('aria-hidden', 'false');
  _moRenderWall();
  _moRenderCover();
  _moLoad();
}
function closeMomentsPanel() {
  var p = document.getElementById('momentsPanel');
  if (!p) return;
  p.classList.remove('show');
  p.setAttribute('aria-hidden', 'true');
  _moCloseSheet();
}

// 点卡片以外的地方收起黑胶囊（挂一次，不跟着重画走）
document.addEventListener('click', function (e) {
  if (e.target.closest && (e.target.closest('.mo-pop') || e.target.closest('.mo-dots'))) return;
  _moCloseMenus();
}, true);

async function _moLoad() {
  var feed = document.getElementById('moFeed');
  try {
    var r = await api('/api/moments?limit=60');
    if (!r.ok) throw Error(r.status);
    var d = await r.json();
    _moData = d.moments || [];
  } catch (e) {
    console.error('[moments] load failed', e);
    if (feed) feed.innerHTML = '<div class="mo-empty">没拉到 —— 刷新试试</div>';
    return;
  }
  _moRender();
}

// 顶上那条「Cis 等 N 条互动」。水位 moments_seen_at，点一下就抬。
// ⚠️ 只数**他**对**她的帖子**的动作 —— 她自己给自己点的赞不算互动。
function _moUnread() {
  var seen = parseInt(_moLS('moments_seen_at'), 10) || 0;
  var out = [];
  _moData.forEach(function (m) {
    if (m.author !== 'zhou') return;
    (m.likes_at || []).forEach(function (l) {
      if (l.author === 'cis' && l.at > seen) out.push({ id: m.id, at: l.at, kind: 'like' });
    });
    (m.comments || []).forEach(function (c) {
      if (c.author === 'cis' && c.created_at > seen) out.push({ id: m.id, at: c.created_at, kind: 'cmt' });
    });
  });
  return out.sort(function (a, b) { return b.at - a.at; });
}
function _moRenderUnread() {
  var bar = document.getElementById('moUnread');
  if (!bar) return;
  var u = _moUnread();
  if (!u.length) { bar.classList.remove('show'); bar.innerHTML = ''; return; }
  var last = u[0].kind === 'like' ? '给你点了个赞' : '评论了你';
  bar.innerHTML = _moAvatar('cis', 'mo-unread-av') +
    '<span>' + _moEsc(_moName('cis')) + ' ' + last +
    (u.length > 1 ? '，共 ' + u.length + ' 条互动' : '') + '</span>' +
    '<span class="mo-unread-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></span>';
  bar.onclick = function () {
    try { localStorage.setItem('moments_seen_at', String(Math.floor(Date.now() / 1000))); } catch (e) {}
    var el = document.querySelector('.mo-post[data-id="' + u[0].id + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    _moRenderUnread();
  };
  bar.classList.add('show');
}

// ====== 入口白点（不进朋友圈也能知道他赞了/评论了）======
// 跟顶上那条胶囊分开算：胶囊用 moments_seen_at（她点了才灭），
// 白点用 moments_dot_seen_at（她一进朋友圈就灭）。只数**他**对**她的帖子**的动作。
function _moUnreadCount(seenKey) {
  var seen = parseInt(_moLS(seenKey), 10) || 0;
  var n = 0;
  _moData.forEach(function (m) {
    if (m.author !== 'zhou') return;
    (m.likes_at || []).forEach(function (l) { if (l.author === 'cis' && l.at > seen) n++; });
    (m.comments || []).forEach(function (c) { if (c.author === 'cis' && c.created_at > seen) n++; });
  });
  return n;
}
function _moSetEntryDot(on) {
  var btn = document.querySelector('.home-nav-item[data-page="moments"]');
  if (!btn) return;
  var dot = btn.querySelector('.mo-nav-dot');
  if (on && !dot) { dot = document.createElement('span'); dot.className = 'mo-nav-dot'; btn.appendChild(dot); }
  else if (!on && dot) { dot.remove(); }
}
// 打开抽屉 / 页面加载时拉一次，算出入口该不该亮。数据顺手存进 _moData（面板打开时复用）。
async function _moRefreshEntryDot() {
  try {
    var r = await api('/api/moments?limit=60');
    if (!r.ok) return;
    var d = await r.json();
    _moData = d.moments || [];
    _moSetEntryDot(_moUnreadCount('moments_dot_seen_at') > 0);
  } catch (e) {}
}

function _moRender() {
  var feed = document.getElementById('moFeed');
  if (!feed) return;
  if (!_moData.length) {
    feed.innerHTML = '<div class="mo-empty">这里还空着。<br>你发第一条，他翻到了会给你点赞。</div>';
    _moRenderUnread();
    return;
  }
  feed.innerHTML = _moData.map(_moCard).join('');
  _moRenderUnread();
}

function _moCard(m) {
  var who = m.author === 'cis' ? 'cis' : 'zhou';
  var id = _moEsc(m.id);
  var imgs = (m.images || []).length
    ? '<div class="mo-imgs n' + Math.min(m.images.length, 9) + '">' +
      m.images.map(function (u) {
        return '<img src="' + _moEsc(u) + '" loading="lazy" onclick="_moZoom(this.src)">';
      }).join('') + '</div>'
    : '';

  var likes = m.likes || [];
  var iLiked = likes.indexOf('zhou') >= 0;
  var comments = m.comments || [];

  // 赞的那行和评论挤在同一块浅底里 —— 微信就是这么放的，两样都没有就整块不出现
  var engage = '';
  if (likes.length || comments.length) {
    engage = '<div class="mo-engage">' +
      (likes.length
        ? '<div class="mo-liked-by">' + _MO_HEART_O +   /* 参考图里这颗是空心的 */
          '<span>' + likes.map(_moName).map(_moEsc).join('、') + '</span></div>'
        : '') +
      comments.map(function (c) {
        var ca = c.author === 'cis' ? 'cis' : 'zhou';
        return '<div class="mo-cmt">' +
          (ca === 'zhou' ? '<button class="mo-del" onclick="_moDelComment(\'' + id + '\',\'' + _moEsc(c.id) + '\')">×</button>' : '') +
          '<b class="' + ca + '">' + _moEsc(_moName(c.author)) + '</b>：' + _moEsc(c.content) +
          '</div>';
      }).join('') +
      '</div>';
  }

  return '<article class="mo-post" data-id="' + id + '">' +
    _moAvatar(m.author, 'mo-av') +
    '<div class="mo-main">' +
      '<div class="mo-name ' + who + '">' + _moEsc(_moName(m.author)) + '</div>' +
      (m.content ? '<div class="mo-text">' + _moEsc(m.content) + '</div>' : '') +
      imgs +
      (m.place ? '<div class="mo-place">' + _MO_PIN + '<span>' + _moEsc(m.place) + '</span></div>' : '') +
      '<div class="mo-meta">' +
        '<span class="mo-time">' + _moEsc(_moWhen(m.created_at)) + '</span>' +
        '<div class="mo-pop" id="moPop_' + id + '">' +
          '<button class="' + (iLiked ? 'on' : '') + '" onclick="_moLike(\'' + id + '\')">' +
            (iLiked ? _MO_HEART : _MO_HEART_O) + (iLiked ? '取消' : '赞') + '</button>' +
          '<span class="mo-pop-div"></span>' +
          '<button onclick="_moToggleReply(\'' + id + '\')">' + _MO_CMT + '评论</button>' +
          (who === 'zhou'
            ? '<span class="mo-pop-div"></span><button onclick="_moDelete(\'' + id + '\')">删除</button>'
            : '') +
        '</div>' +
        '<button class="mo-dots" aria-label="操作" onclick="_moMenu(event,\'' + id + '\')">' + _MO_DOTS + '</button>' +
      '</div>' +
      engage +
      '<div class="mo-reply" id="moReply_' + id + '">' +
        '<input type="text" placeholder="说点什么…" onkeydown="if(event.key===\'Enter\')_moSendComment(\'' + id + '\')">' +
        '<button onclick="_moSendComment(\'' + id + '\')">发送</button>' +
      '</div>' +
    '</div>' +
  '</article>';
}

// 封面右下角那块：她的头像和名字。每次打开都重取一遍 ——
// 她在「家」那页刚换过头像的话，这儿要跟着变。
function _moFillAvatar(id, who) {
  var el = document.getElementById(id);
  if (!el) return;
  var html = _moAvatar(who, 'mo-who-av');            // 拿现成的那套兜底逻辑
  var m = html.match(/^<div class="mo-who-av([^"]*)">([\s\S]*)<\/div>$/);
  el.className = 'mo-who-av' + (m ? m[1] : '') + (id === 'moCoverAvHim' ? ' him' : '');
  el.innerHTML = m ? m[2] : '';
}

function _moRenderCover() {
  // 09-18 封面撤了（壁纸是全屏的，顶上再压一张是多余的一层）。
  //   现在这个函数只干一件事：把两个人的头像填进右上角那两格。
  _moFillAvatar('moCoverAvHim', 'cis');
  _moFillAvatar('moCoverAv', 'zhou');
}


// 压图再存。封面和壁纸共用这一段 —— 存的是 dataURL，不压会把 localStorage 撑爆。
function _moStoreImage(file, key, done) {
  var fr = new FileReader();
  fr.onload = function (e) {
    var im = new Image();
    im.onload = function () {
      var w = Math.min(im.width, 1200), h = Math.round(im.height * (w / im.width));
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      try { localStorage.setItem(key, cv.toDataURL('image/jpeg', 0.82)); }
      catch (err) { toast('这张太大了，换一张小点的'); return; }
      done();
    };
    im.src = e.target.result;
  };
  fr.readAsDataURL(file);
}

function _moPickWall(input) {
  var f = (input.files || [])[0];
  input.value = '';
  if (!f) return;
  _moStoreImage(f, 'moments_wallpaper', _moRenderWall);
}
function _moRenderWall() {
  var p = document.getElementById('momentsPanel');
  if (!p) return;
  var w = _moLS('moments_wallpaper');
  if (w) { p.style.backgroundImage = 'url(' + w + ')'; p.classList.add('has-wall'); }
  else { p.style.backgroundImage = ''; p.classList.remove('has-wall'); }
}
function _moClearWall() {
  try { localStorage.removeItem('moments_wallpaper'); } catch (e) {}
  _moRenderWall();
}

// 换封面。走 localStorage，跟头像同一条路 —— 也同一个坑：
// 存的是 dataURL，太大会把 localStorage 撑爆，所以先在 canvas 上压到宽 1200 再存。
// （头像那边是直接存原图 + try/catch 提示「小于1MB」，这儿图更大，必须压。）

// ====== 赞 / 评论 ======
// 点赞先改本地再打接口（乐观更新）——这东西一秒点两下很正常，等一圈网络太钝。
async function _moLike(id) {
  _moCloseMenus();
  var m = _moData.filter(function (x) { return x.id === id; })[0];
  if (!m) return;
  var i = (m.likes || []).indexOf('zhou');
  if (i >= 0) m.likes.splice(i, 1); else (m.likes = m.likes || []).push('zhou');
  _moRender();
  try {
    var r = await api('/api/moments/' + encodeURIComponent(id) + '/like', {
      method: 'POST', body: JSON.stringify({ author: 'zhou' })
    });
    var d = await r.json();
    if (d && d.likes) { m.likes = d.likes; _moRender(); }
  } catch (e) { toast('点赞没成功'); _moLoad(); }
}

// 「···」：一次只开一个；点页面别处收起来（事件挂在 feed 上，卡片重画不受影响）
function _moMenu(ev, id) {
  if (ev) ev.stopPropagation();
  var box = document.getElementById('moPop_' + id);
  var was = box && box.classList.contains('show');
  _moCloseMenus();
  if (box && !was) box.classList.add('show');
}
function _moCloseMenus() {
  var all = document.querySelectorAll('.mo-pop.show');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('show');
}

function _moToggleReply(id) {
  _moCloseMenus();
  var box = document.getElementById('moReply_' + id);
  if (!box) return;
  box.classList.toggle('show');
  if (box.classList.contains('show')) box.querySelector('input').focus();
}

async function _moSendComment(id) {
  var box = document.getElementById('moReply_' + id);
  if (!box) return;
  var input = box.querySelector('input');
  var text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  try {
    var r = await api('/api/moments/' + encodeURIComponent(id) + '/comments', {
      method: 'POST', body: JSON.stringify({ author: 'zhou', content: text })
    });
    if (!r.ok) throw Error(r.status);
    await _moLoad();
  } catch (e) { toast('评论没发出去'); input.value = text; }
}

async function _moDelComment(mid, cid) {
  try {
    await api('/api/moments/' + encodeURIComponent(mid) + '/comments/' + encodeURIComponent(cid), { method: 'DELETE' });
    await _moLoad();
  } catch (e) { toast('删不掉'); }
}

async function _moDelete(id) {
  _moCloseMenus();
  if (!confirm('删掉这条？下面的评论和赞会一起没。')) return;
  try {
    await api('/api/moments/' + encodeURIComponent(id), { method: 'DELETE' });
    await _moLoad();
  } catch (e) { toast('删不掉'); }
}

// ====== 她发一条 ======
function _moOpenSheet() {
  _moDraftImgs = [];
  var s = document.getElementById('moSheet'), mask = document.getElementById('moSheetMask');
  document.getElementById('moText').value = '';
  _moRenderThumbs();
  mask.classList.add('show');
  // 先挂 mask 再挂 show，不然 transform 动画从 0 帧开始跑不起来
  requestAnimationFrame(function () { s.classList.add('show'); });
  setTimeout(function () { document.getElementById('moText').focus(); }, 380);
}
function _moCloseSheet() {
  var s = document.getElementById('moSheet'), mask = document.getElementById('moSheetMask');
  if (!s) return;
  s.classList.remove('show');
  setTimeout(function () { mask.classList.remove('show'); }, 340);
}

function _moRenderThumbs() {
  var box = document.getElementById('moThumbs');
  if (!box) return;
  box.innerHTML = _moDraftImgs.map(function (u, i) {
    return '<div class="mo-thumb"><img src="' + _moEsc(u) + '">' +
      '<button onclick="_moDropImg(' + i + ')">×</button></div>';
  }).join('');
  var btn = document.getElementById('moPostBtn');
  if (btn) btn.disabled = _moUploading;
}
function _moDropImg(i) { _moDraftImgs.splice(i, 1); _moRenderThumbs(); }

// 配图复用 /api/gallery/upload —— 它只存图返 url，不往任何相册里塞。
async function _moPickImg(input) {
  var files = Array.prototype.slice.call(input.files || []);
  input.value = '';
  if (!files.length) return;
  if (_moDraftImgs.length + files.length > 9) { toast('最多九张'); files = files.slice(0, 9 - _moDraftImgs.length); }
  _moUploading = true; _moRenderThumbs();
  for (var i = 0; i < files.length; i++) {
    try {
      var fd = new FormData();
      fd.append('file', files[i]);
      // api() 自己认 FormData（不加 Content-Type），不用额外传什么
      var r = await api('/api/gallery/upload', { method: 'POST', body: fd });
      var d = await r.json();
      if (d && d.url) _moDraftImgs.push(d.url);
    } catch (e) { toast('有张图没传上去'); }
  }
  _moUploading = false; _moRenderThumbs();
}

async function _moPost() {
  var text = (document.getElementById('moText').value || '').trim();
  if (!text && !_moDraftImgs.length) { toast('写点什么，或者配张图'); return; }
  var btn = document.getElementById('moPostBtn');
  btn.disabled = true;
  try {
    var r = await api('/api/moments', {
      method: 'POST',
      body: JSON.stringify({ author: 'zhou', content: text, images: _moDraftImgs })
    });
    if (!r.ok) throw Error(r.status);
    _moDraftImgs = [];
    _moCloseSheet();
    await _moLoad();
  } catch (e) { toast('没发出去'); }
  btn.disabled = false;
}

function _moZoom(src) {
  var lb = document.getElementById('moLightbox');
  if (!lb) return;
  lb.querySelector('img').src = src;
  lb.classList.add('show');
}
