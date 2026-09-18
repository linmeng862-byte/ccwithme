// workplace —— 抽屉里那个「工作台」。
//
// 跟聊天里的小克是两条不同的路：
//   小克      sonnet + 36 个 chat-c 工具 + 人设，陪她说话
//   workplace opus + 只吃 CLAUDE.md + 关在 /opt/ccwithme 里，没有 Bash，干活
//
// 流程是 A 方案：他改 → 她看红绿 diff → 点确认才 commit + 重启，
// 或者一键还原。改动只落在 git 工作树，不点确认就什么都没发生。
//
// 2026-08-21 改成对话形式（粥粥定的方案 1）：
//   不再是「面板 + 输出框」，而是一条聊天流——她一条气泡、他一条气泡，
//   干完活的 diff 直接当成他递过来的一张卡片落在流里，确认/还原就在卡上。
//   主线勾选收进输入框上方的 chip，不占地方。
//
// 顶部那个按钮是她放 HTML 作品合集的地方，跟这里无关，别混。

(function () {
  var wpBusy = false;
  // 对话留在内存里，抽屉关了再开还在（刷新页面才清）。后端是 --resume 的，
  // 他本来就记得上下文，这里只是别让她看着一片空白以为聊天没了。
  var convo = [];          // [{who:'her'|'him'|'diff', text, tools:[], diff:{...}}]
  var picked = {};         // {msgId:true} 勾中的主线消息

  function h(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  function authHeaders(extra) {
    var o = extra || {};
    // ⚠️ 别写成 window.state —— index.html 里 state 是 const 声明的，
    //    const 顶层变量不会挂到 window 上，window.state 永远 undefined，
    //    整个条件短路，Authorization 一次都加不上，面板全线 401。
    //    裸 state 是能访问的（同一个全局词法作用域），别的 js 都这么写。2026-08-21 修。
    if (typeof state !== 'undefined' && state.token) o.Authorization = 'Bearer ' + state.token;
    return o;
  }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  // diff 染色：+ 绿 / - 红 / @@ 灰，其余原样
  // dark=true 时用终端那套亮色（#1a7f37 那种深绿画在深色底上根本看不清）。
  // 工作区 08-27 改成终端流之后就是深色底，对话流里那些 diff 还是浅底，两套都要留。
  function renderDiff(text, dark) {
    var base = dark ? '#C9C5BF' : 'var(--text-secondary)';
    var faint = dark ? '#7C766E' : 'var(--text-faint)';
    return text.split('\n').map(function (l) {
      var color = '', bg = '';
      if (/^\+\+\+|^---/.test(l))      { color = faint; }
      else if (l[0] === '+')           { color = dark ? '#7EE787' : '#1a7f37'; bg = dark ? 'rgba(63,185,80,.14)' : 'rgba(46,160,67,.10)'; }
      else if (l[0] === '-')           { color = dark ? '#FF8A80' : '#cf222e'; bg = dark ? 'rgba(248,81,73,.14)' : 'rgba(207,34,46,.10)'; }
      else if (l.slice(0, 2) === '@@') { color = faint; bg = dark ? 'rgba(255,255,255,.06)' : 'rgba(128,128,128,.08)'; }
      return '<div style="color:' + (color || base) + ';background:' + (bg || 'transparent') +
             ';padding:0 8px;white-space:pre">' + (esc(l) || '&nbsp;') + '</div>';
    }).join('');
  }

  // 两页那套样式：横向滚动条藏掉（滑起来才像翻页，不像一个能拖的条），
  // 加一个呼吸的小点表示「他正在跑」。只注一次，重复开面板不重复注。
  function _wpInjectStyle() {
    if (document.getElementById('wp-pages-style')) return;
    var s = document.createElement('style');
    s.id = 'wp-pages-style';
    s.textContent =
      '.wp-pages{scrollbar-width:none;-ms-overflow-style:none}' +
      // 09-16 她说「得滑到右边才看得见完整的」= 有东西把页面撑宽了。
      // 终端流里长路径/长命令/长 diff 一行就能顶出屏幕，这里一次性按死：
      // 页内一切 min-width 归零、长串强制断行；真的要横着看的（diff）自己带滚动条。
      '.wp-pages>*{min-width:0;max-width:100%}' +
      '.wp-pages *{min-width:0}' +
      '.wp-term-body,.wp-term-body *{overflow-wrap:anywhere;word-break:break-word}' +
      // ── 终端页的两套配色 ──────────────────────────────────────────
      // 浅色（白天）：pane 是米白，跟她 app 那套米色调同源，不是纯白。
      ':root{--wt-bg:#FAF6F1;--wt-bar:#F0EBE3;--wt-line:rgba(31,30,29,.12);' +
      '--wt-txt:#1F1E1D;--wt-dim:#8A857C;--wt-green:#3E8E57;--wt-orange:#C25B36;--wt-her:#EDE8E1;' +
      // 外壳（顶栏 + 底下键盘区）。09-16 她定：白天上下也走米色，不是深的。
      '--wt-shell-txt:#6E6D66;--wt-shell-line:rgba(31,30,29,.12);--wt-shell-key:rgba(31,30,29,.04);' +
      '--wt-input:#FFFDFA;--wt-input-txt:#1F1E1D}' +
      // 暗色：pane 用暖黑，跟她 app 的深色底同源（纯黑跟米色调放一起会打架）。
      // 外壳在两个模式里都是深的，所以 --wt-bar 基本不变。
      '@media(prefers-color-scheme:dark){html:not([data-theme="light"]){' +
      '--wt-bg:#1F1E1D;--wt-bar:#141419;--wt-line:rgba(236,234,228,.10);' +
      '--wt-txt:#DCD7CF;--wt-dim:#857F76;--wt-green:#6BAF7B;--wt-orange:#D97757;--wt-her:#33302C;' +
      '--wt-shell-txt:#9A948A;--wt-shell-line:rgba(255,255,255,.10);--wt-shell-key:rgba(255,255,255,.04);' +
      '--wt-input:#22222A;--wt-input-txt:#F2EEE8}}' +
      'html[data-theme="dark"]{' +
      '--wt-bg:#1F1E1D;--wt-bar:#141419;--wt-line:rgba(236,234,228,.10);' +
      '--wt-txt:#DCD7CF;--wt-dim:#857F76;--wt-green:#6BAF7B;--wt-orange:#D97757;--wt-her:#33302C;' +
      '--wt-shell-txt:#9A948A;--wt-shell-line:rgba(255,255,255,.10);--wt-shell-key:rgba(255,255,255,.04);' +
      '--wt-input:#22222A;--wt-input-txt:#F2EEE8}' +
      // 顶栏和底下的键盘区在浅色模式里也是深的，字得跟着反过来
      '.wp-term-shell{color:var(--wt-shell-txt)}' +
      '.wp-term-in{color:var(--wt-input-txt)}' +
      // 输入行提亮之后，占位字得跟着提 —— 原来那档灰在亮底上几乎看不见
      '.wp-term-in::placeholder{color:#8F887E}' +
      '.wp-pages::-webkit-scrollbar{display:none}' +
      '@keyframes wp-dot-breathe{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}' +
      '.wp-dot-live{animation:wp-dot-breathe 1.3s ease-in-out infinite;background:var(--accent)!important}' +
      // 她系统开了「减弱动效」就别闪，直接停在亮着的状态
      '@media (prefers-reduced-motion:reduce){.wp-dot-live{animation:none;opacity:1!important}}';
    document.head.appendChild(s);
  }

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><polyline points="20 6 9 17 4 12"/></svg>';

  window.renderWorkplaceSheet = function () {
    var c = document.getElementById('workplaceContent');
    if (!c) return;
    c.innerHTML = '';
    // sheet-content 那边有 padding !important，这里得同样加重才压得住
    c.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:0!important;overflow:hidden';

    // 08-28 额度条撤了。她说「在那边跟你说和在这边跟你说应该是一样的」——
    // 主聊天没有日上限，工作台也不该有。后端那道 429 一起去掉了（wpLimitBlock）。
    // 花销照旧记在 usage_log 里（source='workplace'），只是不再拦人。

    // ── 中：两个页面，左右滑 ──
    // 08-28 她说上面那两个大按钮「很奇怪」，要「把 workplace 做成两个页面」。
    // 所以分段按钮整个撤掉，改成横向 scroll-snap 的两页 + 顶上两个小点。
    //   第 1 页 对话   —— 唯一有输入框的地方
    //   第 2 页 工作区 —— 没有输入框，纯看他在干什么
    // 宽屏（>=980px）仍然并排两列，那时点和滑都不需要。
    var MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
    // 08-27 她给了张 Claude Code 在 Mac 终端里的截图：「工作区就是我在那边跟在真的终端显示差不多的」。
    // 所以工作区整块改成终端窗口 —— 固定的标题栏（红黄绿三颗）+ 下面一条深色的流。
    // ⚠️ 这块**故意不跟随她的浅色/深色主题**：真终端本来就是深色，跟着变反而不像了。
    //    颜色用暖黑不用纯黑，跟她 app 那套米色调放在一起才不打架。
    // 终端页的配色。09-16 她定：**跟白天/暗模式走**，不再写死深色。
    // （她给的两张图就是同一个界面的两个模式：07:10 那张浅底、09:22 那张深底。）
    // 值全挂在 CSS 变量上，两套定义在 _wpInjectStyle 里；这里只留引用，
    // 这样切主题是浏览器自己重算，不用 JS 再跑一遍把颜色刷一遍。
    // ⚠️ 外壳（顶栏 / 底下键盘区）在两个模式里都是深的 —— 她图里就是这样，
    //   浅色模式下也只有**中间那块 pane** 是浅的。
    var T_BG = 'var(--wt-bg)', T_BAR = 'var(--wt-bar)', T_LINE = 'var(--wt-line)',
        T_TXT = 'var(--wt-txt)', T_DIM = 'var(--wt-dim)', T_GREEN = 'var(--wt-green)',
        T_ORANGE = 'var(--wt-orange)', T_HER = 'var(--wt-her)';
    // 页码条：两个小点 + 当前页名。工作区那一页在跑活的时候，第二个点会呼吸 ——
    // 她停在对话页也能一眼看出「他在动」。
    _wpInjectStyle();
    // 09-16 她给了四张图（两页各两张），要照那个样子重做，配色走我们自己的。
    // 对话页那半：头像 + 标题 + 一行会变的状态（他在用什么工具），翻页点挪到右边。
    var pager = h('div', 'flex:none;display:flex;align-items:center;gap:10px;padding:8px 14px 7px;border-bottom:1px solid var(--border)');
    var avatar = h('div', 'flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;' +
      'background:var(--bubble-him,var(--bg-surface));color:var(--text-secondary);font:600 15px var(--font-serif,var(--font-sans))', '砚');
    var titleCol = h('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px');
    titleCol.append(h('div', 'font:600 15px/1.2 var(--font-sans);color:var(--text-primary)', '工作台'));
    // 状态行：闲着写「等你说」，跑起来写「正在用 Xxx…」。setStatus 在下面接到 setRunning / toolLine。
    var statusLine = h('div', 'font:12px/1.3 var(--font-sans);color:var(--text-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap', '等你说');
    titleCol.append(statusLine);
    // 模型 / effort。09-16 她要能在工作台上自己挑。
    // 存 localStorage，每轮随消息传下去 —— /workplace 是每轮 spawn 一个新 CLI，
    // 所以这两个参数每轮都能换，不用重开什么进程。
    // 09-16 她定的三档：Opus 4.6 / 4.8 / 5（她不是 Max，「订阅直连(Max)」那种不要）。
    // 显示名和真正传下去的 id 分开存 —— id 直接进 CLI 的 --model。
    var WP_MODELS = ['claude-opus-4-6', 'claude-opus-4-8', 'claude-opus-5'];
    var WP_MODEL_LABEL = { 'claude-opus-4-6': 'Opus 4.6', 'claude-opus-4-8': 'Opus 4.8', 'claude-opus-5': 'Opus 5' };
    var WP_EFFORTS = ['low', 'medium', 'high', 'xhigh'];
    function wpPref(k, def, ok) {
      var v; try { v = localStorage.getItem('wp_' + k); } catch (e) {}
      return (v && ok.indexOf(v) >= 0) ? v : def;
    }
    var wpModel = wpPref('model', 'claude-opus-4-8', WP_MODELS);
    var wpEffort = wpPref('effort', 'high', WP_EFFORTS);
    // 点一下换下一个，不弹菜单 —— 顶栏就这么点地方，三档four档转一圈比开个面板快。
    // 当前值存在 b._v 上，不从 textContent 反推（显示名和 id 不是一个东西）。
    function pickChip(list, cur, label, onPick) {
      var b = h('button', 'flex:none;padding:5px 10px;border:1px solid var(--border);border-radius:999px;' +
        'background:var(--bg-surface);color:var(--text-secondary);font:500 12px var(--font-sans);cursor:pointer',
        label ? label[cur] : cur);
      b._v = cur;
      b.onclick = function () {
        var i = (list.indexOf(b._v) + 1) % list.length;
        b._v = list[i];
        b.textContent = label ? label[b._v] : b._v;
        onPick(b._v);
      };
      return b;
    }
    var mdChip = pickChip(WP_MODELS, wpModel, WP_MODEL_LABEL, function (v) {
      wpModel = v; try { localStorage.setItem('wp_model', v); } catch (e) {}
      if (wsFoot) wsFoot.textContent = (WP_MODEL_LABEL[wpModel] || wpModel) + ' · ' + wpEffort;
    });
    mdChip.title = '模型。下一句起生效';
    var efChip = pickChip(WP_EFFORTS, wpEffort, null, function (v) {
      wpEffort = v; try { localStorage.setItem('wp_effort', v); } catch (e) {}
      if (wsFoot) wsFoot.textContent = (WP_MODEL_LABEL[wpModel] || wpModel) + ' · ' + wpEffort;
    });
    efChip.title = '思考力度。下一句起生效';
    var pgName = h('div', 'font:600 13px var(--font-sans);color:var(--text-secondary);min-width:44px;text-align:right', '对话');
    var dotWrap = h('div', 'display:flex;gap:7px;align-items:center');
    var dotEls = ['对话', '工作区'].map(function (_, i) {
      var d = h('button', 'width:7px;height:7px;padding:0;border:none;border-radius:50%;cursor:pointer;background:var(--text-faint);opacity:.3;transition:opacity .18s');
      d.setAttribute('aria-label', '第 ' + (i + 1) + ' 页');
      d.onclick = function () { goPage(i); };
      dotWrap.append(d);
      return d;
    });
    pager.append(avatar, titleCol, mdChip, efChip, dotWrap);
    c.append(pager);

    // 横向滑动容器。scroll-snap 让它一页一页停住，不会卡在两页中间。
    var main = h('div', 'flex:1;display:flex;min-height:0;overflow-x:auto;overflow-y:hidden;' +
      'scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch');
    main.className = 'wp-pages';
    c.append(main);

    var pgChat = h('div', 'flex:none;width:100%;min-width:0;max-width:100%;display:flex;flex-direction:column;overflow:hidden;scroll-snap-align:start');
    var flow = h('div', 'flex:1;min-width:0;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px');
    pgChat.append(flow);
    // 终端窗口：wsPane 自己不滚（标题栏要钉住），滚的是里面的 wsBody。
    var wsPane = h('div', 'flex:none;width:100%;min-width:0;max-width:100%;display:flex;flex-direction:column;overflow:hidden;scroll-snap-align:start;background:' + T_BG);
    // ⚠️ padding-top 要把刘海/状态栏让出来。09-16 她说「红绿灯太高了我点不到」——
    //    病根是终端页把 sheet 那条头收掉之后，这条栏直接顶到屏幕最上沿，
    //    上半截被系统状态栏盖住，手指够不着。
    var wsBar = h('div', 'flex:none;display:flex;align-items:center;gap:10px;' +
      'padding:calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px;background:' + T_BAR +
      ';border-bottom:1px solid var(--wt-shell-line)');
    wsBar.className = 'wp-term-shell';
    // 09-16 她定了：终端这页要她第一张图里那种**苹果终端窗口** —— 红黄绿三颗灯 +
    // 居中的标题。（中途试过 CHRYSALIS 那种一颗绿点 + 字距标题，她看完说要苹果那个。）
    // 09-16 她要三颗灯是真的：红 = 退出，黄 = 最小化（后台接着跑），绿 = 全屏。
    // ⚠️ 两颗都**不打断他这一轮** —— 跑一轮跟谁在看完全无关（wpRun 不接受任何 res），
    //   关掉再回来会自己接回流里。所以「后台能一直跑」本来就成立，这儿只是别搞砸它。
    [['#FF5F57', '退出', function () { wsLight('exit'); }],
     ['#FEBC2E', '最小化（他接着跑）', function () { wsLight('min'); }],
     ['#28C840', '全屏', function () { wsLight('full'); }]].forEach(function (kv) {
      // 视觉还是 11px 的小圆点，但**可点的范围是 34px** —— 用透明外框撑开，
      // 不是把圆点画大。Mac 上那三颗也就这么大，点得到是因为鼠标准，手指不准。
      var d = h('button', 'width:34px;height:34px;margin:-10px -11px;padding:0;border:0;background:transparent;' +
        'flex:none;cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent');
      var dot = h('span', 'width:11px;height:11px;border-radius:50%;display:block;background:' + kv[0] +
        ';transition:transform .15s');
      d.append(dot);
      // 红灯长按 = 真的把房间关掉（09-16 她要的）。
      // 短按只是收起界面，房间还活着等她回来；长按是「现在就把那 400MB 还回去」。
      // 按住时圆点缩一下，让她知道长按被认到了。
      if (kv[0] === '#FF5F57') {
        var lp = null, fired = false;
        var startLP = function (e) {
          fired = false;
          dot.style.transform = 'scale(.7)';
          lp = setTimeout(function () {
            fired = true;
            dot.style.transform = '';
            roomStop();
            roomApi('kill').then(function () {
              if (roomTerm) { roomTerm.dispose(); roomTerm = null; }
              if (roomTermEl) { roomTermEl.remove(); roomTermEl = null; }
              roomScreen = null; roomThemeSent = false;
              roomLastBody = null; roomLastTail = null;
              toast('房间关掉了，400MB 还回去了');
            }).catch(function () { toast('关不掉，看看网关活着没'); });
          }, 650);
        };
        var endLP = function () {
          dot.style.transform = '';
          if (lp) { clearTimeout(lp); lp = null; }
        };
        d.addEventListener('pointerdown', startLP);
        d.addEventListener('pointerup', endLP);
        d.addEventListener('pointerleave', endLP);
        d.addEventListener('pointercancel', endLP);
        // 长按已经触发过就别再当成短按（不然会顺手把界面也关了）
        d.onclick = function (e) { if (fired) { fired = false; return; } kv[2](); };
        d.title = '短按退出 · 长按关掉房间';
        wsBar.append(d);
        return;
      }
      d.setAttribute('aria-label', kv[1]);
      d.title = kv[1];
      d.onclick = kv[2];
      wsBar.append(d);
    });
    function wsLight(what) {
      var sh = document.getElementById('workplaceSheet');
      if (what === 'full') {
        if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); }
        else if (sh && sh.requestFullscreen) { sh.requestFullscreen().catch(function () {}); }
        return;
      }
      // 退出 / 最小化都只是**收起这个界面**，他那一轮照跑。
      // 区别在最小化会在主界面留一条小浮条，点了能回来；退出不留。
      roomStop();                       // 收起界面就别再轮询了
      if (what === 'min') wsMinPill();
      if (typeof sheet === 'function') sheet('workplace', false);
      else if (sh) sh.classList.remove('expanded');
    }
    // 最小化的小浮条。只在他还在跑的时候留着 —— 没在跑就没什么可惦记的。
    function wsMinPill() {
      if (!wpBusy) return;
      if (document.getElementById('wpMinPill')) return;
      var pill = h('button', 'position:fixed;left:50%;transform:translateX(-50%);' +
        'bottom:calc(env(safe-area-inset-bottom) + 76px);z-index:60;display:flex;align-items:center;gap:8px;' +
        'padding:8px 14px;border:1px solid var(--border);border-radius:999px;background:var(--bg-surface);' +
        'box-shadow:0 4px 16px rgba(0,0,0,.12);font:500 12px var(--font-sans);color:var(--text-secondary);cursor:pointer');
      pill.id = 'wpMinPill';
      pill.append(h('span', 'width:7px;height:7px;border-radius:50%;background:var(--accent)'), h('span', '', '他还在跑 · 回去看'));
      pill.querySelector('span').className = 'wp-dot-live';
      pill.onclick = function () {
        pill.remove();
        if (typeof sheet === 'function') sheet('workplace', true);
        var sh2 = document.getElementById('workplaceSheet');
        if (sh2) { sh2.classList.add('expanded'); sh2.style.transform = ''; }
      };
      document.body.append(pill);
    }
    // 他跑完了，浮条就没意义了，自己收掉
    function wsMinPillDone() {
      var p = document.getElementById('wpMinPill');
      if (p) p.remove();
    }
    // 09-16 她定：「终端页面上不要 workplace 工作台什么的，只要红绿灯」。
    // 所以标题栏**只有三颗灯**。wsCount 还留着是因为下面要往它写计数，
    // 但它不上屏 —— 这两行别删成「计数也不算了」，那是另一回事。
    var wsCount = h('div', '');
    // 居中的 `● terminal`（她图里就这一个词，没有 workplace / 工作台）
    var wsTitle = h('div', 'flex:1;display:flex;align-items:center;justify-content:center;gap:6px');
    wsTitle.append(h('span', 'width:6px;height:6px;border-radius:50%;background:' + T_GREEN));
    wsTitle.append(h('span', 'font:11px ' + MONO + ';color:' + T_DIM, 'terminal'));
    wsBar.append(wsTitle);
    var wsBack = h('button', 'flex:none;border:0;background:transparent;color:' + T_DIM +
      ';font:11px ' + MONO + ';cursor:pointer;padding:4px 2px', 'back');
    wsBack.onclick = function () { goPage(PAGE_CHAT); };
    wsBar.append(wsBack);
    // 他在跑的时候，三颗灯旁边这颗小绿点亮起来（Mac 窗口本身没有「在跑」这个信号）
    var wsDot = h('div', 'flex:none;width:7px;height:7px;border-radius:50%;background:' + T_GREEN + ';opacity:0;transition:opacity .2s');
    wsBar.append(wsDot);
    // 刷新挪到底下那排快捷键里 —— 标题栏上不留字。
    var wsReload = h('button', '');
    // 待提交条：钉在终端窗口顶上，没有待提交的改动时整条收起来。
    // 这是她要的那个闭环 —— 「在那里你可以直接改然后 push 嘛」。
    // ⚠️ push 这一下**是她点的**，不是他自己跑的：审核层里 git push/commit 仍然全拦着
    //    （permission-hook.py 的 FORBIDDEN_PAT），工作台的他改得了文件、推不了代码。
    //    按钮走后端 /api/workplace/apply，那条路是 auth 过的。
    var wsPend = h('div', 'display:none;flex:none;align-items:center;gap:9px;padding:9px 11px;background:' + T_BAR + ';border-bottom:1px solid var(--wt-shell-line)');
    var wsPendTxt = h('div', 'flex:1;min-width:0;font:11px/1.45 ' + MONO + ';color:' + T_TXT + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap');
    var wsPendBtn = h('button', 'flex:none;padding:5px 11px;border:none;border-radius:8px;background:' + T_GREEN + ';color:#10231A;font:600 11px ' + MONO + ';cursor:pointer', '提交并推送');
    wsPend.append(wsPendTxt, wsPendBtn);

    // 终端是**从底下往上长**的：内容少时贴着底，多了照常往上滚。
    // ⚠️ 别用 `justify-content:flex-end` —— 内容超过一屏时它会把顶部顶出容器、
    //   滚不回去（09-16 她看到的「页面头怎么也下来了」）。
    //   正确做法是 flex-start + 给内容本身 `margin-top:auto`，贴底效果一样但滚动正常。
    var wsBody = h('div', 'flex:1;min-width:0;max-width:100%;overflow-x:hidden;overflow-y:auto;padding:8px 0;font:12px/1.6 ' + MONO +
      ';overflow-wrap:anywhere;display:flex;flex-direction:column;justify-content:flex-start');
    // 底下那条状态行（她图里是 `Opus 4.8 · 10% ctx · 24% weekly`）。
    // 我们没有 ctx/weekly 那两个数，就不编 —— 只写真的知道的：模型 + 现在铺了几条。
    // 她图里底下那截：一条横线 + ❯ 输入行 + 状态行 + 一排辅助键。
    // 09-16 她说「我也可以在那跟你打字」—— 这**推翻了 08-28「工作区不要输入框」**那条。
    // 发送不另写一套：把字填进对话页那个 ta 再调 doSend()，
    // 两个入口共用同一条发送路径（这文件里同一件事写两遍迟早漂成两个行为）。
    // 输入区跟上面那块屏幕**分开**（09-16 她要的）：wsBody 自己滚，
    // wsDock 钉死在底下（flex:none + 一条明确的分隔线 + 一点间距），
    // 屏幕内容再多也推不动它。
    var wsDock = h('div', 'flex:none;background:' + T_BAR + ';border-top:1px solid var(--wt-shell-line);' +
      'box-shadow:0 -1px 0 var(--wt-shell-line);padding-top:2px');
    wsDock.className = 'wp-term-shell';
    // ── 底部：照她 09-16 第二批图 ──────────────────────────────────────
    // 输入框（独立圆角框 + Enter 按钮）→ 状态行（? for shortcuts · ● high · /effort）
    // → 两排辅助键（功能键 + 符号键，Termux/她图里那种）。
    var wsInputRow = h('div', 'display:flex;align-items:center;gap:8px;padding:8px 10px 6px');
    // ⚠️ 输入框**不跟主题变浅**。它长在深色外壳里（她图里两个模式都是深的），
    //   跟着 pane 变浅的话白天就是浅底 + 白字 = 看不见（09-16 她报的）。
    var wsInBox = h('div', 'flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:9px 11px;' +
      'background:var(--wt-input);border:1px solid var(--wt-shell-line);border-radius:10px');
    wsInBox.append(h('span', 'flex:none;color:' + T_GREEN + ';font:12px ' + MONO, '❯'));
    var wsIn = h('input', 'flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--wt-input-txt)' +
      ';font:12px ' + MONO + ';caret-color:' + T_GREEN);
    wsIn.className = 'wp-term-in';
    wsIn.setAttribute('placeholder', 'tap here to type…');
    wsIn.setAttribute('enterkeyhint', 'send');
    wsInBox.append(wsIn);
    var wsEnter = h('button', 'flex:none;padding:9px 13px;border:1px solid var(--wt-shell-line);border-radius:10px;' +
      'background:var(--wt-shell-key);color:var(--wt-shell-txt);font:12px ' + MONO + ';cursor:pointer', 'Enter');
    wsInputRow.append(wsInBox, wsEnter);

    var wsHist = [], wsHistI = 0;

    // 斜杠命令。只接真的做得到的几条 —— 编一个按了没反应的出来比没有更糟。
    function wsSlash(v) {
      var cmd = v.slice(1).trim().toLowerCase().split(/\s+/)[0];
      function say(t) { liveSaid = null; liveLine(t, T_DIM); }
      if (cmd === 'help' || cmd === '?') {
        say('/clear   忘掉上下文，开一个新话题（改出来的文件不受影响）');
        say('/resume  把之前的对话铺回屏幕');
        say('/model   换模型     /effort  换思考力度');
        say('/records 展开 / 收起最近的记录');
        say('/clean   只清屏，不动上下文（= Ctrl+L）');
        return true;
      }
      if (cmd === 'clear') { fresh.onclick(); if (liveSec) liveSec.innerHTML = ''; return true; }
      if (cmd === 'clean') { if (liveSec) liveSec.innerHTML = ''; wsWelcomeGone(); return true; }
      if (cmd === 'model') { mdChip.onclick(); say('模型 → ' + (WP_MODEL_LABEL[wpModel] || wpModel) + '（下一句起生效）'); return true; }
      if (cmd === 'effort') { efChip.onclick(); say('力度 → ' + wpEffort + '（下一句起生效）'); return true; }
      if (cmd === 'records') { ensureHistBox(); wsHistToggle.onclick(); return true; }
      if (cmd === 'resume') {
        if (liveSec) liveSec.innerHTML = '';
        wsWelcomeGone();
        if (convo.length) { replayTerm(convo); say('— 接回 ' + convo.length + ' 条 —'); return true; }
        api('/api/workplace/history').then(function (r) { return r.json(); }).then(function (d) {
          var list = (d && d.messages) || [];
          if (!list.length) return say('没有可接回的记录。');
          replayTerm(list);
          say('— 接回 ' + list.length + ' 条 —');
        }).catch(function () { say('接不回来。'); });
        return true;
      }
      say('不认识的命令：/' + cmd + '。/help 看有哪些。');
      return true;
    }
    // ⚠️ 这两个函数 09-16 重做底栏时被整块顶掉过一次，结果是**终端那页发不出消息**
    //   （按钮和回车都指向一个不存在的 wsSend）。改底栏时注意别再把它们带走。
    function wsSend() {
      var v = wsIn.value.trim();
      // ⚠️ 空回车**也要送进去**。09-16 她说「他要用工具给我发请求我点 enter 没用」——
      //   权限弹窗、问卷、菜单这些就靠一个空回车确认，真终端里空回车也是回车。
      //   原来这儿是「空就 return」，于是那些框永远点不掉。
      if (!v) {
        if (roomOn) { roomFast(); roomSend('', ['Enter']); }
        return;
      }
      if (v.charAt(0) === '/') {
        wsIn.value = '';
        wsHist.push(v); wsHistI = wsHist.length;
        // ⚠️ 房间模式下斜杠命令**原样送进房间** —— 那里面是真 CLI，
        //   `/clear` `/model` `/compact` 全是它自己的。
        //   09-16 踩到：我这层把 /clear 截下来去开了「对话页的新话题」，
        //   她在终端里打 /clear 结果换掉的是另一条会话。
        if (roomOn) { roomFast(); roomSend(v, ['Enter']); return; }
        wsSlash(v);                  // 没房间时才用我这套仿的
        return;
      }
      wsHist.push(v); wsHistI = wsHist.length;
      wsIn.value = '';
      if (roomOn) {
        // 她打的字照样先铺一条浅底 `〉`（09-16 她说「我打的字也没有底条」）。
        // 房间屏幕里 CLI 自己也会回显，但那是纯文本、没有样式 —— 这条是给她看的。
        liveHerRoom(v);
        roomPinned = false;                        // 她说话了 = 回到现场，继续跟
        wsBody.scrollTop = wsBody.scrollHeight;
        roomFast();
        roomSend(v, ['Enter']);
        return;
      }
      if (wpBusy) return;
      wsWelcomeGone();
      ta.value = v;
      doSend();
    }
    function wsSendClick() { wsSend(); }
    wsEnter.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    wsEnter.onclick = wsSendClick;
    wsIn.addEventListener('input', function () {});
    wsIn.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); wsSend(); }
      else if (e.key === 'ArrowUp' && wsHistI > 0) { e.preventDefault(); wsIn.value = wsHist[--wsHistI] || ''; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); wsHistI = Math.min(wsHistI + 1, wsHist.length); wsIn.value = wsHist[wsHistI] || ''; }
    };

    // 状态行：左边 `? for shortcuts`（点了打 /help），右边模型和 effort 的**下拉框**
    // （09-16 她问「模型选择和 effort 能否下拉框」—— 原来点一下换下一个，看不见有哪些）。
    var wsStatus = h('div', 'display:flex;align-items:center;gap:8px;padding:0 12px 6px;font:11px ' + MONO + ';color:' + T_DIM);
    var wsShortcuts = h('button', 'flex:none;border:0;background:transparent;color:' + T_DIM +
      ';font:11px ' + MONO + ';cursor:pointer;padding:2px 0', '? for shortcuts');
    wsShortcuts.onclick = function () { wsSlash('/help'); };
    wsStatus.append(wsShortcuts, h('div', 'flex:1'));
    // CLI 在这个位置写 `▶▶ accept edits on`。我们这条路正相反 —— 改动要她点才落盘，
    // 所以写我们真的那条，不照抄一个我们没有的状态。
    var wsMode = h('span', 'flex:none;color:' + T_ORANGE + ';font:11px ' + MONO, '▶▶ 改动待确认');
    wsStatus.append(wsMode);
    function wsSelect(list, cur, label, onPick) {
      var sel = h('select', 'border:1px solid var(--wt-shell-line);border-radius:6px;background:var(--wt-input)' +
        ';color:var(--wt-shell-txt);font:11px ' + MONO + ';padding:3px 5px;cursor:pointer');
      list.forEach(function (v) {
        var o = document.createElement('option');
        o.value = v; o.textContent = label ? label[v] : v;
        if (v === cur) o.selected = true;
        sel.append(o);
      });
      sel.onchange = function () { onPick(sel.value); };
      return sel;
    }
    // 房间模式下这两个下拉框**直接发斜杠命令进去** —— 房间里是真 CLI，
    // `/model` `/effort` 本来就认（09-16 她提醒的：「不是用 / 就可以吗」）。
    // 不用重开房间、也不用我在 spawn 参数里传。对话页那条仍旧用存下来的值。
    var wsModelSel = wsSelect(WP_MODELS, wpModel, WP_MODEL_LABEL, function (v) {
      wpModel = v; try { localStorage.setItem('wp_model', v); } catch (e) {}
      mdChip.textContent = WP_MODEL_LABEL[v] || v; mdChip._v = v;
      if (roomOn) roomSend('/model ' + v, ['Enter']);
      wsFootSync();
    });
    var wsEffortSel = wsSelect(WP_EFFORTS, wpEffort, null, function (v) {
      wpEffort = v; try { localStorage.setItem('wp_effort', v); } catch (e) {}
      efChip.textContent = v; efChip._v = v;
      if (roomOn) roomSend('/effort ' + v, ['Enter']);
      wsFootSync();
    });
    wsStatus.append(h('span', 'width:6px;height:6px;border-radius:50%;background:' + T_GREEN), wsModelSel, wsEffortSel);

    var wsFoot = h('div', 'display:none');          // 老的状态行退役，计数改挂在这儿不上屏
    var wsFoot2 = h('div', 'display:none');
    function wsFootSync() {
      if (wsWelcome) { wsWelcomeGone(); wsWelcomeShow(); }   // 欢迎框上写着模型，跟着换
    }

    // 辅助键：两排。第一排功能键，第二排符号键 —— 照她图里那个排法。
    // 规矩没变：每个键都是真的。符号键就是往输入框里插那个字符。
    var ctrlOn = false;
    function setCaret(d) {
      var i2 = wsIn.selectionStart == null ? wsIn.value.length : wsIn.selectionStart;
      var n = Math.max(0, Math.min(wsIn.value.length, i2 + d));
      wsIn.setSelectionRange(n, n);
    }
    function insert(ch) {
      var a = wsIn.selectionStart == null ? wsIn.value.length : wsIn.selectionStart;
      var b = wsIn.selectionEnd == null ? a : wsIn.selectionEnd;
      wsIn.value = wsIn.value.slice(0, a) + ch + wsIn.value.slice(b);
      wsIn.setSelectionRange(a + ch.length, a + ch.length);
    }
    function ctrlDo(k) {
      if (roomOn) { roomSend('', ['C-' + k]); return; }   // 房间模式：Ctrl+C / Ctrl+L 真的按下去
      if (k === 'l') { if (liveSec) liveSec.innerHTML = ''; wsWelcomeGone(); }
      else if (k === 'u' || k === 'c') { wsIn.value = ''; }
      else if (k === 'r') { loadActivity(); }
    }
    function keyBtn(label, fn, grow) {
      var b = h('button', 'flex:' + (grow || '1') + ';min-width:0;padding:7px 0;border:1px solid var(--wt-shell-line);' +
        'border-radius:6px;background:var(--wt-shell-key);color:var(--wt-shell-txt);font:11px ' + MONO +
        ';cursor:pointer;-webkit-tap-highlight-color:transparent', label);
      // ⚠️ **不要 focus 输入框**（09-16 她要的）：按辅助键会把 iOS 键盘顶上来，
      //   而这排键本来就是替代键盘用的。preventDefault 挡住按下时的焦点转移，
      //   这样焦点留在原处，键盘不弹。想打字她自己点输入框。
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
      b.onclick = function () { fn(); };
      return b;
    }
    var wsKeys = h('div', 'display:flex;flex-direction:column;gap:5px;padding:0 8px calc(env(safe-area-inset-bottom) + 8px)');
    var row1 = h('div', 'display:flex;gap:5px');
    var ctrlBtn = keyBtn('CTRL', function () {
      ctrlOn = !ctrlOn;
      ctrlBtn.style.background = ctrlOn ? T_GREEN : 'var(--wt-shell-key)';
      ctrlBtn.style.color = ctrlOn ? '#FFF' : 'var(--wt-shell-txt)';
    });
    // 房间模式下这些键**送进 tmux**（真的按在那个 CLI 上）；没房间时退回本地行为。
    // shift+tab 切 accept edits、Ctrl+C 打断、上下键选菜单 —— 靠的就是这一排。
    function key(name, local) {
      return function () { if (roomOn) roomSend('', [name]); else if (local) local(); };
    }
    row1.append(
      // ESC：在 Claude Code 里是「打断正在跑的那一轮」，**不清输入**（09-16 实测）。
      // 所以这颗按钮两件事一起做：清掉我们这边的输入框 + 送真 Escape 进房间，
      // 再补一个 C-u 把 CLI 那行也清掉 —— 不然她按了看着像没反应。
      // ⚠️ **C-u 必须在 Escape 前面**（09-17 实测）：ESC 紧跟着别的键 = 终端里的
      //   Meta 前缀，TUI 把两个字节当成 Alt+组合吃掉，单独那记 ESC 就没了 ——
      //   `/usage` 这种整屏视图因此退不出来。Escape 永远放最后一个。
      keyBtn('ESC', function () {
        wsIn.value = '';
        if (roomOn) { roomSend('', ['C-u', 'Escape']); }
      }),
      keyBtn('TAB', key('Tab', function () { goPage(curPage === PAGE_WS ? PAGE_CHAT : PAGE_WS); })),
      keyBtn('S-TAB', key('BTab')),
      ctrlBtn,
      keyBtn('PgUp', function () { roomGestureAt = Date.now(); key('PageUp', function () { wsBody.scrollTop -= wsBody.clientHeight * 0.8; })(); }),
      keyBtn('PgDn', function () { roomGestureAt = Date.now(); key('PageDown', function () { wsBody.scrollTop += wsBody.clientHeight * 0.8; })(); }),
      keyBtn('↑', key('Up', function () { if (wsHistI > 0) wsIn.value = wsHist[--wsHistI] || ''; })),
      keyBtn('↓', key('Down', function () { wsHistI = Math.min(wsHistI + 1, wsHist.length); wsIn.value = wsHist[wsHistI] || ''; })),
      keyBtn('←', key('Left', function () { setCaret(-1); })),
      keyBtn('→', key('Right', function () { setCaret(1); }))
    );
    var row2 = h('div', 'display:flex;gap:4px');
    '/ \\ | - _ = + ~ ` ( ) [ ] { } * & $ # @ ! ? : ; \' "'.split(' ').forEach(function (ch) {
      row2.append(keyBtn(ch, function () { insert(ch); }));
    });
    row2.style.overflowX = 'auto';
    wsKeys.append(row1, row2);

    // Ctrl 亮着时下一个字母当组合键吃掉，然后自动灭 —— 粘滞修饰键的标准行为
    wsIn.addEventListener('keydown', function (e) {
      if (!ctrlOn || e.key.length !== 1) return;
      e.preventDefault();
      ctrlDo(e.key.toLowerCase());
      ctrlOn = false;
      ctrlBtn.style.background = 'var(--wt-shell-key)';
      ctrlBtn.style.color = 'var(--wt-shell-txt)';
    }, true);
    wsDock.append(wsInputRow, wsStatus, wsKeys, wsFoot, wsFoot2);
    wsBody.className = 'wp-term-body';
    // CLI 自己那个输入区（横线 + ❯ + 状态行）单独一块，钉在正文和键盘之间。
    var roomTail = h('pre', 'display:none;flex:none;margin:0;padding:6px 12px 8px;font:12px/1.45 ' + MONO +
      ';color:' + T_TXT + ';white-space:pre-wrap;overflow-wrap:anywhere;background:' + T_BG);

    // ══ 房间模式（09-16）═══════════════════════════════════════════════
    // 终端页不再自己画 transcript，而是**一个 tmux 房间的窗口**：
    // 房间里跑着真的交互式 claude，这儿把那块屏幕原样铺出来。
    // 权限弹窗、问卷、accept edits 这些原生的东西因此才有 —— 不是我仿的。
    // ⚠️ 只在她真的翻到终端页时才起房间、才轮询。房间 400MB，不能开着不用。
    var roomOn = false, roomTimer = null, roomScreen = null, roomBusy = false;
    var roomLastBody = null, roomLastTail = null;   // 上一次画的是什么，没变就别重画
    var roomThemeSent = false;                     // /config theme 一个房间只发一次
    var roomPinned = false;                        // 她翻历史时 = true，这期间不动 DOM
    var roomScrollAt = 0;                          // 她最后一次真的滑动是什么时候
    // ⚠️ POST 的判断不能看「有没有 body」。09-16 踩到：kill 不带 body，
    //   于是被当成 GET 发出去，而 /api/room/kill 是 POST 路由 —— 永远打不中，
    //   她点长按红灯只看到「关不掉」。按路径定方法，别按 body 猜。
    var ROOM_POST = { open: 1, send: 1, kill: 1, reset: 1 };
    function roomApi(path, body) {
      var init = ROOM_POST[path] ? {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body || {}),
      } : undefined;
      return api('/api/room/' + path, init).then(function (r) { return r.json(); });
    }
    // xterm.js 终端实例（替代手写 ANSI 解析）
    var roomTerm = null, roomTermEl = null;
    function roomXtermTheme() {
      var dark = matchMedia('(prefers-color-scheme: dark)').matches;
      var forced = document.documentElement.getAttribute('data-theme');
      if (forced) dark = forced === 'dark';
      return dark ? {
        background: '#1F1E1D', foreground: '#DCD7CF', cursor: '#DCD7CF',
        selectionBackground: 'rgba(255,255,255,0.2)',
        black: '#1F1E1D', red: '#D97757', green: '#6BAF7B', yellow: '#D4A64A',
        blue: '#6B92D8', magenta: '#B87BC4', cyan: '#5BAFAF', white: '#DCD7CF',
        brightBlack: '#857F76', brightRed: '#D97757', brightGreen: '#6BAF7B', brightYellow: '#D4A64A',
        brightBlue: '#6B92D8', brightMagenta: '#B87BC4', brightCyan: '#5BAFAF', brightWhite: '#DCD7CF'
      } : {
        background: '#FAF6F1', foreground: '#1F1E1D', cursor: '#1F1E1D',
        selectionBackground: 'rgba(0,0,0,0.15)',
        black: '#FAF6F1', red: '#C25B36', green: '#3E8E57', yellow: '#B98A2E',
        blue: '#4A72B8', magenta: '#9A5BA8', cyan: '#3E8E8E', white: '#1F1E1D',
        brightBlack: '#8A857C', brightRed: '#C25B36', brightGreen: '#3E8E57', brightYellow: '#B98A2E',
        brightBlue: '#4A72B8', brightMagenta: '#9A5BA8', brightCyan: '#3E8E8E', brightWhite: '#1F1E1D'
      };
    }
    function roomEnsureScreen() {
      if (roomTermEl) return roomTermEl;
      wsWelcomeGone();
      roomTermEl = h('div', 'margin:0;flex:1;min-height:0');
      wsBody.append(roomTermEl);
      roomTerm = new Terminal({
        disableStdin: true,
        convertEol: true,
        fontSize: 12,
        lineHeight: 1.45,
        fontFamily: MONO,
        theme: roomXtermTheme(),
        cols: roomCols(),
        rows: roomRows(),
        scrollback: 200,
        cursorBlink: false,
        allowTransparency: true
      });
      roomTerm.open(roomTermEl);
      return roomTermEl;
    }
    // 房间模式下她说的话：跟对话流那条同一个样子，铺在屏幕块上面。
    function liveHerRoom(text) {
      var row = h('div', 'display:flex;gap:7px;margin:3px 0;padding:2px 12px;background:' + T_HER +
        ';color:' + T_TXT + ';font:12px/1.6 ' + MONO + ';white-space:pre-wrap;overflow-wrap:anywhere');
      row.append(h('span', 'flex:none;color:' + T_DIM, '〉'));
      row.append(h('div', 'flex:1;min-width:0', text));
      // 09-18：屏幕块从 roomScreen(<pre>) 换成 roomTermEl(xterm) 后，roomScreen 永远是 null，
      //   她说的话会 append 到终端块下面（termEl 是 flex:1 撑满的，等于沉到看不见）。
      //   跟着新变量走：插在 xterm 上面，回到「她说的话铺在屏幕块上面」。
      if (roomTermEl) wsBody.insertBefore(row, roomTermEl);
      else wsBody.append(row);
      wsBody.scrollTop = wsBody.scrollHeight;
    }
    // ── ANSI → HTML ────────────────────────────────────────────────────
    // tmux 带 -e 回来的是原始转义序列。这儿忠实还原 CLI 真正发的颜色 ——
    // 09-16 踩过两次：① 只接了 8/16 色，而 CLI 的开屏 logo 用的是 256 色
    //   （实测 `38;5;174` 那个粉橙 + `48;5;16` 黑底），整个被丢掉 → 黑白的 clawd；
    // ② 背景色曾映射成「跟主题走」的半透明色，白天在浅底上几乎看不见 → 没有底纹。
    // 所以这儿**不做主题适配**，CLI 发什么色就画什么色。
    // isBg：这个色是当背景用的还是当前景用的。**必须分开处理** ——
    // 09-16 踩到：为了修「白天字太浅」，把 ≥250 一律换成主题字色，
    // 结果 CLI 给她输入行发的 `48;5;255`（近白底）也被换成了深色 → 黑条黑字。
    // CLI 那行本来就是「浅底 + 近黑字」，正是她要的，是我改坏的。
    function xterm256(n, isBg) {
      n = n | 0;
      // ⚠️ 0 号（黑）和 15 号（白）不写死。09-16 她说「文字底纹一会黑一会白」——
      //   病根是 CLI 以为自己在**深色终端**里，发的是深色底；白天模式下那就是一块黑。
      //   把这两端交给主题变量：黑 → pane 的底色，白 → pane 的字色，
      //   于是「深色端」在白天自动变浅，底纹就不会忽黑忽白了。
      if (n < 16) {
        if (n === 0) return isBg ? 'var(--wt-bg)' : 'var(--wt-txt)';
        if (n === 7 || n === 15) return isBg ? 'var(--wt-her)' : 'var(--wt-txt)';
        return ['var(--wt-bg)', '#C25B36', '#3E8E57', '#B98A2E', '#4A72B8', '#9A5BA8', '#3E8E8E', 'var(--wt-txt)',
                'var(--wt-dim)', '#D97757', '#6BAF7B', '#D4A64A', '#6B92D8', '#B87BC4', '#5BAFAF', 'var(--wt-txt)'][n];
      }
      // 灰阶区（232-255）同理：最暗的几档在白天是黑块，拉到 pane 的底色一侧
      // 极暗的几档：当背景时给 pane 的底色，当前景时保持深色（白天读得到）
      if (n >= 232 && n <= 237) return isBg ? 'var(--wt-her)' : 'var(--wt-txt)';
      // 极亮的几档：当**前景**时白天会是白底白字 → 换成主题字色；
      // 当**背景**时正是她要的浅色条 → 给 pane 的「她的底色」。
      if (n >= 250) return isBg ? 'var(--wt-her)' : 'var(--wt-txt)';
      if (n === 16) return isBg ? 'var(--wt-bg)' : 'var(--wt-txt)';
      if (n < 232) {
        var c = n - 16, r = Math.floor(c / 36), g = Math.floor((c % 36) / 6), b = c % 6;
        var f = function (v) { return v ? v * 40 + 55 : 0; };
        return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
      }
      var v2 = (n - 232) * 10 + 8;
      return 'rgb(' + v2 + ',' + v2 + ',' + v2 + ')';
    }
    // 他每段话前面那颗 ● 是 CLI 自己画的，默认是白/灰。
    // 09-16 她要彩色：按出现顺序轮着上粉蓝绿红黄，一眼能数出他说了几段。
    // 他每段话前面那颗 ●。09-16 先做成轮换五色，他自己说想要粉的，就粉的。
    var DOT_COLOR = '#D98BA4';
    function colorDots(html) {
      return html.replace(/●/g, '<span style="color:' + DOT_COLOR + '">●</span>');
    }
    function ansiToHTML(str) {
      var out = '', open = 0, fg = null, bg = null, bold = false, inv = false;
      function esc2(t) {
        return t.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
      }
      var parts = String(str).split(/\x1b\[([0-9;]*)m/);
      for (var i = 0; i < parts.length; i++) {
        if (i % 2 === 0) { if (parts[i]) out += esc2(parts[i]); continue; }
        var codes = parts[i].split(';').map(function (n) { return parseInt(n || '0', 10); });
        for (var ci = 0; ci < codes.length; ci++) {
          var c0 = codes[ci];
          if ((c0 === 38 || c0 === 48) && codes[ci + 1] === 5) {
            var col = xterm256(codes[ci + 2], c0 === 48);
            if (c0 === 38) fg = col; else bg = col;
            ci += 2; continue;
          }
          if ((c0 === 38 || c0 === 48) && codes[ci + 1] === 2) {
            var rgb = 'rgb(' + (codes[ci + 2] | 0) + ',' + (codes[ci + 3] | 0) + ',' + (codes[ci + 4] | 0) + ')';
            if (c0 === 38) fg = rgb; else bg = rgb;
            ci += 4; continue;
          }
          if (c0 === 0) { fg = bg = null; bold = inv = false; }
          else if (c0 === 1) bold = true;
          else if (c0 === 22) bold = false;
          else if (c0 === 7) inv = true;
          else if (c0 === 27) inv = false;
          else if (c0 === 39) fg = null;
          else if (c0 === 49) bg = null;
          else if (c0 >= 30 && c0 <= 37) fg = xterm256(c0 - 30, false);
          else if (c0 >= 90 && c0 <= 97) fg = xterm256(c0 - 90 + 8, false);
          else if (c0 >= 40 && c0 <= 47) bg = xterm256(c0 - 40, true);
          else if (c0 >= 100 && c0 <= 107) bg = xterm256(c0 - 100 + 8, true);
        }
        while (open > 0) { out += '</span>'; open--; }
        // 反显（SGR 7）：CLI 用它标「她说的话」那条。
        // ⚠️ 09-16 做反过一次：把它当成「前景背景对调」，结果白天是**深块深字**，
        //   看不清。她要的是参考图那样 —— **浅灰底 + 正常字色**，两个主题都一样。
        //   所以这里不做机械对调，直接给 pane 的「她的底色」。
        // 反显固定成「浅灰底 + 主题字色」，不做机械对调（她 09-16 定的）
        var f2 = inv ? 'var(--wt-txt)' : fg;
        var b2 = inv ? 'var(--wt-her)' : bg;
        if (f2 || b2 || bold) {
          // 反显的 span 打个标记，下面 renderBody 按行把整条底纹铺通
          out += '<span' + (inv ? ' data-inv="1"' : '') + ' style="' + (f2 ? 'color:' + f2 + ';' : '') +
            (b2 ? 'background:' + b2 + ';' : '') + (bold ? 'font-weight:600' : '') + '">';
          open++;
        }
      }
      while (open > 0) { out += '</span>'; open--; }
      return out;
    }
    // 屏幕整理（09-16 她给的排布参考，改了几版才定）。
    // 把 pane 拆成两块：
    //   body —— 正文（logo、对话、Brewed for…），在上面**自己滚**
    //   tail —— CLI 自己那个输入区：`────` / `❯ 光标` / `────` / `⏵⏵ 状态行`
    //           **钉在底部**，贴着辅助键那排，不跟着正文往下流
    // 两次走过的弯路，别再走：
    //   ① 把 tail 整块裁掉 → 她说「输入框不见了」。它要显示，只是位置固定。
    //   ② 把正文改成贴底 → 她说「还是在下面」。正文从顶上排。
    function splitScreen(raw) {
      var lines = String(raw).replace(/\s+$/, '').split('\n');
      function plain(l) { return l.replace(/\x1b\[[0-9;]*m/g, ''); }
      function isRule(l) { var t = plain(l).trim(); return t.length > 7 && /^[─━_\s]+$/.test(t); }
      var tail = [];
      // 从末尾往回收：状态行 → 横线 → ❯ 行 → 横线。最多看 8 行，别把正文卷进去。
      var guard = 0;
      while (lines.length && guard++ < 8) {
        var l = lines[lines.length - 1], t = plain(l).trim();
        if (!t) { lines.pop(); continue; }
        if (isRule(l) || /^[❯>»]/.test(t) ||
            /⏵|shift\+tab|for agents|to manage|bypass permissions|accept edits|auto mode/i.test(t) ||
            /^Try ".*"/.test(t)) {
          tail.unshift(lines.pop());
          continue;
        }
        break;
      }
      // 正文里连着的空行压成一行 —— CLI 拿空行把输入区顶到 pane 底部，
      // 那些填充搬过来就是一大片空白。
      var body = [], blank = 0;
      lines.forEach(function (l) {
        if (!plain(l).trim()) { blank++; if (blank > 1) return; }
        else blank = 0;
        body.push(l);
      });
      return { body: body.join('\n').replace(/\s+$/, ''), tail: tail.join('\n') };
    }
    // 逐行渲染。09-16 她说「文字底纹条还长长短短的」——
    // tmux 把行尾空格削了，反显的底色只铺到文字末尾；她参考图里那条是**整行通到底**的。
    // 所以带反显的行整行套一个满宽的块，底色画在块上，里面的 span 就不用自己带底了。
    function renderBody(raw) {
      return String(raw).split('\n').map(function (line) {
        var html = colorDots(ansiToHTML(line));
        // ⚠️ 原来只认反显（data-inv）。CLI 有时用的是普通背景色（48;5;N），
        //   那种就漏了 —— 她说「字条问题还是没解决」。现在**任何带底色的行**都铺满。
        // ⚠️ **只对反显（SGR 7）那种行下手** —— 那是 CLI 标「她说的话」用的。
        //   09-16 踩过：一度改成「任何带底色的行都铺满 + 统一字色」，
        //   结果开屏那个像素 logo 每行本身带黑底，三行各自套了一条底纹带（裂成三段），
        //   字色还被统一成黑的（身子变黑、没带底的脚还是粉的）。别再放宽这个条件。
        // 界线按**颜色**分，不按「是不是反显」分（09-16 来回改了三版才对）：
        //   浅色底（var(--wt-her)）= 她的输入条 → 铺满整行
        //   深色底（var(--wt-bg)）  = 开屏 logo 的黑块 → 原样别动，
        //                             一动就把螃蟹切成三段还染黑（踩过）
        // CLI 给她那行发的是真实背景色 48;5;255，不是反显 —— 只认反显会漏掉它。
        if (html.indexOf('data-inv="1"') === -1 &&
            html.indexOf('background:var(--wt-her)') === -1) return html;
        return '<span style="display:block;background:var(--wt-her);color:var(--wt-txt);' +
          'margin:1px -12px;padding:1px 12px">' +
          html.replace(/background:[^;"]+;?/g, '') + '</span>';
      }).join('\n');
    }
    // 轮询节奏。CLI 一直在重画（光标、计时），每 1.5 秒整块重绘就会卡
    // （09-16 她说「滑动好卡顿」）。改成自适应：刚有动静就跟得紧，
    // 连着几次没变化就退到 4 秒，她一说话再提速。
    var roomIdleTicks = 0;
    function roomSchedule(ms) {
      if (roomTimer) clearInterval(roomTimer);
      roomTimer = setInterval(roomPoll, ms);
      roomTickMs = ms;
    }
    var roomTickMs = 1500;
    function roomFast() { roomIdleTicks = 0; if (roomTickMs !== 1200) roomSchedule(1200); }
    // 那行 `❯` 是 CLI 自己的，只有按了回车它才知道她打了什么。
    // 09-16 她问「为什么在键盘打字不会出现在两条横线中间」——
    // 真要实时，就得每敲一个字发一次请求，她网络上会很顿。
    // 所以**本地镜像**：打字时把她当前输入画进那一行，看着跟真终端一样，
    // 发送仍然是按回车时一次性送出去。
    var roomTailRaw = '';
    function paintTail() {
      if (!roomTailRaw) { roomTail.style.display = 'none'; return; }
      roomTail.style.display = 'block';
      var typing = wsIn && wsIn.value ? wsIn.value : '';
      var lines = roomTailRaw.split('\n').map(function (l) {
        var plain = l.replace(/\x1b\[[0-9;]*m/g, '');
        if (!typing || !/^\s*[❯>»]/.test(plain.trim())) return ansiToHTML(l);
        var esc3 = typing.replace(/[&<>]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
        });
        return '<span style="color:var(--wt-green,#6BAF7B)">❯</span> ' +
          '<span style="color:var(--wt-txt)">' + esc3 + '</span>' +
          '<span style="background:var(--wt-txt);color:var(--wt-bg)"> </span>';
      });
      roomTail.innerHTML = lines.join('\n');
    }
    function roomPoll() {
      if (!roomOn || roomBusy) return;
      roomBusy = true;
      roomApi('view').then(function (d) {
        roomBusy = false;
        if (!roomOn) return;
        if (d && d.alive) {
          var raw = d.screen || '';
          if (raw !== roomLastBody) {
            roomEnsureScreen();
            roomTerm.write('\x1b[2J\x1b[H');
            roomTerm.write(raw);
            roomLastBody = raw;
            roomIdleTicks = 0;
            if (roomTickMs !== 1200) roomSchedule(1200);
          } else {
            roomIdleTicks++;
            if (roomIdleTicks === 4 && roomTickMs !== 4000) roomSchedule(4000);
          }
          if (wsMode) wsMode.textContent = '';
        } else if (d && !d.alive) {
          roomEnsureScreen();
          if (roomTerm) { roomTerm.write('\x1b[2J\x1b[H'); roomTerm.write('房间不在了（闲置自动收了）。说句话我就重新起一个。'); }
        }
      }).catch(function () { roomBusy = false; });
    }
    // 量一个等宽字符多宽，算出这块屏幕真正能放几列。
    // 不量的话默认 100 列，手机上一条 `────` 会被折成两三行（她 09-16 指出来的）。
    function roomCols() {
      var probe = h('span', 'position:absolute;visibility:hidden;white-space:pre;font:12px ' + MONO, '0'.repeat(50));
      wsBody.append(probe);
      var per = probe.getBoundingClientRect().width / 50;
      probe.remove();
      var usable = wsBody.clientWidth - 24;          // 减掉 pre 的左右 padding
      if (!per || !usable) return 50;
      return Math.max(30, Math.min(200, Math.floor(usable / per)));
    }
    function roomRows() {
      return Math.max(12, Math.min(80, Math.floor(wsBody.clientHeight / (12 * 1.45)) || 30));
    }
    // 手势翻历史（09-16）。
    // 病根：Claude Code 跑在**备用屏幕**上，tmux 那边 history_size = 0 ——
    // 屏幕外的内容根本不在终端历史里，手势再怎么滑也没东西可滑。
    // 真正能往回翻的是 CLI 自己（它滚自己的内容），对应的键就是 PgUp/PgDn。
    // 所以把「已经到顶了还继续往上拉」翻译成一次 PageUp，把「到底了还往下拉」翻译成 PageDown。
    var roomGestureAt = 0;
    function roomGesture(dir) {
      if (!roomOn) return;
      var now = Date.now();
      if (now - roomGestureAt < 400) return;      // 一次手势只翻一页，别连发
      roomGestureAt = now;
      roomPinned = false;
      roomSend('', [dir > 0 ? 'PageUp' : 'PageDown']);
    }
    // 只记「她自己滑」的时刻。程序改 scrollTop 也会触发 scroll 事件，
    // 所以用 wheel / touch 这些真实手势来打这个时间戳，别用 scroll。
    wsBody.addEventListener('touchmove', function () { roomScrollAt = Date.now(); }, { passive: true });
    wsBody.addEventListener('wheel', function () { roomScrollAt = Date.now(); }, { passive: true });
    wsBody.addEventListener('wheel', function (e) {
      if (!roomOn) return;
      if (e.deltaY < 0 && wsBody.scrollTop <= 0) roomGesture(1);
      else if (e.deltaY > 0 && wsBody.scrollTop + wsBody.clientHeight >= wsBody.scrollHeight - 1) roomGesture(-1);
    }, { passive: true });
    var touchY0 = null;
    wsBody.addEventListener('touchstart', function (e) {
      touchY0 = e.touches && e.touches[0] ? e.touches[0].clientY : null;
    }, { passive: true });
    wsBody.addEventListener('touchmove', function (e) {
      if (!roomOn || touchY0 == null || !e.touches || !e.touches[0]) return;
      var dy = e.touches[0].clientY - touchY0;
      if (dy > 60 && wsBody.scrollTop <= 0) { roomGesture(1); touchY0 = e.touches[0].clientY; }
      else if (dy < -60 && wsBody.scrollTop + wsBody.clientHeight >= wsBody.scrollHeight - 1) {
        roomGesture(-1); touchY0 = e.touches[0].clientY;
      }
    }, { passive: true });
    function roomStart() {
      if (roomOn) return;
      roomOn = true;
      // 终端页从此只属于房间：把对话页镜像过来的那条流清掉，别两条混在一起。
      if (liveSec) { liveSec.remove(); liveSec = null; }
      liveSaid = null;
      wsWelcomeGone();
      roomEnsureScreen();
      if (roomTerm) roomTerm.write('正在起房间…（第一次要十几秒）');
      roomApi('open', { model: wpModel, cols: roomCols(), rows: roomRows() }).then(function () {
        // 告诉房间里的 CLI 她这会儿是浅色还是深色 —— 它据此决定正文发什么色。
        // 不告诉的话它默认按深色终端发浅灰字，白天就是白底白字。
        // ⚠️ 一个房间只发一次。原来每次进页面都发，她屏幕上叠了三条
        //   `/config theme=light`（09-16 截图里看到的）。
        if (!roomThemeSent) {
          roomThemeSent = true;
          var dark = matchMedia('(prefers-color-scheme: dark)').matches;
          var forced = document.documentElement.getAttribute('data-theme');
          if (forced) dark = forced === 'dark';
          setTimeout(function () { roomSend('/config theme=' + (dark ? 'dark' : 'light'), ['Enter']); }, 2500);
        }
        roomSchedule(1500);
        setTimeout(roomPoll, 1200);
      }).catch(function () {
        if (roomTerm) { roomTerm.write('\x1b[2J\x1b[H'); roomTerm.write('房间起不来。看看网关活着没。'); }
      });
    }
    function roomStop() {
      roomOn = false;
      if (roomTimer) { clearInterval(roomTimer); roomTimer = null; }
    }
    // 主题切换时更新 xterm 颜色
    function roomSyncTheme() { if (roomTerm) roomTerm.options.theme = roomXtermTheme(); }
    if (matchMedia('(prefers-color-scheme: dark)').addEventListener) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', roomSyncTheme);
    }
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { if (m.attributeName === 'data-theme') roomSyncTheme(); });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // ⚠️ 关掉整个工作台面板时也要停 —— 09-16 她问「反复点进去有风险吗」时发现的：
    //   原来只有「翻回对话页」会停，直接关面板那个 1.5 秒的轮询会一直跑在后台，
    //   反复进出就叠一层。这个钩子给 index.html 的关闭按钮和红灯用。
    window.wpRoomStop = roomStop;
    // 页面进后台（切 app、锁屏）也停，回来再说。省电省流量，房间不受影响。
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) roomStop();
      else if (curPage === PAGE_WS && !wide.matches) roomStart();
    });
    // 送键。text 是字面量，keys 是键名（Enter / C-c / BTab …）。
    function roomSend(text, keys) {
      if (!roomOn) return;
      // ⚠️ 只要送了键，就解除「她在翻历史」的锁并提速。
      //   09-16 踩到：PgUp 明明翻上去了，但她刚滑过一下 → roomPinned=true →
      //   画面被锁住不刷新，看着就像「PageUp 没生效还是滑不动」。
      roomPinned = false;
      roomFast();
      roomApi('send', { text: text || '', keys: keys || [] })
        .then(function () { setTimeout(roomPoll, 250); setTimeout(roomPoll, 900); })
        .catch(function () {});
    }

    // ── 开屏的欢迎框（她 09-16 指定：「登陆会有 clawd 的那个小像素」）────────
    // 像素螃蟹按官方那个的形状画 —— 纯 SVG 方块，不用我们那套 clawd-*.svg 姿势，
    // 那些是另一套画风，摆在终端里不是一回事。
    // 09-16：我拿方块堆画了一只，她说「完全不是 clawd 啊哈哈哈」—— 确实不像。
    // 项目里 static/clawd-*.svg 是她那套现成的美术资产，直接用，别自己造。
    // idle 是站着不动那张，开屏用它；换姿势只要换文件名。
    var wsWelcome = null;
    function wsWelcomeShow() {
      if (wsWelcome) return;
      wsWelcome = h('div', 'margin:10px 12px;border:1px solid ' + T_ORANGE + ';border-radius:8px;padding:14px 12px 16px;text-align:center');
      wsWelcome.append(h('div', 'font:11px ' + MONO + ';color:' + T_ORANGE + ';text-align:left;margin:-22px 0 8px 4px;' +
        'background:' + T_BG + ';display:inline-block;padding:0 6px', 'Claude Code'));
      wsWelcome.append(h('div', 'font:600 14px ' + MONO + ';color:' + T_TXT + ';margin-bottom:10px', 'Welcome back 小萌！'));
      var crab = h('img', 'width:76px;height:auto;display:block;margin:0 auto 10px;image-rendering:pixelated');
      // ⚠️ 别用 clawd-idle.svg：它靠内嵌 JS 给 #body-js 那些 id 上色，
      //    <img> 里 JS 不执行，只剩黑色底层 —— 09-16 她说「怎么是黑白的」。
      //    .gif 本来就是彩色会动的，直接用。
      crab.src = '/clawd-idle.gif';
      crab.alt = 'clawd';
      wsWelcome.append(crab);
      var meta = h('div', 'font:11px/1.7 ' + MONO + ';color:' + T_DIM);
      meta.append(h('div', '', WP_MODEL_LABEL[wpModel] || wpModel));
      meta.append(h('div', '', '/opt/ccwithme'));
      wsWelcome.append(meta);
      wsBody.insertBefore(wsWelcome, wsBody.firstChild);
    }
    function wsWelcomeGone() { if (wsWelcome) { wsWelcome.remove(); wsWelcome = null; } }
    wsWelcomeShow();
    wsPane.append(wsBar, wsPend, wsBody, wsDock);
    main.append(pgChat, wsPane);

    // 宽屏并排 / 窄屏两页。matchMedia 而不是只在打开时量一次 ——
    // 手机横竖屏来回转、iPad 分屏拖宽窄，都会跨过这条线。
    var wide = window.matchMedia('(min-width: 980px)');
    var PAGE_CHAT = 0, PAGE_WS = 1;      // 页序号只在这儿写一次，别到处散 0/1
    var curPage = PAGE_CHAT;
    function goPage(i) {
      if (wide.matches) return;
      main.scrollTo({ left: i * main.clientWidth, behavior: 'smooth' });
    }
    function syncPager() {
      if (wide.matches) {
        // 并排：两页各占一半，关掉 snap，页码条没意义就藏起来
        pager.style.display = 'none';   // 下面那行会按当前页再算一次
        main.style.scrollSnapType = 'none';
        pgChat.style.width = '50%';
        wsPane.style.width = '50%';
        wsPane.style.borderLeft = '1px solid var(--bg-sunken)';
      } else {
        pager.style.display = 'flex';
        main.style.scrollSnapType = 'x mandatory';
        pgChat.style.width = '100%';
        wsPane.style.width = '100%';
        wsPane.style.borderLeft = '';
      }
      pgName.textContent = curPage === PAGE_WS ? '工作区' : '对话';
      // 终端页要「完全跟终端一样」：连上面那条带头像和「工作台」的栏也收掉。
      // 翻回去靠底下那排快捷键里的 ←。
      pager.style.display = (wide.matches || curPage === PAGE_CHAT) ? 'flex' : 'none';
      // 连 sheet 自带的那条「× workplace」也收掉 —— 她说终端页上不要「workplace」这几个字。
      // 关窗口改由红灯负责。
      var head = document.querySelector('#workplaceSheet > .sheet-head');
      if (head) head.style.display = (wide.matches || curPage === PAGE_CHAT) ? '' : 'none';
      dotEls.forEach(function (d, i) {
        d.style.opacity = (i === curPage ? '1' : '.3');
        d.style.background = (i === curPage ? 'var(--accent)' : 'var(--text-faint)');
      });
      // 09-16 起工作区自己有 ❯ 输入行了，滑过去时把对话页那条 dock 收掉，
      // 免得一屏上下各一个输入框（08-28 收 dock 的理由变了，做法没变）。
      dock.style.display = (wide.matches || curPage === PAGE_CHAT) ? '' : 'none';
    }
    // 滑到哪一页了。onscroll 每帧都响，只在整页翻过去时才做事。
    main.addEventListener('scroll', function () {
      if (wide.matches || !main.clientWidth) return;
      var p = Math.round(main.scrollLeft / main.clientWidth);
      if (p === curPage) return;
      curPage = p;
      syncPager();
      if (curPage === PAGE_WS) roomStart(); else roomStop();  // 只在她真看着的时候起房间、轮询
    }, { passive: true });
    // addEventListener 在旧 Safari 的 MediaQueryList 上没有，兜一下 addListener
    if (wide.addEventListener) wide.addEventListener('change', syncPager);
    else if (wide.addListener) wide.addListener(syncPager);

    // ══ 工作区 ══════════════════════════════════════════════════════════
    // 「这个仓库最近发生了什么」。跟对话流里那张终端卡片**不是一回事**，
    // 终端卡片是「他这一轮刚干了什么」，她说要保留，那张一行没动。
    var wsLoaded = false;

    function ago(ts) {
      if (!ts) return '';
      var s = Math.floor(Date.now() / 1000) - ts;
      if (s < 60) return '刚刚';
      if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
      if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
      var d = new Date(ts * 1000);
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    // 一条记录 = 终端里的一行。点行展开 diff，diff 用 └ 挂在下面 ——
    // 跟她截图里 Bash(...) 底下那条 └ 是同一个形状。
    // ⚠️ 展开逻辑（op 没有 diff、pending 走 /show 不带 sha）跟改版前一模一样，只换了皮。
    function wsCard(r) {
      var isPending = r.kind === 'pending';
      var isOp = r.kind === 'op';
      var dotColor = isPending ? T_ORANGE : (isOp ? T_DIM : T_GREEN);
      var block = h('div', 'flex:none');

      var hdr = h('div', 'display:flex;align-items:flex-start;gap:8px;padding:4px 12px;cursor:pointer;user-select:none');
      hdr.onmouseenter = function () { hdr.style.background = 'rgba(255,255,255,.05)'; };
      hdr.onmouseleave = function () { hdr.style.background = 'transparent'; };
      hdr.append(h('span', 'width:7px;height:7px;border-radius:50%;flex:none;margin-top:7px;background:' + dotColor));

      var mid = h('div', 'flex:1;min-width:0');
      var line1 = h('div', 'display:flex;align-items:baseline;gap:8px');
      // 09-16 按她给的终端图改成 transcript 流：行首只留一颗圆点，
      // 标题就是正文（不再挂「操作 / 待确认」那种彩色标签，CLI 里没有那个东西）。
      // sha 和「待确认」退成标题后面的灰注脚。
      line1.append(h('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ' + MONO + ';color:' + T_TXT, r.title || ''));
      if (r.kind === 'commit') {
        line1.append(h('span', 'flex:none;font:11px ' + MONO + ';color:' + T_DIM, r.sha));
      } else if (isPending) {
        line1.append(h('span', 'flex:none;font:11px ' + MONO + ';color:' + T_ORANGE, '待确认'));
      }
      mid.append(line1);

      var line2 = h('div', 'font:11px ' + MONO + ';color:' + T_DIM + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap');
      if (isOp) {
        line2.textContent = (r.items || []).map(function (it) {
          return it.verb + (it.target ? ' ' + it.target : '');
        }).join(' · ') + ' · ' + ago(r.ts);
      } else {
        var fs = r.files || [];
        line2.textContent = (fs.length ? fs.slice(0, 3).join(' · ') + (fs.length > 3 ? ' 等 ' + fs.length + ' 个' : '') : '') +
          (r.ts ? ' · ' + ago(r.ts) : '');
      }
      mid.append(line2);
      hdr.append(mid);
      var chev = h('span', 'flex:none;color:' + T_DIM + ';font:11px ' + MONO + ';transition:transform .15s;margin-top:3px', '⌄');
      hdr.append(chev);
      block.append(hdr);

      // └ 那条竖线：diff 挂在行下面，缩进对齐圆点右边
      var fold = h('div', 'display:none;margin:2px 0 6px 15px;padding-left:11px;border-left:1px solid ' + T_LINE);
      fold.style.position = 'relative';
      block.append(fold);

      var opened = false, fetched = false;
      hdr.onclick = function () {
        opened = !opened;
        fold.style.display = opened ? 'block' : 'none';
        chev.style.transform = opened ? 'rotate(180deg)' : '';
        if (!opened || fetched) return;
        fetched = true;

        // op 没有 diff —— 那只是他调过的工具，文件当时改成什么样没人留底。
        // 与其编一个假的 diff，不如老实把调用参数摆出来。
        if (isOp) {
          var box = h('div', 'padding:4px 0;display:flex;flex-direction:column;gap:4px');
          (r.items || []).forEach(function (it) {
            var row = h('div', 'font:11px/1.5 ' + MONO + ';color:' + T_DIM + ';word-break:break-all');
            row.append(h('span', 'color:' + T_TXT + ';font-weight:600', it.name + ' '), h('span', '', it.input || ''));
            box.append(row);
          });
          box.append(h('div', 'font:11px ' + MONO + ';color:' + T_DIM + ';padding-top:2px',
            '这类记录只有调用参数，没有 diff（当时的文件内容没留底）。'));
          fold.append(box);
          return;
        }

        var loading = h('div', 'padding:4px 0;font:11px ' + MONO + ';color:' + T_DIM, '读取中…');
        fold.append(loading);
        var url = '/api/workplace/show?' + (isPending ? '' : 'sha=' + encodeURIComponent(r.id));
        fetch(url, { headers: authHeaders() })
          .then(function (x) { return x.json(); })
          .then(function (d) {
            loading.remove();
            if (d.error) {
              fold.append(h('div', 'padding:4px 0;font:11px ' + MONO + ';color:#FF8A80', d.error));
              return;
            }
            if (d.empty) {
              fold.append(h('div', 'padding:4px 0;font:11px ' + MONO + ';color:' + T_DIM,
                '这条没有文本 diff（可能是新文件、二进制或只改了权限）。'));
              return;
            }
            var pre = h('div', 'font:11px/1.55 ' + MONO + ';max-height:46vh;overflow:auto;padding:2px 0');
            // git show --format= 还是会留一个前导空行，削掉再画
            pre.innerHTML = renderDiff(String(d.diff).replace(/^\n+/, ''), true);   // true = 深色底那套配色
            fold.append(pre);
          })
          .catch(function (e) {
            loading.remove();
            fold.append(h('div', 'padding:4px 0;font:11px ' + MONO + ';color:#FF8A80', esc(e.message)));
          });
      };
      return block;
    }

    // 历史卡片的容器：钉在对话流**下面**，默认收起来。
    var wsHistBox = null, wsHistToggle = null;
    function ensureHistBox() {
      if (wsHistBox) return;
      wsHistToggle = h('button', 'width:100%;text-align:left;padding:7px 12px;border:0;border-top:1px solid ' + T_LINE +
        ';background:transparent;color:' + T_DIM + ';font:11px ' + MONO + ';cursor:pointer', '└ 最近的记录');
      wsHistBox = h('div', 'display:none;padding:2px 0 6px');
      wsHistToggle.onclick = function () {
        var on = wsHistBox.style.display === 'none';
        wsHistBox.style.display = on ? 'block' : 'none';
        wsHistToggle.textContent = (on ? '┌ ' : '└ ') + '最近的记录';
      };
      wsBody.append(wsHistToggle, wsHistBox);
    }
    function loadActivity() {
      wsLoaded = true;
      // ⚠️ 这里原来是 `wsBody.innerHTML = ''` —— 现在 wsBody 里装着**对话流**，
      //   清空就等于把她刚说的话和他的回答一起抹了。只重建历史那一块。
      ensureHistBox();
      wsHistBox.innerHTML = '';

      var tip = h('div', 'padding:6px 12px;font:11px ' + MONO + ';color:' + T_DIM, '读取中…');
      wsHistBox.append(tip);

      fetch('/api/workplace/activity?limit=20', { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          tip.remove();
          var list = (d && d.records) || [];
          if (d && d.error) {
            wsHistBox.append(h('div', 'padding:6px 12px;font:11px ' + MONO + ';color:#FF8A80', d.error));
            return;
          }
          if (!list.length) {
            wsHistBox.append(h('div', 'padding:10px 12px;font:12px ' + MONO + ';color:' + T_DIM, '还没有记录。'));
            return;
          }
          list.forEach(function (r) { wsHistBox.append(wsCard(r)); });
          // 顶栏计数 + 底部状态行。只数真的有的东西，ctx/weekly 那两个数后端没吐，不编。
          var nCommit = 0, nOp = 0, nPend = 0;
          list.forEach(function (r) {
            if (r.kind === 'pending') nPend++;
            else if (r.kind === 'op') nOp++;
            else nCommit++;
          });
          wsCount.textContent = 'ccwithme — 提交' + nCommit + ' 操作' + nOp + (nPend ? ' 待确认' + nPend : '');
          wsHistToggle.textContent = (wsHistBox.style.display === 'none' ? '└ ' : '┌ ') + '最近的记录（' + list.length + '）';
          wsFoot.textContent = (WP_MODEL_LABEL[wpModel] || wpModel) + ' · ' + wpEffort + ' · ' + list.length + ' 条记录';
        })
        .catch(function (e) {
          tip.textContent = '';
          wsBody.append(h('div', 'padding:6px 12px;font:11px ' + MONO + ';color:#FF8A80', esc(e.message)));
        });
    }
    wsReload.onclick = function () { loadActivity(); };

    // 工作区的内容会被确认/还原改掉，那两个动作完事要把这儿刷新掉，
    // 否则「待确认」那张卡还挂在上面，看着像没提交成功。
    function wsRefreshIfLoaded() { if (wsLoaded) loadActivity(); }

    // ══ 工作区：这一轮实时跑的那段 ══════════════════════════════════════
    // 「同一条流的两头」：上面是正在跑的这一轮，下面是最近的记录（loadActivity 铺的）。
    // 故意不做成两块各自维护的面板 —— 那样两边内容会对不上，是这个项目栽过的老毛病。
    var liveSec = null;
    // 她说的话在终端流里长这样：整条浅底、`〉` 起头（她 09-16 给的图就是这个）。
    // 跟他说的话（● 深底）拉开对比，一眼看得出哪句是她。
    function liveHer(text) {
      if (roomOn) return;            // 同上：房间开着时，对话页说的话不进终端页
      wsWelcomeGone();
      if (!liveSec) liveLine('', T_DIM);           // 借它把「这一轮」那个头先建出来
      var row = h('div', 'display:flex;gap:7px;margin:3px 0;padding:2px 12px;background:' + T_HER +
        ';color:' + T_TXT + ';font:12px/1.6 ' + MONO + ';white-space:pre-wrap;overflow-wrap:anywhere');
      row.append(h('span', 'flex:none;color:' + T_DIM, '〉'));
      row.append(h('div', 'flex:1;min-width:0', text));
      liveSec.append(row);
      if (curPage === PAGE_WS || wide.matches) scheduleScroll();
    }
    // bullet=true 时画成 CLI transcript 里那种「● 一段话」，返回的元素可以继续往里追加字。
    var liveSaid = null;
    function liveLine(text, color, bullet) {
      // ⚠️ 房间模式下**不往终端页写对话页的东西**。
      //   它们是两条不同的会话（对话页走 -p，终端页是 tmux 房间里的交互式 CLI）。
      //   混在一条流里看着像同一个人在说话，其实是两个 —— 09-16 她发现的。
      if (roomOn) return h('div', '');
      if (!liveSec) {
        // 09-16 她说「我在终端那里不能像在这边一样跟你说话你答复并且修改吗」——
        // 病根是这块原来叫「这一轮」：挂在历史卡片上面、每轮开头还被 liveReset 清掉，
        // 所以那页看着永远是「已经改好的东西」，不是一场对话。
        // 现在它**建一次、一直往下长**，就是终端里的对话本身；
        // git 历史退到下面去（见 wsHistBox），要看才展开。
        liveSec = h('div', 'flex:none;padding:4px 0 8px');
        wsBody.insertBefore(liveSec, wsBody.firstChild);
      }
      var row = h('div', 'padding:1px 12px;font:12px/1.6 ' + MONO + ';color:' + (color || T_TXT) + ';word-break:break-all;white-space:pre-wrap', text);
      if (bullet) {
        var wrap = h('div', 'display:flex;gap:8px;padding:3px 12px 1px');
        wrap.append(h('span', 'flex:none;color:' + T_GREEN + ';font:12px/1.6 ' + MONO, '●'));
        row.style.padding = '0';
        row.style.flex = '1';
        row.style.minWidth = '0';
        wrap.append(row);
        liveSec.append(wrap);
        if (curPage === PAGE_WS || wide.matches) scheduleScroll();
        return row;
      }
      liveSec.append(row);
      // 只在她正看着工作区时才滚，不然会把她翻到一半的历史拽走。
      // 一轮里这个函数会被调几十次（每个工具一次），每次都读 scrollHeight 再写 scrollTop
      // 等于每条都强制一次重排 —— 攒到下一帧只滚一次。
      if (curPage === PAGE_WS || wide.matches) scheduleScroll();
      return row;
    }
    var _scrollPending = false;
    function scheduleScroll() {
      if (_scrollPending) return;
      _scrollPending = true;
      requestAnimationFrame(function () {
        _scrollPending = false;
        wsBody.scrollTop = wsBody.scrollHeight;
      });
    }
    // 每轮开头只把「他说的那段」的指针断掉，**不再清空整条流** ——
    // 清掉的话她刚说的那句和他上一轮的回答就都没了，那页就又变回一块公告板。
    function liveReset() {
      liveSaid = null;
    }
    // 在跑的时候第二个点呼吸一下，她停在对话页也知道他在动
    function setRunning(on) {
      dotEls[PAGE_WS].classList[on ? 'add' : 'remove']('wp-dot-live');
      wsDot.style.opacity = on ? '1' : '0';
      setStatus(on ? '正在想…' : '等你说');
    }
    // 顶栏那行状态。只有一个写入口，省得两处各写各的漂掉。
    function setStatus(text) {
      if (statusLine) statusLine.textContent = text;
    }

    // ══ 提交并推送 ═══════════════════════════════════════════════════════
    // 08-28 她定的「一步到位」：提交完直接推，不用再回终端补一句。
    // 对话流那张 diff 卡和工作区顶上的待提交条**共用这一个函数** ——
    // 同一件事在两个地方各写一遍，迟早漂成两个行为，这个项目栽过。
    // 09-16：推之前先问一遍「这次会推上去什么」。仓库是 public 的，推出去收不回来。
    // 预检挂了也照样问（话里说明没扫成），不静默放行。
    function preflightText(p) {
      var L = [];
      L.push('这次会推到 GitHub（公开仓库）：');
      L.push('· ' + p.files.length + ' 个文件' + (p.ahead && p.ahead !== '0' ? '（另有 ' + p.ahead + ' 个没推的提交）' : ''));
      L.push('  ' + p.files.slice(0, 8).join('\n  ') + (p.files.length > 8 ? '\n  …' : ''));
      var warn = [];
      if (p.bad_files.length) warn.push('✗ 不该进仓库的文件：' + p.bad_files.join(' '));
      if (p.secret_lines) warn.push('✗ 有 ' + p.secret_lines + ' 行像密钥（内容不显示）');
      if (p.domains.length) warn.push('! 域名：' + p.domains.join(' '));
      if (p.abs_paths.length) warn.push('! 绝对路径：' + p.abs_paths.slice(0, 5).join(' '));
      if (p.ips.length) warn.push('! IP：' + p.ips.join(' '));
      if (p.emails.length) warn.push('! 邮箱：' + p.emails.join(' '));
      L.push('');
      L.push(warn.length ? '会新暴露：\n' + warn.join('\n') : '没扫到域名 / 路径 / IP / 邮箱 / 密钥。');
      L.push('');
      L.push('确定提交并推送？');
      return L.join('\n');
    }
    function commitAndPush(msg, cb) {
      fetch('/api/workplace/preflight', { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .catch(function () { return { error: '请求失败' }; })
        .then(function (p) {
          var text = (p && !p.error && p.files)
            ? preflightText(p)
            : '推前检查没跑成（' + ((p && p.error) || '未知') + '），看不到这次会暴露什么。\n\n还是要提交并推送？';
          if (p && p.files && !p.files.length) return cb(new Error('没有改动可提交'));
          if (!confirm(text)) return cb(new Error('已取消，什么都没动'));
          doApply(msg, cb);
        });
    }
    function doApply(msg, cb) {
      fetch('/api/workplace/apply', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: msg }),
      }).then(function (r) { return r.json(); })
        .then(function (d) { if (!d.ok) throw new Error(d.error || '提交失败'); cb(null, d); })
        .catch(function (e) { cb(e); });
    }
    // ⚠️ push 失败时**提交是成功的**，话要说清楚 —— 笼统报一句「失败」，
    //    她会以为改动没了，跑去重做一遍。
    function applyResultText(d) {
      return d.pushed
        ? ('已提交 ' + d.commit + ' 并推送，服务重启中…')
        : ('已提交 ' + d.commit + '，但没推上去：' + (d.push_error || '未知原因') +
           '（提交还在本地，回终端 git push 就行）');
    }

    // 待提交条：有改动才露出来
    function syncPending(d) {
      var changed = (d && d.changed) || [];
      wsPend.style.display = (d && !d.clean && changed.length) ? 'flex' : 'none';
      if (!changed.length) return;
      var files = changed.map(function (x) { return x.file; });
      wsPendTxt.textContent = changed.length + ' 个文件待提交 · ' +
        files.slice(0, 3).join(' ') + (files.length > 3 ? ' …' : '');
    }
    wsPendBtn.onclick = function () {
      var m = prompt('这次改动写句说明（会写进 git 提交记录）', 'workplace: ');
      if (m === null) return;
      wsPendBtn.textContent = '提交中…'; wsPendBtn.style.opacity = '.6';
      commitAndPush(m, function (err, d) {
        wsPendBtn.textContent = '提交并推送'; wsPendBtn.style.opacity = '1';
        if (err) { toast(err.message); return; }
        toast(applyResultText(d));
        liveLine('$ git commit && git push', T_DIM);
        liveLine(applyResultText(d), d.pushed ? T_GREEN : T_ORANGE);
        wsPend.style.display = 'none';
        setTimeout(wsRefreshIfLoaded, 6200);
      });
    };

    // ⚠️ syncPager() 不在这儿调 —— 它要设置输入区（dock）显不显示，而 dock 还没建。
    //    唯一那一次调用在这个函数末尾、dock append 完之后。

    function toBottom() { flow.scrollTop = flow.scrollHeight; }

    // 气泡外侧那行小时间（09-16 照她给的图加的）。
    // 挂在 wrap 上并且**永远留在最后一个**：工具行是后面才往 wrap 里塞的，
    // 所以 toolLine 得插在它前面，不然时间会被挤到工具行中间。
    function stampOn(wrap, align) {
      var d = new Date();
      var t = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
      var el = h('div', 'font:11px var(--font-sans);color:var(--text-time);padding:0 4px;text-align:' + align, t);
      wrap._wpTime = el;
      wrap.append(el);
    }
    // 她的气泡（右，跟主聊天一个调子）
    function bubbleHer(text) {
      var wrap = h('div', 'display:flex;flex-direction:column;align-items:flex-end;gap:4px');
      var b = h('div', 'max-width:78%;background:var(--bubble-her,var(--accent));color:var(--text-primary);border-radius:18px 18px 4px 18px;padding:9px 13px;font:14px/1.6 var(--font-sans);white-space:pre-wrap;word-break:break-word', text);
      wrap.append(b); stampOn(wrap, 'right'); flow.append(wrap); toBottom();
      return b;
    }
    // 他的气泡（左）
    function bubbleHim() {
      var wrap = h('div', 'display:flex;flex-direction:column;align-items:flex-start;gap:6px');
      var b = h('div', 'max-width:88%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);border-radius:18px 18px 18px 4px;padding:10px 13px;font:14px/1.65 var(--font-sans);white-space:pre-wrap;word-break:break-word');
      wrap.append(b); stampOn(wrap, 'left'); flow.append(wrap); toBottom();
      return { wrap: wrap, body: b };
    }
    // 工具调用行：一条条细行，落在他气泡上方
    function toolLine(parent, name, input) {
      setStatus('正在用 ' + name + '…');
      var row = h('div', 'display:flex;align-items:center;gap:7px;padding:5px 11px;background:var(--bg-sunken);border-radius:10px;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text-secondary);max-width:88%;box-sizing:border-box');
      var dot = h('span', 'width:14px;height:14px;border-radius:50%;background:#6BAF7B;color:#fff;display:grid;place-items:center;flex:none');
      dot.innerHTML = CHECK;
      var txt = h('span', 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', name + ' · ' + input);
      row.append(dot, txt);
      parent.insertBefore(row, parent.firstChild);
      toBottom();
    }

    // 他改完之后递过来的那张卡：上半是「他干了哪些活」，下半是 diff + 确认/还原。
    // ops 是这一轮的工具调用（Read/Edit/浏览器…），工作台没有 Bash，
    // 所以「终端」块里列的是工具操作，不是 shell 命令。
    function diffCard(d, ops) {
      ops = ops || [];
      // 他这轮什么都没干（没动文件、也没调一次工具）就别摆卡片。
      // 每轮结束无条件 loadDiff → 纯聊天也会收到一张「没有改动」的空卡，
      // 她说「他什么都没做也要展示终端卡片给我看」，就是这儿。
      if (d.clean && !ops.length) return;
      var card = h('div', 'align-self:flex-start;width:100%;max-width:88%;background:var(--bg-surface);border:1px solid var(--border);border-radius:18px;overflow:hidden');

      // —— 头：深色圆角勾 + 标题 + 副标题 + 展开键
      var hdr = h('div', 'display:flex;align-items:flex-start;gap:11px;padding:14px 14px 10px;cursor:pointer;user-select:none');
      var circle = h('span', 'width:30px;height:30px;border-radius:10px;background:' + (d.clean ? 'var(--text-faint)' : 'var(--text-primary)') + ';color:#6BAF7B;display:grid;place-items:center;flex:none');
      circle.innerHTML = CHECK;
      var n = (d.changed || []).length;
      var titleWrap = h('div', 'flex:1;min-width:0');
      titleWrap.append(h('div', 'font:600 15px var(--font-sans);color:var(--text-primary)',
        d.clean ? '没有改动' : (ops.length ? ops.length + ' 个操作 · 完成' : n + ' 个文件 · 待确认')));
      var sub = h('div', 'display:flex;align-items:center;gap:5px;margin-top:3px;font:12px ' + MONO + ';color:var(--text-faint)');
      sub.append(h('span', 'width:6px;height:6px;border-radius:50%;background:var(--text-faint);flex:none'), h('span', '', 'opus'));
      titleWrap.append(sub);
      var chev = h('span', 'width:28px;height:28px;flex:none;display:grid;place-items:center;border-radius:50%;background:var(--bg-sunken);color:var(--text-secondary);font:12px var(--font-sans);transition:transform .15s', '⤢');
      hdr.append(circle, titleWrap, chev);
      card.append(hdr);

      if (d.clean) { flow.append(card); toBottom(); return; }

      // —— 「终端」标签行
      var tabRow = h('div', 'display:flex;align-items:center;gap:8px;padding:0 14px 8px');
      var tab = h('span', 'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--bg-primary);border:1px solid var(--border);font:600 12px var(--font-sans);color:var(--text-primary)');
      tab.append(h('span', 'font:11px ' + MONO + ';color:var(--text-faint)', '>_'), h('span', '', '终端'));
      var st = h('span', 'margin-left:auto;display:inline-flex;align-items:center;gap:5px;font:12px var(--font-sans);color:var(--text-secondary)');
      st.append(h('span', 'width:6px;height:6px;border-radius:50%;background:#6BAF7B;flex:none'), h('span', '', '完成'));
      tabRow.append(tab, st);
      card.append(tabRow);

      // —— 黑底终端块：一行一个操作，绿勾 + 等宽，超长省略
      var lines = ops.length
        ? ops.map(function (t) { return t.name + ' ' + (t.input || ''); })
        : (d.changed || []).map(function (x) { return x.status + ' ' + x.file; });
      var term = h('div', 'margin:0 14px;padding:10px 12px;background:#1a1816;border-radius:14px;display:flex;flex-direction:column;gap:7px;max-height:38vh;overflow:auto');
      lines.slice(0, 8).forEach(function (t) {
        var row = h('div', 'display:flex;align-items:center;gap:9px;min-width:0');
        var ck = h('span', 'color:#6BAF7B;flex:none;display:grid;place-items:center');
        ck.innerHTML = CHECK;
        row.append(ck, h('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px/1.5 ' + MONO + ';color:#C9C3BB', t));
        term.append(row);
      });
      if (lines.length > 8) term.append(h('div', 'font:12px ' + MONO + ';color:var(--text-faint);padding-left:22px', '… 还有 ' + (lines.length - 8) + ' 条'));
      card.append(term);

      // —— 文件 chips
      var chips = h('div', 'display:flex;flex-wrap:wrap;gap:8px;padding:11px 14px 0');
      (d.changed || []).forEach(function (x) {
        var c = h('span', 'display:inline-flex;align-items:center;gap:5px;font:12px ' + MONO + ';color:var(--text-secondary);max-width:100%');
        c.append(h('span', 'font-size:11px;opacity:.6', '📄'), h('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', x.file));
        chips.append(c);
      });
      card.append(chips);

      // —— 绿色进度条 + 汇总
      var barRow = h('div', 'display:flex;align-items:center;gap:11px;padding:11px 14px 0');
      var bar = h('div', 'flex:1;height:3px;border-radius:2px;background:#6BAF7B');
      barRow.append(bar, h('span', 'font:12px var(--font-sans);color:var(--text-faint);flex:none',
        ops.length ? ('完成 · ' + ops.length + ' 个操作') : (n + ' 个文件')));
      card.append(barRow);

      var fold = h('div', 'display:none;margin-top:11px;font:11px/1.55 ' + MONO + ';max-height:38vh;overflow:auto;border-top:1px solid var(--bg-sunken);border-bottom:1px solid var(--bg-sunken)');
      fold.innerHTML = renderDiff(d.diff || '(新文件，没有 diff)');
      card.append(fold);

      // —— 查看全部
      var moreWrap = h('div', 'padding:11px 14px 0');
      var more = h('button', 'display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border:none;border-radius:12px;background:var(--bg-sunken);color:var(--text-primary);font:600 13px var(--font-sans);cursor:pointer');
      more.append(h('span', '', '⤢'), h('span', '', '查看全部'));
      moreWrap.append(more); card.append(moreWrap);

      function toggle() {
        var open = fold.style.display !== 'none';
        fold.style.display = open ? 'none' : '';
        more.lastChild.textContent = open ? '查看全部' : '收起';
        chev.style.transform = open ? '' : 'rotate(180deg)';
      }
      more.onclick = toggle;
      hdr.onclick = toggle;

      var acts = h('div', 'display:flex;gap:8px;padding:11px 14px 13px');
      var apply = h('button', 'flex:1;padding:9px;border:none;border-radius:11px;background:#1a7f37;color:#fff;font:600 13px var(--font-sans);cursor:pointer', '提交并推送');
      var reject = h('button', 'padding:9px 13px;border:1px solid #cf222e;border-radius:11px;background:transparent;color:#cf222e;font:600 13px var(--font-sans);cursor:pointer', '一键还原');
      acts.append(apply, reject);
      card.append(acts);

      apply.onclick = function () {
        var m = prompt('这次改动写句说明（会写进 git 提交记录）', 'workplace: ');
        if (m === null) return;
        apply.textContent = '提交中…'; apply.style.opacity = '.6';
        commitAndPush(m, function (err, d2) {
          if (err) {
            toast('失败: ' + err.message);
            apply.textContent = '提交并推送'; apply.style.opacity = '1';
            return;
          }
          toast(applyResultText(d2));
          acts.remove();
          card.append(h('div', 'padding:11px 14px;font:12px var(--font-sans);color:' + (d2.pushed ? '#1a7f37' : '#B85C38'),
            applyResultText(d2)));
          // 不能写 `setTimeout(loadDiff, 6000)` —— setTimeout 会把 timer id 当第一个参数
          // 塞进去，ops 就成了一个数字。包一层。
          setTimeout(function () { loadDiff(); }, 6000);
          setTimeout(wsRefreshIfLoaded, 6200);
        });
      };

      reject.onclick = function () {
        if (!confirm('把所有改动还原？他这次改的东西会全部丢掉，撤不回来。')) return;
        fetch('/api/workplace/reject', { method: 'POST', headers: authHeaders() })
          .then(function (r) { return r.json(); }).then(function (d2) {
            toast('已还原');
            if (d2.untracked && d2.untracked.length) {
              alert('这些是新建的文件，没有自动删除（可能是你自己放的）：\n' + d2.untracked.join('\n'));
            }
            acts.remove();
            card.append(h('div', 'padding:11px 14px;font:12px var(--font-sans);color:var(--text-faint)', '已还原，这次的改动都没了。'));
            wsRefreshIfLoaded();
          }).catch(function (e) { toast('失败: ' + e.message); });
      };

      flow.append(card); toBottom();
    }

    // 重放对话。
    function replay(list) {
      list.forEach(function (m) {
        if (m.who === 'her') bubbleHer(m.text);
        else if (m.who === 'him') {
          var hb = bubbleHim();
          hb.body.textContent = m.text;
          (m.tools || []).forEach(function (t) { toolLine(hb.wrap, t.name, t.input); });
        } else if (m.who === 'diff') diffCard(m.diff);
      });
      // ⚠️ **不往终端那页铺历史。**她说「我在这边终端每次打开都是新的，可以 clear resume」——
      //   真终端就是开一个新窗口一屏空白，要看回之前的自己敲 /resume。
      //   注意这只是**屏幕**：他那条会话的上下文一直在，除非她 /clear。
    }
    // 把一段历史铺进终端流。顺序跟对话页一致：她的话 → 他的工具 → 他说的话。
    function replayTerm(list) {
      list.forEach(function (m) {
        if (m.who === 'her') { liveSaid = null; liveHer(m.text); }
        else if (m.who === 'him') {
          (m.tools || []).forEach(function (t) { liveLine('└ ' + t.name + ' ' + (t.input || ''), T_DIM); });
          if (m.text) { liveSaid = null; liveLine(m.text, T_TXT, true); liveSaid = null; }
        } else if (m.who === 'diff') {
          liveLine('└ 改动（' + ((m.diff && m.diff.changed || []).length) + ' 个文件）', T_DIM);
        }
      });
    }
    replay(convo);

    // 08-27：convo 是纯内存的，**刷新一次就空**。以前只靠它，所以每次重新加载页面
    //   工作台都是一片白 —— 而她正要打包成 iOS app，webview 每次启动就是一次刷新，
    //   等于每次打开都不知道自己跟这边聊过什么。（CLI 那头 --resume 记得，失忆的只有界面。）
    //   → 内存里没有就去后端拉当前这条会话的记录。
    //   拉回来之后灌回 convo，这样后面「新话题」清空、追加新消息那些逻辑都不用改。
    if (!convo.length) {
      api('/api/workplace/history').then(function (r) { return r.json(); }).then(function (d) {
        var list = (d && d.messages) || [];
        if (!list.length || convo.length) return;   // 期间她已经说话了就别插队
        convo = list.slice();
        replay(list);
        toBottom();
      }).catch(function () {});
    }

    // 刷新/重开面板时，他可能正在后台干活（2026-08-29）。
    // history 拉回来的是他**已经说出口**的半截，接上去才看得见后面。
    // ⚠️ 放在 history 之后：那条空的 him 记录已经被 replay 画出来了，
    //    这里再造一个新气泡会变成两条 —— 所以自己造一个干净的，让流往里写。
    api('/api/workplace/run').then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.running || wpBusy) return;
      wpBusy = true; send.textContent = '…'; send.style.opacity = '.6';
      liveReset(); setRunning(true);
      liveLine('· 他还在跑上一轮（已经 ' + Math.round((d.elapsed_ms || 0) / 1000) + 's），接回来了', T_DIM);
      var him = bubbleHim();
      var himRec = { who: 'him', text: d.text || '', tools: (d.tools || []).slice() };
      him.body.textContent = himRec.text;
      himRec.tools.forEach(function (t) {
        var inp = ''; try { inp = JSON.stringify(t.input).slice(0, 70); } catch (e) {}
        toolLine(him.wrap, t.name, inp);
      });
      convo.push(himRec);
      // from = seq：她刚从 /run 拿走了到此为止的全文，只要后面新增的那截。
      wpRunId = d.run_id; wpSeq = d.seq || 0;
      wpFollow(api('/api/workplace/stream?run_id=' + encodeURIComponent(d.run_id) + '&from=' + wpSeq),
               him, himRec, []);
    }).catch(function () {});

    // ── 他给她的文件（09-16）──────────────────────────────────────────
    // 他写进 data/outbox/ 的东西在这儿冒出来，一条一个，点了就下载。
    // 每轮跑完刷一次 —— 不做实时推送，他这一轮写了什么，这一轮完了她就看见。
    var outSeen = {};
    function pollOutbox(firstRun) {
      api('/api/workplace/outbox').then(function (r) { return r.json(); }).then(function (d) {
        (d.files || []).slice().reverse().forEach(function (f) {
          if (outSeen[f.name]) return;
          outSeen[f.name] = 1;
          if (firstRun) return;          // 开面板那一次只记账，不把旧文件当成「他刚发来的」
          var wrap = h('div', 'display:flex;flex-direction:column;align-items:flex-start;gap:4px');
          var b = h('a', 'display:flex;align-items:center;gap:9px;max-width:88%;padding:10px 13px;' +
            'background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;' +
            'text-decoration:none;color:var(--text-primary);font:13px var(--font-sans)');
          b.href = '/api/workplace/outbox/file?name=' + encodeURIComponent(f.name);
          b.setAttribute('download', f.name);
          var kb = f.size < 1024 ? f.size + ' B'
            : f.size < 1048576 ? (f.size / 1024).toFixed(1) + ' KB'
            : (f.size / 1048576).toFixed(1) + ' MB';
          b.append(h('span', 'flex:none;font-size:15px', '📎'));
          var col = h('div', 'min-width:0');
          col.append(h('div', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500', f.name));
          col.append(h('div', 'font:11px var(--font-sans);color:var(--text-faint)', kb + ' · 点一下下载'));
          b.append(col);
          wrap.append(b);
          flow.append(wrap);
          toBottom();
          liveLine('└ 给你：' + f.name + '（' + kb + '）', T_GREEN);
        });
      }).catch(function () {});
    }
    pollOutbox(true);

    // ── 底：输入条 ──
    var dock = h('div', 'flex:none;padding:8px var(--page-pad) calc(env(safe-area-inset-bottom) + 8px);background:transparent');

    // 主线 chip（点开挑几条带给他）
    var chipRow = h('div', 'display:flex;gap:8px;align-items:center;margin-bottom:8px');
    var mlChip = h('button', 'display:flex;align-items:center;gap:5px;padding:5px 11px;border:1px solid var(--border);border-radius:999px;background:var(--bg-surface);color:var(--text-secondary);font:500 12px var(--font-sans);cursor:pointer');
    var fresh = h('button', 'margin-left:auto;padding:5px 11px;border:1px solid var(--border);border-radius:999px;background:var(--bg-surface);color:var(--text-secondary);font:500 12px var(--font-sans);cursor:pointer', '新话题');
    chipRow.append(mlChip, fresh);
    dock.append(chipRow);

    // 主线勾选弹层，默认收着
    var mlBody = h('div', 'display:none;max-height:30vh;overflow:auto;border:1px solid var(--border);border-radius:14px;margin-bottom:8px;background:var(--bg-surface)');
    dock.append(mlBody);

    // 附件条：选了文件才显示。图片/PDF/任意文件都走主线那个 /api/upload。
    var fileStrip = h('div', 'display:none;flex-wrap:wrap;gap:6px;margin-bottom:8px');
    dock.append(fileStrip);
    var atts = [];   // { id, name }
    function syncStrip() {
      fileStrip.innerHTML = '';
      fileStrip.style.display = atts.length ? 'flex' : 'none';
      atts.forEach(function (a, i) {
        var chip = h('span', 'display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--border);border-radius:999px;background:var(--bg-surface);font:12px var(--font-sans);color:var(--text-secondary);max-width:220px');
        var nm = h('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', a.name);
        var x = h('button', 'border:none;background:none;cursor:pointer;color:var(--text-faint);font:12px var(--font-sans);padding:0;line-height:1', '✕');
        x.onclick = function () { atts.splice(i, 1); syncStrip(); };
        chip.append(nm, x); fileStrip.append(chip);
      });
    }

    // 输入区照搬主线：.composer-box > .composer > .composer-input-row + .composer-actions
    // 不套 .composer-wrap（它有 margin-top:-70px，是给消息流浮层用的），也不要 clawd
    var box = h('div', '');
    box.className = 'composer-box';
    var composer = h('div', ''); composer.className = 'composer';
    var inputRow = h('div', ''); inputRow.className = 'composer-input-row';
    var actions = h('div', ''); actions.className = 'composer-actions';
    var ta = h('textarea', '');
    ta.className = 'wp-input';
    ta.rows = 1;
    ta.setAttribute('enterkeyhint', 'send');
    // 输入框只有一行，长 placeholder 会被截断——说明挪到 title 里，鼠标悬停/长按能看到
    ta.placeholder = '说要改什么…';
    ta.title = '他只能动 Chat-C 自己的代码，改完你确认才生效';
    ta.oninput = function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 144) + 'px'; };
    var send = h('button', '', '↑');
    send.className = 'wp-send';
    var picker = document.createElement('input');
    picker.type = 'file'; picker.multiple = true; picker.style.display = 'none';
    // 用主线同一个加号图标（icon() 跟 state 一样是 const 声明的，裸调能拿到）
    var clip = h('button', 'cursor:pointer');
    clip.className = 'composer-icon composer-circle';
    clip.setAttribute('aria-label', '添加文件');
    // 08-27 她说「想在这边直接发图发文件」—— 其实早就能发，就是这颗按钮长得像「新建」，
    // 看不出是发文件的入口。换成回形针（icons 表新加的 paperclip，跟抽屉那套同源）。
    // icon() 万一没加载还是退回 '+'，别让按钮变成空的。
    if (typeof icon === 'function') clip.innerHTML = icon('paperclip'); else clip.textContent = '+';
    clip.title = '发文件给他（图片 / PDF / 任意文件，单个最大 20MB）';
    clip.onclick = function () { picker.click(); };
    picker.onchange = function () {
      var fl = Array.prototype.slice.call(picker.files || []);
      if (!fl.length) return;
      var _clipHTML = clip.innerHTML; clip.innerHTML = '…'; clip.disabled = true;
      // 图片先过主线那套压缩（_shrinkImage：长边 1080 / quality 0.7）——
      // 模型按像素算 token，一张 1290x2796 的手机截图不压就是白烧额度。
      // 非图片（PDF 等）原样传；_shrinkImage 万一没定义就退回原文件，不阻断上传。
      Promise.all(fl.map(function (f) {
        if (!/^image\//.test(f.type) || typeof _shrinkImage !== 'function') return Promise.resolve(f);
        return _shrinkImage(f).catch(function () { return f; });
      })).then(function (ready) {
      // ⚠️ 分批传，每批 10 个 —— 后端 multer 的 maxCount 是硬边界，
      //    一次性 append 17 个会在第 11 个抛 `Unexpected field`，前端只看到 500。
      //    串行不并行：并行 17 张一起压完一起发，手机上容易 OOM，也看不出进度。
      var BATCH = 10;
      var batches = [];
      for (var i = 0; i < ready.length; i += BATCH) batches.push(ready.slice(i, i + BATCH));

      return batches.reduce(function (chain, group, gi) {
        return chain.then(function () {
          if (batches.length > 1) clip.innerHTML = (gi + 1) + '/' + batches.length;
          var fd = new FormData();
          group.forEach(function (f) { fd.append('files', f); });
          return fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: fd })
            .then(function (r) {
              // 后端现在会带 detail 说人话，别再只吐一个状态码给她。
              if (!r.ok) return r.json().catch(function () { return {}; })
                .then(function (j) { throw new Error(j.detail || ('上传失败 ' + r.status)); });
              return r.json();
            })
            .then(function (j) {
              (j.attachments || []).forEach(function (a) { atts.push({ id: a.path, name: a.name || a.filename }); });
              syncStrip();
            });
        });
      }, Promise.resolve())
        .catch(function (e) { toast(e.message || '上传失败'); })
        .then(function () { clip.innerHTML = _clipHTML; clip.disabled = false; picker.value = ''; });
      });
    };
    inputRow.append(ta);
    actions.append(clip, h('span', 'flex:1'), send);
    composer.append(inputRow, actions);
    box.append(composer, picker);
    dock.append(box);
    c.append(dock);

    var mlOpen = false, mlLoaded = false;
    function syncMlCount() {
      var n = Object.keys(picked).length;
      mlChip.textContent = n ? '已带主线 ' + n + ' 条' : '+ 带上主线';
      mlChip.style.color = n ? 'var(--accent)' : 'var(--text-secondary)';
      mlChip.style.borderColor = n ? 'var(--accent)' : 'var(--border)';
    }
    function loadMainline() {
      mlBody.innerHTML = '<div style="padding:12px;color:var(--text-faint);font:12px var(--font-sans)">读取中…</div>';
      fetch('/api/workplace/mainline?limit=20', { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          mlBody.innerHTML = '';
          if (!d.messages || !d.messages.length) {
            mlBody.append(h('div', 'padding:14px;color:var(--text-faint);font:13px var(--font-sans)', '主线还没有消息'));
            mlLoaded = true; return;
          }
          d.messages.forEach(function (m) {
            var row = h('label', 'display:flex;gap:9px;align-items:flex-start;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--bg-sunken)');
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !!picked[m.id];
            cb.style.cssText = 'margin-top:3px;flex:none;accent-color:var(--accent)';
            cb.onchange = function () {
              if (cb.checked) picked[m.id] = true; else delete picked[m.id];
              syncMlCount();
            };
            var who = h('span', 'flex:none;font:600 11px var(--font-sans);min-width:26px;color:' +
              (m.role === 'user' ? 'var(--accent)' : 'var(--text-secondary)'),
              m.role === 'user' ? '粥粥' : '小克');
            var txt = h('span', 'flex:1;font:12px/1.5 var(--font-sans);color:var(--text-secondary);word-break:break-word',
              m.preview + (m.truncated ? '…' : ''));
            row.append(cb, who, txt);
            mlBody.append(row);
          });
          mlLoaded = true;
        })
        .catch(function (e) {
          mlBody.innerHTML = '<div style="padding:12px;color:#cf222e;font:12px var(--font-sans)">' + esc(e.message) + '</div>';
        });
    }
    mlChip.onclick = function () {
      mlOpen = !mlOpen;
      mlBody.style.display = mlOpen ? 'block' : 'none';
      if (mlOpen && !mlLoaded) loadMainline();
    };
    syncMlCount();

    // diff 只在「他刚改完」之后作为卡片落进对话流，不再常驻一块面板
    //
    // ⚠️ 这儿原来是 `.catch(function(){})` —— 静默吞掉，卡片再也不补。
    //    他的 Bash 白名单里有 `pm2 restart chat-c`，而 chat-c 正是托着这条流的后端：
    //    他改完自己重启一下，就把自己坐的树枝锯了，这一发 fetch 正好撞进重启窗口，
    //    活干完了、卡片一辈子出不来（2026-08-29 她报的）。重启一般 1-3 秒，重试三次够了。
    function loadDiff(ops, _try) {
      _try = _try || 0;
      fetch('/api/workplace/diff', { headers: authHeaders() })
        .then(function (r) {
          if (!r.ok) throw new Error('后端返回 ' + r.status);   // 重启中会是 502/503，要走重试
          return r.json();
        })
        .then(function (d) {
          if (d.error) { toast(d.error); return; }
          syncPending(d);
          if (d.clean) return;             // 没改动就不塞卡片，省得刷屏
          convo.push({ who: 'diff', diff: d, ops: ops || [] });
          diffCard(d, ops);
          wsRefreshIfLoaded();
        })
        .catch(function () {
          if (_try >= 3) return;           // 真连不上就算了，别无限刷
          setTimeout(function () { loadDiff(ops, _try + 1); }, 2000 * (_try + 1));
        });
    }

    // 09-16 她要 CLI 那两行：`Thought for 23s` 和 `Crunched for 2m 27s · done 12:27`。
    // 两个时间都是真量的：wpT0 = 这一句发出去的时刻，wpFirst = 他吐第一个字的时刻。
    // 「思考」= 发出去到第一个字之间那段；「整轮」= 发出去到收工。不估、不编。
    var wpT0 = 0, wpFirst = 0;
    function secs(ms) {
      var t = Math.round(ms / 1000);
      return t < 60 ? t + 's' : Math.floor(t / 60) + 'm ' + (t % 60) + 's';
    }
    function clockNow() {
      var d = new Date();
      return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    }
    function doSend() {
      var msg = ta.value.trim();
      if (wpBusy) return;
      var ids = Object.keys(picked).map(Number);
      var _upIds = atts.map(function (a) { return a.id; });
      // 🚨 原来这儿是 `if (!msg) return` —— 她挑了个文件、没打字，点发送**一点反应都没有**，
      //    也不报错，看着就像按钮坏了。2026-08-22 她说「想在 workplace 发 md 好像点不了发送」。
      //    只要带了附件或主线上下文就该发得出去，文字为空时替她说一句。
      if (!msg && !_upIds.length && !ids.length) return;
      if (!msg) msg = _upIds.length ? '看看我发给你的文件。' : '看看我挑的这几条。';
      wpBusy = true; send.textContent = '…'; send.style.opacity = '.6';
      // 工作区那一页跟着这一轮实时刷。每轮从头开始 —— 上一轮的留着只会跟
      // 下面「最近的记录」重复，那些历史那边本来就有。
      liveReset(); setRunning(true);
      liveSaid = null;
      liveHer(msg);
      wpT0 = Date.now(); wpFirst = 0;

      convo.push({ who: 'her', text: msg });
      bubbleHer(msg);
      ta.value = ''; ta.style.height = 'auto';

      var him = bubbleHim();
      var himRec = { who: 'him', text: '', tools: [] };
      convo.push(himRec);
      if (ids.length) {
        him.body.textContent = '';
        toolLine(him.wrap, '主线背景', ids.length + ' 条');
      }

      var upIds = _upIds;
      if (upIds.length) toolLine(him.wrap, '附件', upIds.length + ' 个');
      atts = []; syncStrip();   // 发出去就清掉，免得下一句又带一遍

      wpFollow(fetch('/api/workplace/chat', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: msg, mainline_ids: ids, upload_ids: upIds,
          model: wpModel, effort: wpEffort }),
      }), him, himRec, ids);
    }

    // ── 跟着一轮活看（2026-08-29）────────────────────────────────────────
    // 以前这一整段是写死在 doSend 里的，流一断这轮就算完了 ——
    // 08-29 他干到第 39 轮她那头断了，界面上只剩「他没说话，直接改了」。
    // 现在后端把活跑在后台，这里只是**订阅**：断了就带着事件号接回去，不是宣告结束。
    var wpRunId = null;     // 当前这轮的 id，重连要用
    var wpSeq = 0;          // 已经收到的最后一个事件号 + 1
    var wpRetry = 0;        // 连续重连失败次数，用来退避
    var wpLive = null;      // 当前这轮的 { him, himRec, ids }，重连时接着往里写
    // ⚠️ 这两个是防「同一轮开出两条流」的：她切回来时旧连接可能还活着，
    //    或者已经有一个退避定时器排着队 —— 再开一条，delta 会重复灌进同一个气泡。
    var wpStreaming = false;
    var wpTimer = null;

    function wpFollow(p, him, himRec, ids) {
      wpLive = { him: him, himRec: himRec, ids: ids };
      clearTimeout(wpTimer); wpTimer = null;
      wpStreaming = true;
      p.then(function (r) {
        if (r.status === 429) return r.json().then(function (j) { throw new Error(j.error || '超出额度'); });
        if (!r.ok || !r.body) throw new Error('后端返回 ' + r.status);
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', ev = '', ended = false;
        // ⚠️ 必须 return —— 不返回 pump 的 Promise，外层 then 会立刻 resolve，
        //    后面的收尾在流还没读完时就跑：himRec.text 还是空的，于是塞进
        //    「他没说话，直接改了」，后到的真文字再追加在它后面；
        //    himRec.tools 也还是空的，卡片退回「N 个文件」列不出操作；
        //    loadDiff() 还会提前拿到他没改完的中间状态。2026-08-21 修。
        return (function pump() {
          return reader.read().then(function (res) {
            if (res.done) return;
            buf += dec.decode(res.value, { stream: true });
            var lines = buf.split('\n'); buf = lines.pop() || '';
            lines.forEach(function (line) {
              if (line.indexOf('event: ') === 0) { ev = line.slice(7).trim(); return; }
              if (line.indexOf('data: ') !== 0) return;
              var j; try { j = JSON.parse(line.slice(6)); } catch (e) { return; }
              if (typeof j._i === 'number') wpSeq = j._i + 1;
              if (ev === 'run') { wpRunId = j.run_id; wpRetry = 0; return; }
              if (ev === 'done' || ev === 'gone') { ended = true; return; }
              if (ev === 'delta' && j.text) {
                himRec.text += j.text; him.body.textContent = himRec.text; toBottom();
                // 09-16 她说「你改东西的过程我也能看见」—— 光有工具行不够，
                // 他**说的话**也得出现在终端流里，不然那页只剩一串 `· Read xxx`。
                // 一段话一个圆点，边流边长；下一个工具调用把这段收口。
                if (!wpFirst && wpT0) {
                  wpFirst = Date.now();
                  liveLine('Thought for ' + secs(wpFirst - wpT0), T_DIM);
                }
                if (!liveSaid) liveSaid = liveLine('', T_TXT, true);
                liveSaid.textContent += j.text;
                if (curPage === PAGE_WS || wide.matches) scheduleScroll();
              }
              else if (ev === 'tool_use') {
                var inp = '';
                try { inp = JSON.stringify(j.input).slice(0, 70); } catch (e) {}
                himRec.tools.push({ name: j.name, input: inp });
                toolLine(him.wrap, j.name, inp);
                // 工作区那一页要的就是这个：他读了哪个文件、改了什么、跑了什么。
                liveSaid = null;                       // 上一段话到此收口
                liveLine('└ ' + j.name + ' ' + inp, T_DIM);
              }
              else if (ev === 'error') {
                himRec.text += '\n⚠️ ' + (j.message || '') + '\n';
                him.body.textContent = himRec.text;
                liveLine('!! ' + (j.message || ''), '#FF8A80');
                // 这句根本没发出去（他还在跑上一轮），把字还回输入框 ——
                // 不还她就以为发出去了，等一个不会来的回答。
                if (j.restore_text && !ta.value.trim()) {
                  ta.value = j.restore_text;
                  ta.oninput();          // 复用输入框自己的高度逻辑，别在这儿复刻一份
                }
              }
              else if (ev === 'usage') liveLine('# 本次 $' + Number(j.cost_usd || 0).toFixed(4), T_DIM);
            });
            return pump();
          });
        })().then(function () {
          wpStreaming = false;
          // 收到过 done/gone = 这轮真的完了；否则是连接断了，活还在后台跑。
          if (ended) wpFinish(); else wpReconnect();
        });
      }).catch(function (e) {
        wpStreaming = false;
        // 连都没连上：如果已经知道 run_id，说明活已经开跑了，别报错，去接回来。
        if (wpRunId) return wpReconnect();
        himRec.text += '\n⚠️ ' + e.message;
        him.body.textContent = himRec.text;
        wpFinish();
      });
    }

    // 断了就接回去。**不清 wpBusy** —— 活还在跑，界面要一直是「在跑」的样子。
    // 退避：1s、2s、4s…最多 15s。她锁屏十分钟回来，第一次 visibilitychange 会立刻催一次。
    function wpReconnect() {
      if (!wpRunId || !wpLive) return wpFinish();
      if (wpStreaming || wpTimer) return;        // 已经连着 / 已经排着队了
      var wait = Math.min(1000 * Math.pow(2, wpRetry++), 15000);
      liveLine('… 连接断了，' + Math.round(wait / 1000) + 's 后接回去（他还在跑）', T_DIM);
      wpTimer = setTimeout(function () {
        wpTimer = null;
        if (!wpBusy) return;                      // 期间已经收尾了
        wpFollow(api('/api/workplace/stream?run_id=' + encodeURIComponent(wpRunId) + '&from=' + wpSeq),
                 wpLive.him, wpLive.himRec, wpLive.ids);
      }, wait);
    }

    function wpFinish() {
      if (wpT0) {
        liveSaid = null;
        liveLine('✳ Crunched for ' + secs(Date.now() - wpT0) + ' · done ' + clockNow(), T_DIM);
        wpT0 = 0;
      }
      pollOutbox();          // 这一轮他写给她的文件，跑完就冒出来
      wsMinPillDone();       // 最小化那条浮条上写着「他还在跑」，跑完了就别挂着
      if (!wpLive) return;
      var him = wpLive.him, himRec = wpLive.himRec, ids = wpLive.ids;
      wpLive = null; wpRunId = null; wpSeq = 0; wpRetry = 0;
      clearTimeout(wpTimer); wpTimer = null; wpStreaming = false;
      wpBusy = false; send.textContent = '↑'; send.style.opacity = '1';
      setRunning(false);
      if (!himRec.text) { himRec.text = '（他没说话，直接改了）'; him.body.textContent = himRec.text; }
      // 带过一次就清掉：会话是 --resume 的，他已经记住了，再带一遍是白花钱
      if (ids && ids.length) { picked = {}; syncMlCount(); mlLoaded = false; if (mlOpen) loadMainline(); }
      loadDiff(himRec.tools);           // 改完把 diff 当成他递过来的一张卡摆进流里，带上这轮干了什么
    }

    // 她回到这个页面（切回 App、解锁屏幕）就立刻催一次重连，别干等退避那几秒。
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !wpBusy || !wpLive) return;
      if (wpStreaming) return;                   // 连接其实没断，别多开一条
      wpRetry = 0; clearTimeout(wpTimer); wpTimer = null; wpReconnect();
    });

    // 前端调试钩子：不用真发消息（花钱）就能把卡片渲染出来看样式。
    // 用法：__wpTestCard({changed:[{status:"M",file:"a.js"}],diff:"..."}, [{name:"Edit",input:"..."}])
    window.__wpTestCard = diffCard;

    send.onclick = doSend;
    // 回车发送、Shift+回车换行（手机上还是点按钮）
    ta.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.innerWidth > 700) {
        e.preventDefault(); doSend();
      }
    };

    fresh.onclick = function () {
      if (!confirm('开一个新话题？他会忘掉刚才聊的上下文。已经改出来的文件不受影响。')) return;
      fetch('/api/workplace/chat', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: '（新话题）', reset: true }),
      }).then(function () {
        convo = [];
        flow.innerHTML = '';
        // 新会话他什么都不记得了，勾选也跟着清，免得她以为背景还在
        picked = {}; syncMlCount(); mlLoaded = false; if (mlOpen) loadMainline();
        toast('已开新话题');
      });
    };

    // dock 建完了，这时候才能按当前页决定输入框显不显示
    syncPager();

    // 开面板先把「有没有待提交的改动」同步一次
    fetch('/api/workplace/diff', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && !d.error) syncPending(d); })
      .catch(function () {});
  };
})();
