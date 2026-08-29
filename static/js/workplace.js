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
    var T_BG = '#1F1E1D', T_BAR = '#2B2926', T_LINE = '#3A3733',
        T_TXT = '#DCD7CF', T_DIM = '#857F76', T_GREEN = '#6BAF7B', T_ORANGE = '#D97757';
    // 页码条：两个小点 + 当前页名。工作区那一页在跑活的时候，第二个点会呼吸 ——
    // 她停在对话页也能一眼看出「他在动」。
    _wpInjectStyle();
    var pager = h('div', 'flex:none;display:flex;align-items:center;justify-content:center;gap:10px;padding:9px 14px 7px');
    var pgName = h('div', 'font:600 13px var(--font-sans);color:var(--text-secondary);min-width:44px;text-align:right', '对话');
    var dotWrap = h('div', 'display:flex;gap:7px;align-items:center');
    var dotEls = ['对话', '工作区'].map(function (_, i) {
      var d = h('button', 'width:7px;height:7px;padding:0;border:none;border-radius:50%;cursor:pointer;background:var(--text-faint);opacity:.3;transition:opacity .18s');
      d.setAttribute('aria-label', '第 ' + (i + 1) + ' 页');
      d.onclick = function () { goPage(i); };
      dotWrap.append(d);
      return d;
    });
    pager.append(pgName, dotWrap, h('div', 'min-width:44px'));
    c.append(pager);

    // 横向滑动容器。scroll-snap 让它一页一页停住，不会卡在两页中间。
    var main = h('div', 'flex:1;display:flex;min-height:0;overflow-x:auto;overflow-y:hidden;' +
      'scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch');
    main.className = 'wp-pages';
    c.append(main);

    var pgChat = h('div', 'flex:none;width:100%;min-width:0;display:flex;flex-direction:column;overflow:hidden;scroll-snap-align:start');
    var flow = h('div', 'flex:1;min-width:0;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px');
    pgChat.append(flow);
    // 终端窗口：wsPane 自己不滚（标题栏要钉住），滚的是里面的 wsBody。
    var wsPane = h('div', 'flex:none;width:100%;min-width:0;display:flex;flex-direction:column;overflow:hidden;scroll-snap-align:start;background:' + T_BG);
    var wsBar = h('div', 'flex:none;display:flex;align-items:center;gap:7px;padding:8px 11px;background:' + T_BAR + ';border-bottom:1px solid ' + T_LINE);
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach(function (col) {
      wsBar.append(h('div', 'width:11px;height:11px;border-radius:50%;flex:none;background:' + col));
    });
    wsBar.append(h('div', 'flex:1;text-align:center;font:11px ' + MONO + ';color:' + T_DIM + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap', 'workplace — 最近的记录'));
    var wsReload = h('button', 'flex:none;padding:2px 9px;border:1px solid ' + T_LINE + ';border-radius:7px;background:transparent;color:' + T_DIM + ';font:11px ' + MONO + ';cursor:pointer', '刷新');
    wsBar.append(wsReload);
    // 待提交条：钉在终端窗口顶上，没有待提交的改动时整条收起来。
    // 这是她要的那个闭环 —— 「在那里你可以直接改然后 push 嘛」。
    // ⚠️ push 这一下**是她点的**，不是他自己跑的：审核层里 git push/commit 仍然全拦着
    //    （permission-hook.py 的 FORBIDDEN_PAT），工作台的他改得了文件、推不了代码。
    //    按钮走后端 /api/workplace/apply，那条路是 auth 过的。
    var wsPend = h('div', 'display:none;flex:none;align-items:center;gap:9px;padding:9px 11px;background:' + T_BAR + ';border-bottom:1px solid ' + T_LINE);
    var wsPendTxt = h('div', 'flex:1;min-width:0;font:11px/1.45 ' + MONO + ';color:' + T_TXT + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap');
    var wsPendBtn = h('button', 'flex:none;padding:5px 11px;border:none;border-radius:8px;background:' + T_GREEN + ';color:#10231A;font:600 11px ' + MONO + ';cursor:pointer', '提交并推送');
    wsPend.append(wsPendTxt, wsPendBtn);

    var wsBody = h('div', 'flex:1;min-width:0;overflow-y:auto;padding:8px 0;font:12px/1.6 ' + MONO);
    wsPane.append(wsBar, wsPend, wsBody);
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
        pager.style.display = 'none';
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
      dotEls.forEach(function (d, i) {
        d.style.opacity = (i === curPage ? '1' : '.3');
        d.style.background = (i === curPage ? 'var(--accent)' : 'var(--text-faint)');
      });
      // 「工作区不要输入框」—— 滑到第 2 页就把整条输入区收掉。
      dock.style.display = (wide.matches || curPage === PAGE_CHAT) ? '' : 'none';
    }
    // 滑到哪一页了。onscroll 每帧都响，只在整页翻过去时才做事。
    main.addEventListener('scroll', function () {
      if (wide.matches || !main.clientWidth) return;
      var p = Math.round(main.scrollLeft / main.clientWidth);
      if (p === curPage) return;
      curPage = p;
      syncPager();
      if (curPage === PAGE_WS && !wsLoaded) loadActivity();   // 第一次滑过去才拉，别开面板就多打一枪
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
      if (r.kind === 'commit') {
        line1.append(h('span', 'font:600 12px ' + MONO + ';color:' + T_ORANGE + ';flex:none', r.sha));
      } else {
        line1.append(h('span', 'font:600 12px ' + MONO + ';color:' + dotColor + ';flex:none',
          isPending ? '待确认' : '操作'));
      }
      line1.append(h('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ' + MONO + ';color:' + T_TXT, r.title || ''));
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

    function loadActivity() {
      wsLoaded = true;
      wsBody.innerHTML = '';      // 标题栏钉在 wsBar 上，这儿只重建流本身

      var tip = h('div', 'padding:6px 12px;font:11px ' + MONO + ';color:' + T_DIM, '读取中…');
      wsBody.append(tip);

      fetch('/api/workplace/activity?limit=20', { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          tip.remove();
          var list = (d && d.records) || [];
          if (d && d.error) {
            wsBody.append(h('div', 'padding:6px 12px;font:11px ' + MONO + ';color:#FF8A80', d.error));
            return;
          }
          if (!list.length) {
            wsBody.append(h('div', 'padding:10px 12px;font:12px ' + MONO + ';color:' + T_DIM, '还没有记录。'));
            return;
          }
          list.forEach(function (r) { wsBody.append(wsCard(r)); });
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
    function liveLine(text, color) {
      if (!liveSec) {
        liveSec = h('div', 'flex:none;border-bottom:1px solid ' + T_LINE + ';padding:4px 0 8px;margin-bottom:4px');
        liveSec.append(h('div', 'padding:2px 12px 4px;font:11px ' + MONO + ';color:' + T_DIM, '── 这一轮 ──'));
        wsBody.insertBefore(liveSec, wsBody.firstChild);
      }
      var row = h('div', 'padding:1px 12px;font:12px/1.6 ' + MONO + ';color:' + (color || T_TXT) + ';word-break:break-all;white-space:pre-wrap', text);
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
    function liveReset() {
      if (liveSec) { liveSec.remove(); liveSec = null; }
    }
    // 在跑的时候第二个点呼吸一下，她停在对话页也知道他在动
    function setRunning(on) {
      dotEls[PAGE_WS].classList[on ? 'add' : 'remove']('wp-dot-live');
    }

    // ══ 提交并推送 ═══════════════════════════════════════════════════════
    // 08-28 她定的「一步到位」：提交完直接推，不用再回终端补一句。
    // 对话流那张 diff 卡和工作区顶上的待提交条**共用这一个函数** ——
    // 同一件事在两个地方各写一遍，迟早漂成两个行为，这个项目栽过。
    function commitAndPush(msg, cb) {
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

    // 她的气泡（右，跟主聊天一个调子）
    function bubbleHer(text) {
      var wrap = h('div', 'display:flex;justify-content:flex-end');
      var b = h('div', 'max-width:78%;background:var(--accent);color:var(--accent-fg);border-radius:18px 18px 4px 18px;padding:9px 13px;font:14px/1.6 var(--font-sans);white-space:pre-wrap;word-break:break-word', text);
      wrap.append(b); flow.append(wrap); toBottom();
      return b;
    }
    // 他的气泡（左）
    function bubbleHim() {
      var wrap = h('div', 'display:flex;flex-direction:column;align-items:flex-start;gap:6px');
      var b = h('div', 'max-width:88%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);border-radius:18px 18px 18px 4px;padding:10px 13px;font:14px/1.65 var(--font-sans);white-space:pre-wrap;word-break:break-word');
      wrap.append(b); flow.append(wrap); toBottom();
      return { wrap: wrap, body: b };
    }
    // 工具调用行：一条条细行，落在他气泡上方
    function toolLine(parent, name, input) {
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
      liveLine('> 他还在跑上一轮（已经 ' + Math.round((d.elapsed_ms || 0) / 1000) + 's），接回来了', T_GREEN);
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
      liveLine('> ' + msg, T_GREEN);

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
        body: JSON.stringify({ message: msg, mainline_ids: ids, upload_ids: upIds }),
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
              if (ev === 'delta' && j.text) { himRec.text += j.text; him.body.textContent = himRec.text; toBottom(); }
              else if (ev === 'tool_use') {
                var inp = '';
                try { inp = JSON.stringify(j.input).slice(0, 70); } catch (e) {}
                himRec.tools.push({ name: j.name, input: inp });
                toolLine(him.wrap, j.name, inp);
                // 工作区那一页要的就是这个：他读了哪个文件、改了什么、跑了什么。
                liveLine('· ' + j.name + ' ' + inp);
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
