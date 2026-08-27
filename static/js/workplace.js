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
  function renderDiff(text) {
    return text.split('\n').map(function (l) {
      var color = '', bg = '';
      if (/^\+\+\+|^---/.test(l))      { color = 'var(--text-faint)'; }
      else if (l[0] === '+')           { color = '#1a7f37'; bg = 'rgba(46,160,67,.10)'; }
      else if (l[0] === '-')           { color = '#cf222e'; bg = 'rgba(207,34,46,.10)'; }
      else if (l.slice(0, 2) === '@@') { color = 'var(--text-faint)'; bg = 'rgba(128,128,128,.08)'; }
      return '<div style="color:' + (color || 'var(--text-secondary)') + ';background:' + (bg || 'transparent') +
             ';padding:0 8px;white-space:pre">' + (esc(l) || '&nbsp;') + '</div>';
    }).join('');
  }

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><polyline points="20 6 9 17 4 12"/></svg>';

  window.renderWorkplaceSheet = function () {
    var c = document.getElementById('workplaceContent');
    if (!c) return;
    c.innerHTML = '';
    // sheet-content 那边有 padding !important，这里得同样加重才压得住
    c.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:0!important;overflow:hidden';

    // ── 顶：额度条 ──
    var meter = h('div', 'flex:none;padding:8px 14px;font:12px var(--font-sans);color:var(--text-faint);border-bottom:1px solid var(--bg-sunken)', '额度加载中…');
    c.append(meter);

    // ── 中：对话流 ──
    var flow = h('div', 'flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px');
    c.append(flow);

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
    var MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
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
      var apply = h('button', 'flex:1;padding:9px;border:none;border-radius:11px;background:#1a7f37;color:#fff;font:600 13px var(--font-sans);cursor:pointer', '确认生效并重启');
      var reject = h('button', 'padding:9px 13px;border:1px solid #cf222e;border-radius:11px;background:transparent;color:#cf222e;font:600 13px var(--font-sans);cursor:pointer', '一键还原');
      acts.append(apply, reject);
      card.append(acts);

      apply.onclick = function () {
        var m = prompt('这次改动写句说明（会写进 git 提交记录）', 'workplace: ');
        if (m === null) return;
        apply.textContent = '提交中…'; apply.style.opacity = '.6';
        fetch('/api/workplace/apply', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ message: m }),
        }).then(function (r) { return r.json(); }).then(function (d2) {
          if (!d2.ok) { toast(d2.error || '提交失败'); apply.textContent = '确认生效并重启'; apply.style.opacity = '1'; return; }
          toast('已提交 ' + d2.commit + '，正在重启…');
          acts.remove();
          card.append(h('div', 'padding:11px 14px;font:12px var(--font-sans);color:#1a7f37', '已提交 ' + d2.commit + '，服务重启中…'));
          setTimeout(loadDiff, 6000);
        }).catch(function (e) {
          toast('失败: ' + e.message);
          apply.textContent = '确认生效并重启'; apply.style.opacity = '1';
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
    if (typeof icon === 'function') clip.innerHTML = icon('plus'); else clip.textContent = '+';
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
    function loadDiff(ops) {
      fetch('/api/workplace/diff', { headers: authHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { toast(d.error); return; }
          meter.textContent = 'workplace 今天已用 $' + Number(d.spent_today || 0).toFixed(3) + ' / 上限 $' + d.cap;
          if (d.clean) return;             // 没改动就不塞卡片，省得刷屏
          convo.push({ who: 'diff', diff: d, ops: ops || [] });
          diffCard(d, ops);
        })
        .catch(function () {});
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

      fetch('/api/workplace/chat', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: msg, mainline_ids: ids, upload_ids: upIds }),
      }).then(function (r) {
        if (r.status === 429) return r.json().then(function (j) { throw new Error(j.error || '超出额度'); });
        if (!r.ok || !r.body) throw new Error('后端返回 ' + r.status);
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', ev = '';
        // ⚠️ 必须 return —— 不返回 pump 的 Promise，外层 then 会立刻 resolve，
        //    .finally() 在流还没读完时就跑：himRec.text 还是空的，于是塞进
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
              if (ev === 'delta' && j.text) { himRec.text += j.text; him.body.textContent = himRec.text; toBottom(); }
              else if (ev === 'tool_use') {
                var inp = '';
                try { inp = JSON.stringify(j.input).slice(0, 70); } catch (e) {}
                himRec.tools.push({ name: j.name, input: inp });
                toolLine(him.wrap, j.name, inp);
              }
              else if (ev === 'error') { himRec.text += '\n⚠️ ' + (j.message || '') + '\n'; him.body.textContent = himRec.text; }
              else if (ev === 'usage') meter.textContent = '本次 $' + Number(j.cost_usd || 0).toFixed(4);
            });
            return pump();
          });
        })();
      }).catch(function (e) {
        himRec.text += '\n⚠️ ' + e.message;
        him.body.textContent = himRec.text;
      }).finally(function () {
        wpBusy = false; send.textContent = '↑'; send.style.opacity = '1';
        if (!himRec.text) { himRec.text = '（他没说话，直接改了）'; him.body.textContent = himRec.text; }
        // 带过一次就清掉：会话是 --resume 的，他已经记住了，再带一遍是白花钱
        if (ids.length) { picked = {}; syncMlCount(); mlLoaded = false; if (mlOpen) loadMainline(); }
        loadDiff(himRec.tools);           // 改完把 diff 当成他递过来的一张卡摆进流里，带上这轮干了什么
      });
    }

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

    // 开面板先把额度和现有改动同步一次
    fetch('/api/workplace/diff', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && !d.error) meter.textContent = 'workplace 今天已用 $' + Number(d.spent_today || 0).toFixed(3) + ' / 上限 $' + d.cap;
      }).catch(function () {});
  };
})();
