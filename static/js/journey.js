/* ============================================================
   journey.js — Journey Cards 旅行故事
   聊天卡片 + 全屏故事浮层 + 打字机 + 音乐播放器
   从 journey-cards 参考实现提取，适配 Chat-C 架构
   ============================================================ */
"use strict";

// ── 命名空间 ──
var _JC = {};

// ── 小工具 ──
function _jcEscape(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function _jcFill(s) {
  return String(s||"").replace(/\{user\}/g, "粥粥").replace(/\{ai\}/g, "Claude");
}
function _jcFmtTime(sec) {
  sec = Math.max(0, Math.floor(sec||0));
  return Math.floor(sec/60) + ":" + String(sec%60).padStart(2,"0");
}
function _jcSplitSentences(text) {
  var END = "。！？!?…";
  var out = [], cur = "", s = String(text||"");
  for (var i = 0; i < s.length; i++) {
    cur += s[i];
    if (END.indexOf(s[i]) >= 0 && (i+1 >= s.length || END.indexOf(s[i+1]) < 0)) {
      out.push(cur.trim()); cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

// ── 播放 SVG ──
var _JC_PLAY  = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l11-6.5z" fill="#fff"/></svg>';
var _JC_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="#fff"/><rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="#fff"/></svg>';

// ── 主题色 ──
(function() {
  var ok = !!(window.CSS && window.CSS.supports && window.CSS.supports("color","oklch(0.66 0.12 32)"));
  document.documentElement.style.setProperty("--jc-accent", ok ? "oklch(0.66 0.12 32)" : "#D4957A");
})();

// ══════════════════════════════════════════════════════════════
// 打字机
// ══════════════════════════════════════════════════════════════
function _jcTypewriter(text, opts) {
  var schedule = opts.schedule || function(fn,ms) { return setTimeout(fn,ms); };
  var onDone = opts.onDone || function() {};
  var onChar = opts.onChar || function() {};
  var sentences = _jcSplitSentences(text);
  if (!sentences.length) { onDone(); return []; }
  var timers = [];
  var sIdx = 0, chIdx = 0, curLine = "";
  var BASE = 68;  // 毫秒/字
  var PUNCT = { "，":280, "。":380, "！":380, "？":380, "…":420, "、":160, "；":320 };

  function showLine(html) {
    onChar(html);
  }
  function typeChar() {
    if (sIdx >= sentences.length) { onDone(); return; }
    var sent = sentences[sIdx];
    if (chIdx >= sent.length) {
      // 这句打完，显示完整句，停顿后进下一句
      showLine(curLine);
      sIdx++; chIdx = 0; curLine = "";
      if (sIdx >= sentences.length) {
        timers.push(schedule(function() {
          showLine(curLine); onDone();
        }, 380));
        return;
      }
      timers.push(schedule(typeChar, 380));
      return;
    }
    var ch = sent[chIdx]; chIdx++;
    curLine += ch;
    showLine(curLine + '<span class="jc-story-narr-cursor">|</span>');
    var delay = PUNCT[ch] || BASE;
    // 连续标点更快
    if (chIdx > 0 && PUNCT[sent[chIdx-1]] && PUNCT[ch]) delay = 60;
    timers.push(schedule(typeChar, delay));
  }
  timers.push(schedule(typeChar, 40));
  return timers;
}

// ══════════════════════════════════════════════════════════════
// 音乐播放器
// ══════════════════════════════════════════════════════════════
_JC.audio = {
  ctx: null, gain: null, el: null, src: null,
  playing: false, ducked: false,
  timer: null, progressTimer: null
};

function _jcEnsureCtx() {
  if (!_JC.audio.ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _JC.audio.ctx = new AC();
    _JC.audio.gain = _JC.audio.ctx.createGain();
    _JC.audio.gain.gain.value = 1;
    _JC.audio.gain.connect(_JC.audio.ctx.destination);
  }
  if (_JC.audio.ctx.state === "suspended") _JC.audio.ctx.resume().catch(function(){});
  return _JC.audio.ctx;
}

function _jcAudioLoad(url, onReady) {
  var ctx = _jcEnsureCtx();
  if (!ctx || !url) { if (onReady) onReady(false); return; }
  // 用 <audio> + createMediaElementSource —— 流式播放，不用等全部下载
  if (_JC.audio.el) {
    try { _JC.audio.el.pause(); _JC.audio.el.src = ""; } catch(e) {}
  }
  var a = new Audio();
  a.crossOrigin = "anonymous";
  a.preload = "auto";
  a.src = url;
  a.loop = true;
  _JC.audio.el = a;

  if (_JC.audio.src) { try { _JC.audio.src.disconnect(); } catch(e) {} }
  _JC.audio.src = ctx.createMediaElementSource(a);
  _JC.audio.src.connect(_JC.audio.gain);

  a.addEventListener("loadedmetadata", function() {
    if (onReady) onReady(true);
  }, {once: true});
  a.addEventListener("error", function() {
    if (onReady) onReady(false);
  }, {once: true});
  // 兜底：3秒还没 metadata 也算失败
  setTimeout(function() {
    if (a.readyState < 1 && onReady) { onReady(false); onReady = null; }
  }, 3000);
}

function _jcAudioPlay() {
  var a = _JC.audio.el;
  if (!a) return;
  _JC.audio.playing = true;
  _jcUpdatePlayBtn();
  a.play().catch(function(){});
  _jcStartProgress();
}

function _jcAudioPause() {
  var a = _JC.audio.el;
  if (!a) return;
  _JC.audio.playing = false;
  a.pause();
  _jcUpdatePlayBtn();
  _jcStopProgress();
}

function _jcAudioStop() {
  _jcStopProgress();
  if (_JC.audio.el) { try { _JC.audio.el.pause(); _JC.audio.el.src = ""; } catch(e) {} }
  _JC.audio.ducked = false;
  if (_JC.audio.gain) { try { _JC.audio.gain.gain.cancelScheduledValues(0); _JC.audio.gain.gain.value = 1; } catch(e) {} }
  _JC.audio.playing = false;
  _JC.audio.el = null;
}

// Ducking: 念白时把音乐压到 0.3
function _jcAudioDuck(on) {
  _JC.audio.ducked = on;
  if (!_JC.audio.gain) return;
  var g = _JC.audio.gain.gain;
  var ctx = _JC.audio.ctx;
  if (ctx) {
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(on ? 0.3 : 1.0, ctx.currentTime, 0.12);
  } else {
    g.value = on ? 0.3 : 1.0;
  }
}

function _jcStartProgress() {
  _jcStopProgress();
  _JC.audio.progressTimer = setInterval(function() {
    var a = _JC.audio.el;
    if (!a || !_JC.audio.playing) return;
    var pct = a.duration ? a.currentTime / a.duration : 0;
    var fill = document.getElementById("jc-story-fill");
    var cur = document.getElementById("jc-story-cur");
    if (fill) fill.style.transform = "scaleX(" + pct + ")";
    if (cur) cur.textContent = _jcFmtTime(a.currentTime);
  }, 200);
}

function _jcStopProgress() {
  if (_JC.audio.progressTimer) { clearInterval(_JC.audio.progressTimer); _JC.audio.progressTimer = null; }
}

function _jcUpdatePlayBtn() {
  var btn = document.getElementById("jc-story-play");
  var eq = document.getElementById("jc-story-eq");
  if (btn) btn.innerHTML = _JC.audio.playing ? _JC_PAUSE : _JC_PLAY;
  if (eq) eq.style.display = _JC.audio.playing ? "" : "none";
}

// ══════════════════════════════════════════════════════════════
// 故事浮层
// ══════════════════════════════════════════════════════════════
_JC.story = { journey: null, idx: 0, timers: [], dead: false };

function _jcClearTimers() {
  _JC.story.timers.forEach(function(t) { clearTimeout(t); });
  _JC.story.timers = [];
}

function _jcLater(fn, ms) {
  var id = setTimeout(function() {
    _JC.story.timers = _JC.story.timers.filter(function(t) { return t !== id; });
    fn();
  }, ms);
  _JC.story.timers.push(id);
}

function _jcOpenStory(journey, startIdx) {
  startIdx = startIdx || 0;
  _jcCloseStory();
  _JC.story.journey = journey;
  _JC.story.idx = startIdx;
  _JC.story.dead = false;

  // 建浮层 DOM
  var overlay = document.createElement("div");
  overlay.className = "jc-story-overlay";
  overlay.id = "jc-story-overlay";
  overlay.innerHTML =
    '<div class="jc-story">' +
      '<div class="jc-story-top"><button class="jc-story-close" id="jc-story-close">&times;</button></div>' +
      '<div class="jc-story-photo" id="jc-story-photo">' +
        '<div class="jc-story-photo-bg" id="jc-story-bg"></div>' +
        '<div class="jc-story-centerscrim"></div>' +
        '<div class="jc-story-cap">' +
          '<span class="jc-story-cap-en" id="jc-story-en"></span>' +
          '<button class="jc-story-cap-place" id="jc-story-place"></button>' +
          '<span class="jc-story-cap-date" id="jc-story-date"></span>' +
        '</div>' +
        '<div class="jc-story-narr" id="jc-story-narr"><p class="jc-story-narr-line" id="jc-story-narr-line"></p></div>' +
        '<div class="jc-story-settled" id="jc-story-settled" style="display:none">' +
          '<p class="jc-story-settled-note expanded" id="jc-story-note"></p>' +
          '<button class="jc-story-settled-more" id="jc-story-more" style="display:none">收起 ↑</button>' +
        '</div>' +
        '<div class="jc-story-foot">' +
          '<div class="jc-story-player">' +
            '<button class="jc-story-player-play" id="jc-story-play">' + _JC_PLAY + '</button>' +
            '<div class="jc-story-player-body">' +
              '<div class="jc-story-player-meta">' +
                '<span class="jc-story-player-title" id="jc-story-song"></span>' +
                '<span class="jc-story-player-artist" id="jc-story-artist"></span>' +
                '<span class="jc-story-eq" id="jc-story-eq" style="display:none"><i></i><i></i><i></i></span>' +
              '</div>' +
              '<div class="jc-story-player-track" id="jc-story-track"><div class="jc-story-player-fill" id="jc-story-fill"></div></div>' +
              '<div class="jc-story-player-times"><span id="jc-story-cur">0:00</span><span id="jc-story-dur">0:00</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="jc-story-dots" id="jc-story-dots"></div>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // 点击浮层背景关闭
  overlay.addEventListener("click", function(e) { if (e.target === overlay) _jcCloseStory(); });

  // 绑定事件
  document.getElementById("jc-story-close").onclick = _jcCloseStory;
  document.getElementById("jc-story-play").onclick = function() {
    if (_JC.audio.playing) _jcAudioPause(); else _jcAudioPlay();
  };
  document.getElementById("jc-story-place").onclick = function() { _jcReplayNarration(); };

  // 进度条拖动
  var track = document.getElementById("jc-story-track");
  track.addEventListener("pointerdown", function(e) {
    track.classList.add("dragging");
    var fill = document.getElementById("jc-story-fill");
    var cur = document.getElementById("jc-story-cur");
    var a = _JC.audio.el;
    function onMove(ev) {
      var rect = track.getBoundingClientRect();
      var r = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      fill.style.transform = "scaleX(" + r + ")";
      if (a && a.duration) { var t = r * a.duration; cur.textContent = _jcFmtTime(t); }
    }
    function onUp(ev) {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      track.classList.remove("dragging");
      var rect = track.getBoundingClientRect();
      var r = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      if (a && a.duration) { a.currentTime = r * a.duration; }
    }
    onMove(e);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });

  // 左右滑切换
  var photo = document.getElementById("jc-story-photo");
  var swipeStart = null;
  photo.addEventListener("pointerdown", function(e) { swipeStart = {x: e.clientX, y: e.clientY}; });
  photo.addEventListener("pointerup", function(e) {
    if (!swipeStart) return;
    var dx = e.clientX - swipeStart.x, dy = e.clientY - swipeStart.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < -30) _jcNavStop(1);
      else if (dx > 30) _jcNavStop(-1);
    }
    swipeStart = null;
  });

  // 渲染当前 stop
  _jcRenderStop();

  // 初始化音频
  _jcEnsureCtx();
  var audio = journey.audio;
  if (audio && audio.url) {
    _jcAudioLoad(audio.url, function(ok) {
      if (_JC.story.dead) return;
      if (ok) {
        var dur = document.getElementById("jc-story-dur");
        var a = _JC.audio.el;
        if (dur && a) dur.textContent = _jcFmtTime(a.duration || audio.dur || 0);
        if (a) {
          // 设置 artist/title
          var songEl = document.getElementById("jc-story-song");
          var artistEl = document.getElementById("jc-story-artist");
          if (songEl) songEl.textContent = audio.title || "";
          if (artistEl) artistEl.textContent = audio.artist || "";
        }
        _jcAudioPlay();
      }
    });
  }
}

function _jcCloseStory() {
  _jcClearTimers();
  _jcAudioStop();
  _JC.story.dead = true;
  var overlay = document.getElementById("jc-story-overlay");
  if (overlay) { overlay.remove(); }
  document.body.style.overflow = "";
}

function _jcRenderStop() {
  _jcClearTimers();
  var j = _JC.story.journey;
  if (!j) return;
  var s = j.stops[_JC.story.idx];
  if (!s) return;

  // 背景照片
  var bg = document.getElementById("jc-story-bg");
  if (bg) {
    bg.style.backgroundImage = "url(\"" + (s.src || "") + "\")";
    // 重启 Ken Burns
    bg.style.animation = "none";
    void bg.offsetWidth;
    bg.style.animation = "";
  }

  // 顶部信息
  var en = document.getElementById("jc-story-en");
  var place = document.getElementById("jc-story-place");
  var date = document.getElementById("jc-story-date");
  if (en) en.textContent = s.placeEn || "";
  if (place) place.textContent = s.place || "";
  if (date) date.textContent = s.date || "";

  // 念白
  var narr = document.getElementById("jc-story-narr");
  var line = document.getElementById("jc-story-narr-line");
  var settled = document.getElementById("jc-story-settled");
  var note = document.getElementById("jc-story-note");
  var moreBtn = document.getElementById("jc-story-more");

  if (narr) narr.style.display = "";
  if (settled) settled.style.display = "none";
  if (line) line.className = "jc-story-narr-line";
  if (note) { note.textContent = ""; note.className = "jc-story-settled-note expanded"; }
  if (moreBtn) moreBtn.style.display = "none";

  var text = _jcFill(s.note || "");
  _jcAudioDuck(true);

  _JC.story.timers = _jcTypewriter(text, {
    schedule: function(fn, ms) {
      var id = setTimeout(fn, ms);
      _JC.story.timers.push(id);
      return id;
    },
    onChar: function(html) {
      if (_JC.story.dead) return;
      if (line) line.innerHTML = html;
    },
    onDone: function() {
      if (_JC.story.dead) return;
      _jcOnNarrDone(text);
    }
  });

  // 圆点
  _jcRenderDots();
}

function _jcOnNarrDone(fullText) {
  var narr = document.getElementById("jc-story-narr");
  var line = document.getElementById("jc-story-narr-line");
  var settled = document.getElementById("jc-story-settled");
  var note = document.getElementById("jc-story-note");
  var moreBtn = document.getElementById("jc-story-more");
  var placeBtn = document.getElementById("jc-story-place");

  // 念白淡出
  if (line) line.classList.add("out");
  _jcLater(function() {
    if (narr) narr.style.display = "none";
    if (settled) settled.style.display = "";
    if (note) note.textContent = fullText;
    // 判断是否需要展开按钮
    if (note) {
      // 量真实高度
      var clone = note.cloneNode(true);
      clone.style.position = "absolute"; clone.style.visibility = "hidden";
      clone.style.maxHeight = "none"; clone.style.webkitLineClamp = "unset";
      clone.style.display = "block";
      document.body.appendChild(clone);
      var fullH = clone.scrollHeight;
      clone.remove();
      // 4 行约 85px
      if (fullH > 90 && moreBtn) {
        moreBtn.style.display = "";
        moreBtn.textContent = "展开全部 ↓";
        note.className = "jc-story-settled-note";
        moreBtn.onclick = function() {
          if (note.className.indexOf("expanded") >= 0) {
            note.className = "jc-story-settled-note";
            moreBtn.textContent = "展开全部 ↓";
          } else {
            note.className = "jc-story-settled-note expanded";
            moreBtn.textContent = "收起 ↑";
          }
        };
      }
    }
    if (placeBtn) {
      placeBtn.innerHTML = placeBtn.textContent + '<span class="jc-replay-hint">↺</span>';
    }
  }, 550);

  _jcAudioDuck(false);
}

function _jcReplayNarration() {
  var j = _JC.story.journey;
  if (!j) return;
  var s = j.stops[_JC.story.idx];
  if (!s) return;

  var narr = document.getElementById("jc-story-narr");
  var line = document.getElementById("jc-story-narr-line");
  var settled = document.getElementById("jc-story-settled");
  var placeBtn = document.getElementById("jc-story-place");
  var text = _jcFill(s.note || "");

  // 重置 UI
  if (settled) settled.style.display = "none";
  if (narr) narr.style.display = "";
  if (line) { line.className = "jc-story-narr-line"; line.innerHTML = ""; }
  if (placeBtn) placeBtn.innerHTML = (s.place || "");

  _jcAudioDuck(true);
  _JC.story.timers = _jcTypewriter(text, {
    schedule: function(fn, ms) {
      var id = setTimeout(fn, ms);
      _JC.story.timers.push(id);
      return id;
    },
    onChar: function(html) { if (!_JC.story.dead && line) line.innerHTML = html; },
    onDone: function() { if (!_JC.story.dead) _jcOnNarrDone(text); }
  });
}

function _jcRenderDots() {
  var dots = document.getElementById("jc-story-dots");
  if (!dots) return;
  var j = _JC.story.journey;
  if (!j) return;
  dots.innerHTML = "";
  j.stops.forEach(function(s, i) {
    var span = document.createElement("span");
    if (i === _JC.story.idx) span.className = "on";
    span.onclick = function() { _jcNavStop(i - _JC.story.idx); };
    dots.appendChild(span);
  });
}

function _jcNavStop(delta) {
  var j = _JC.story.journey;
  if (!j) return;
  var n = j.stops.length;
  var newIdx = ((_JC.story.idx + delta) % n + n) % n;
  if (newIdx === _JC.story.idx) return;
  _JC.story.idx = newIdx;
  _jcRenderStop();
}

// ══════════════════════════════════════════════════════════════
// 聊天卡片渲染
// 由 renderMessage 调用：检测 <journey> 标签，替换为卡片 HTML
// ══════════════════════════════════════════════════════════════

// 存储已加载的 journey 数据缓存
_JC.cache = {};

// 解析消息正文中的 <journey> 标签，返回 {parts: [{type:"text"|"journey", ...}]}
_JC.parseJourneyTags = function(body) {
  if (!body) return [{type: "text", text: ""}];
  var parts = [];
  var re = /<journey>([\s\S]*?)<\/journey>/g;
  var lastIdx = 0, m;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIdx) parts.push({type: "text", text: body.slice(lastIdx, m.index)});
    try {
      var data = JSON.parse(m[1]);
      parts.push({type: "journey", id: data.id});
    } catch(e) {
      parts.push({type: "text", text: m[0]});
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < body.length) parts.push({type: "text", text: body.slice(lastIdx)});
  return parts.length ? parts : [{type: "text", text: body}];
};

// 拉取 journey 数据
_JC.fetchJourney = function(id) {
  if (_JC.cache[id]) return Promise.resolve(_JC.cache[id]);
  return api("/api/journeys/" + id).then(function(r) { return r.json(); }).then(function(data) {
    _JC.cache[id] = data.journey || data;
    return _JC.cache[id];
  });
};

// 渲染卡片 HTML（不包含数据拉取，由调用方传入 journey 对象）
_JC.renderCard = function(journey) {
  var stops = journey.stops || [];
  var title = _jcEscape(journey.title || "加载中…");
  if (!stops.length) {
    // Loading 骨架
    return '<div class="jc-card" data-jc-id="' + _jcEscape(journey.id || "") + '" data-jc-loading="1">' +
      '<div class="jc-card-head">' +
        '<div class="jc-card-kicker">JOURNEYS</div>' +
        '<div class="jc-card-title">' + title + '</div>' +
        '<div class="jc-card-sub">加载中…</div>' +
      '</div>' +
      '<div class="jc-card-stage"><div class="jc-rail" style="justify-content:center;gap:8px">' +
        [1,2,3,4,5,6].map(function() {
          return '<div class="jc-rail-item" style="background:rgba(128,128,128,0.15);animation:jcPulse 1.5s ease-in-out infinite"></div>';
        }).join("") +
      '</div></div>' +
      '<div class="jc-card-hint">正在加载旅行…</div>' +
    '</div>';
  }

  var title = _jcEscape(journey.title || "");
  var titleEn = _jcEscape(journey.titleEn || "");
  var year = _jcEscape(journey.year || "");
  var hint = _jcEscape((journey.hint && journey.hint.trim()) ? journey.hint.trim() : "点开任意一张，进去走一遍。");
  var cover = journey.cover || (stops[0] && stops[0].src) || "";

  var bars = stops.map(function(s, i) {
    var src = s.src || "";
    var place = _jcEscape(s.place || "");
    return '<button class="jc-rail-item" data-jc-stop="' + i + '" ' +
      'style="background-image:url(&quot;' + _jcEscape(assetUrl(src)) + '&quot;)" ' +
      'aria-label="' + place + '">' +
      '<span class="jc-rail-item-label">' + place + '</span></button>';
  }).join("");

  var idAttr = _jcEscape(journey.id || "");

  return '<div class="jc-card" data-jc-id="' + idAttr + '">' +
    '<div class="jc-card-head">' +
      '<div class="jc-card-kicker">JOURNEYS</div>' +
      '<div class="jc-card-title">Claude 带粥粥去了' + title + '</div>' +
      '<div class="jc-card-sub">' + year + (year&&stops.length?' · ':'') + stops.length + ' 处停留</div>' +
    '</div>' +
    '<div class="jc-card-stage"><div class="jc-rail">' + bars + '</div></div>' +
    '<div class="jc-card-hint">' + hint + '</div>' +
  '</div>';
};

// 绑定卡片点击事件（在消息渲染后调用）
_JC.bindCards = function(container) {
  if (!container) container = document;
  container.querySelectorAll(".jc-card").forEach(function(card) {
    if (card.dataset.jcBound) return;
    card.dataset.jcBound = "1";
    // 照片条点击
    card.querySelectorAll(".jc-rail-item").forEach(function(bar) {
      bar.addEventListener("click", function(e) {
        e.stopPropagation();
        var id = card.dataset.jcId;
        var idx = parseInt(bar.dataset.jcStop, 10) || 0;
        _JC.openCard(id, idx);
      });
    });
    // 磁力轮播（桌面端鼠标）
    _jcBindMagnetic(card);
  });
};

// 打开卡片：拉数据 → 开浮层
_JC.openCard = function(id, startIdx) {
  _JC.fetchJourney(id).then(function(journey) {
    _jcOpenStory(journey, startIdx);
  }).catch(function(e) {
    console.warn("Journey load failed:", id, e);
  });
};

// 磁力轮播
function _jcBindMagnetic(card) {
  if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var row = card.querySelector(".jc-rail");
  if (!row || row.dataset.jcMag) return;
  row.dataset.jcMag = "1";
  row.classList.add("is-magnetic");

  var COL_W = 44, HOV_W = 96, COL_H = 188, HOV_H = 276, GAP = 8, INFLUENCE = 118;
  var SHADOW_REST = "0 6px 16px -8px rgba(30,20,5,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)";
  var SHADOW_LIFT = "0 22px 40px -14px rgba(30,20,5,0.75), inset 0 0 0 1px rgba(255,255,255,0.14)";

  row.addEventListener("pointermove", function(e) {
    var rect = row.getBoundingClientRect();
    var cx = e.clientX - rect.left;
    var bars = row.querySelectorAll(".jc-rail-item");
    var n = bars.length;
    var startX = (rect.width - (n * COL_W + (n - 1) * GAP)) / 2;
    bars.forEach(function(bar, i) {
      var center = startX + i * (COL_W + GAP) + COL_W / 2;
      var f = Math.max(0, 1 - Math.abs(cx - center) / INFLUENCE);
      f = f * f * (3 - 2 * f);
      bar.style.width  = (COL_W + (HOV_W - COL_W) * f) + "px";
      bar.style.height = (COL_H + (HOV_H - COL_H) * f) + "px";
      bar.style.boxShadow = f > 0.5 ? SHADOW_LIFT : SHADOW_REST;
      bar.style.zIndex = f > 0.02 ? String(2 + Math.round(f * 10)) : "1";
      var label = bar.querySelector(".jc-rail-item-label");
      if (label) label.style.opacity = f > 0.4 ? (f - 0.4) / 0.6 : 0;
    });
  });
  row.addEventListener("pointerleave", function() {
    row.querySelectorAll(".jc-rail-item").forEach(function(bar) {
      bar.style.width = COL_W + "px"; bar.style.height = COL_H + "px";
      bar.style.boxShadow = SHADOW_REST; bar.style.zIndex = "1";
      var label = bar.querySelector(".jc-rail-item-label");
      if (label) label.style.opacity = "0";
    });
  });
}
