// === MCP 服务器管理页（2026-08-27）===
// 顶掉了原来的 Cinema 槽位。cinema.js 和后端那些 /api/cinema/* 一行没动，
// 只是导航不再指向它了 —— 哪天想要回来，把 index.html 那两处指回去就行。
//
// 【这一页到底在管什么，先看懂再改】
// 他那 39 个工具**不是**一个 server 一个，是全部走 `chatc` 那一座桥。
// 网关 spawn CLI 时带 --strict-mcp-config，所以只认后端生成的那一个文件。
// 这一页改的是那个文件的**真源**（后端 mcp_servers 表），不是直接改文件。
//
// 【为什么开关这么重要，不是装饰】
// 每启用一个 server，它整份工具描述就永久焊进冷前缀（她那儿是 68.8k token），
// 而钱的 71% 烧在缓存重建上。关掉 = CLI 连都不连，一个 token 都不花。
// 所以卡片上要让「开着的花钱、关着的不花」这件事一眼看得出来。
//
// 【密钥】自定义请求头的值后端**永远不回传**，这儿只拿得到 key 名字。
// 所以编辑已有条目时那栏显示「已设置 · 不改就留着」，别去猜原值、更别显示占位符假装有值。

console.log('[mcp] v1 — MCP 服务器管理');

var _mcpServers = [];
var _mcpDirtyAt = 0;
var _mcpToolCount = 0;
var _mcpEditing = null;   // 正在编辑的那条（null = 新建）

// =========== 面板生命周期 ===========

function openMcpPanel() {
  var old = $('mcpPanel');
  if (old) old.remove();
  var p = document.createElement('section');
  p.id = 'mcpPanel';
  p.setAttribute('aria-hidden', 'true');
  p.style.cssText =
    'position:fixed;inset:0;z-index:80;display:none;flex-direction:column;' +
    'background:var(--bg-primary);color:var(--text-primary);overflow:hidden;' +
    'font-family:var(--font-sans)';
  p.innerHTML = _mcpBuildHTML();
  document.body.appendChild(p);
  _mcpBindEvents();
  p.style.display = 'flex';
  p.setAttribute('aria-hidden', 'false');
  _mcpLoad();
}

function closeMcpPanel() {
  var p = $('mcpPanel');
  if (p) { p.style.display = 'none'; p.setAttribute('aria-hidden', 'true'); }
}

// =========== 骨架 ===========

function _mcpBuildHTML() {
  return '' +
  // ── 页头 ──
  '<header style="flex:0 0 auto;display:flex;align-items:center;gap:12px;' +
    'padding:calc(env(safe-area-inset-top,0px) + 14px) var(--page-pad) 14px;' +
    'border-bottom:1px solid var(--border);background:var(--bg-primary)">' +
    '<button id="mcpBackBtn" aria-label="返回" style="width:34px;height:34px;flex:0 0 auto;' +
      'border:none;background:transparent;color:var(--text-primary);font-size:22px;' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'border-radius:var(--radius-full)">‹</button>' +
    '<h1 style="flex:1;margin:0;font:600 var(--text-title)/1.2 var(--font-serif)">MCP 服务器</h1>' +
    '<button id="mcpAddBtn" aria-label="添加 MCP" style="width:34px;height:34px;flex:0 0 auto;' +
      'border:none;background:transparent;color:var(--text-primary);font-size:24px;' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'border-radius:var(--radius-full)">+</button>' +
  '</header>' +

  // ── 「下次说话时生效」横条 ──
  '<div id="mcpDirtyBar" style="display:none;flex:0 0 auto;margin:12px var(--page-pad) 0;' +
    'padding:10px 14px;border-radius:var(--radius-md);background:rgba(218,119,86,.10);' +
    'border:1px solid rgba(218,119,86,.22);color:var(--text-primary);' +
    'font:400 var(--text-sm)/1.5 var(--font-sans)">' +
    '改动会在<b>下一条消息</b>他重新醒来时生效 —— 现在不重启是为了不白付一次全量缓存。' +
  '</div>' +

  // ── 列表 ──
  '<div id="mcpList" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
    'padding:12px var(--page-pad) calc(env(safe-area-inset-bottom,0px) + 28px)"></div>' +

  // ── 底部弹层（添加 / 编辑）──
  '<div id="mcpSheetMask" style="display:none;position:absolute;inset:0;z-index:10;' +
    'background:rgba(31,30,29,.32)"></div>' +
  '<div id="mcpSheet" style="position:absolute;left:0;right:0;bottom:0;z-index:11;' +
    'transform:translateY(100%);transition:transform var(--transition);' +
    'background:var(--bg-primary);border-radius:var(--radius-lg) var(--radius-lg) 0 0;' +
    'box-shadow:0 -8px 40px rgba(31,30,29,.14);max-height:88%;overflow-y:auto;' +
    'padding:0 var(--page-pad) calc(env(safe-area-inset-bottom,0px) + 20px)">' +
    _mcpSheetHTML() +
  '</div>';
}

function _mcpSheetHTML() {
  var lbl = 'display:block;margin:18px 0 8px;font:500 var(--text-sm)/1.4 var(--font-sans);color:var(--text-secondary)';
  var inp = 'width:100%;box-sizing:border-box;padding:13px 14px;border-radius:var(--radius-md);' +
            'border:1px solid var(--border-strong);background:var(--bg-surface);' +
            'color:var(--text-primary);font:400 var(--text-base)/1.4 var(--font-sans);outline:none';
  return '' +
  // 抓手
  '<div style="display:flex;justify-content:center;padding:10px 0 2px">' +
    '<div style="width:36px;height:4px;border-radius:2px;background:var(--border-strong)"></div>' +
  '</div>' +
  // 标题行
  '<div style="display:flex;align-items:center;gap:12px;padding:6px 0 4px">' +
    '<button id="mcpSheetClose" aria-label="关闭" style="width:32px;height:32px;border:none;' +
      'background:transparent;color:var(--text-secondary);font-size:20px;cursor:pointer">✕</button>' +
    '<h2 id="mcpSheetTitle" style="flex:1;margin:0;text-align:center;' +
      'font:600 var(--text-title)/1.2 var(--font-serif)">添加 MCP</h2>' +
    '<div style="width:32px"></div>' +
  '</div>' +

  // 是否启用
  '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;' +
    'margin-top:14px;padding:16px 14px;border-radius:var(--radius-md);background:var(--bg-surface)">' +
    '<span style="font:500 var(--text-base)/1.3 var(--font-sans)">是否启用</span>' +
    _mcpSwitchHTML('mcpFEnabled', true) +
  '</div>' +
  '<p style="margin:8px 2px 0;font:400 12px/1.6 var(--font-sans);color:var(--text-faint)">' +
    '关着的时候他连都不会连它，工具说明也不会进提示词 —— 一个 token 都不花。' +
  '</p>' +

  // 名称
  '<label for="mcpFName" style="' + lbl + '">名称</label>' +
  '<input id="mcpFName" placeholder="my_mcp" autocapitalize="off" autocorrect="off" spellcheck="false" style="' + inp + '">' +
  '<p style="margin:6px 2px 0;font:400 12px/1.5 var(--font-sans);color:var(--text-faint)">' +
    '只能用字母、数字、下划线和减号。' +
  '</p>' +

  // 传输类型
  '<label style="' + lbl + '">传输类型</label>' +
  '<div id="mcpFTransport" data-v="http" style="display:flex;gap:6px;padding:4px;' +
    'border-radius:var(--radius-md);background:var(--bg-sunken)">' +
    '<button type="button" data-t="http" style="flex:1;padding:11px;border:none;cursor:pointer;' +
      'border-radius:9px;font:500 14px/1 var(--font-sans)">Streamable HTTP</button>' +
    '<button type="button" data-t="sse" style="flex:1;padding:11px;border:none;cursor:pointer;' +
      'border-radius:9px;font:500 14px/1 var(--font-sans)">SSE</button>' +
  '</div>' +

  // 地址
  '<label for="mcpFUrl" style="' + lbl + '">服务器地址</label>' +
  '<input id="mcpFUrl" placeholder="https://example.com/mcp" inputmode="url" autocapitalize="off" ' +
    'autocorrect="off" spellcheck="false" style="' + inp + '">' +

  // 自定义请求头
  '<label style="' + lbl + '">自定义请求头</label>' +
  '<div id="mcpFHeaders"></div>' +
  '<button id="mcpAddHeaderBtn" type="button" style="margin-top:10px;padding:11px 16px;' +
    'border-radius:var(--radius-md);border:1px solid var(--border-strong);background:transparent;' +
    'color:var(--text-primary);font:500 14px/1 var(--font-sans);cursor:pointer">＋ 添加请求头</button>' +

  // 测试连接（只有已存在的条目才测得了 —— 要拿库里存的那份密钥）
  '<div id="mcpTestRow" style="display:none;align-items:center;gap:12px;margin-top:20px;' +
    'padding:14px;border-radius:var(--radius-md);background:var(--bg-surface)">' +
    '<button id="mcpTestBtn" type="button" style="flex:0 0 auto;padding:10px 16px;' +
      'border:1px solid var(--border-strong);border-radius:10px;background:transparent;' +
      'color:var(--text-primary);font:500 14px/1 var(--font-sans);cursor:pointer">测试连接</button>' +
    '<span id="mcpTestMsg" style="flex:1;min-width:0;font:400 var(--text-sm)/1.5 var(--font-sans);' +
      'color:var(--text-faint)">点一下才去连它，平时不连。</span>' +
  '</div>' +

  // 错误位
  '<p id="mcpFErr" style="display:none;margin:14px 2px 0;font:400 var(--text-sm)/1.5 var(--font-sans);color:#C0392B"></p>' +

  // 保存 / 删除
  '<button id="mcpSaveBtn" type="button" style="width:100%;margin-top:20px;padding:15px;' +
    'border:none;border-radius:var(--radius-md);background:var(--accent);color:var(--accent-fg);' +
    'font:600 var(--text-base)/1 var(--font-sans);cursor:pointer">保存</button>' +
  '<button id="mcpDeleteBtn" type="button" style="display:none;width:100%;margin-top:10px;' +
    'padding:14px;border:1px solid var(--border-strong);border-radius:var(--radius-md);' +
    'background:transparent;color:#C0392B;font:500 var(--text-base)/1 var(--font-sans);cursor:pointer">删除</button>';
}

// 开关。用 button + aria-checked，不用 checkbox —— 这一页全是内联样式，
// 原生 checkbox 在 iOS 上外观不好统一。
function _mcpSwitchHTML(id, on) {
  return '<button type="button" id="' + id + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" ' +
    'style="flex:0 0 auto;width:52px;height:31px;border:none;border-radius:var(--radius-full);' +
    'cursor:pointer;padding:0;position:relative;transition:background var(--transition);' +
    'background:' + (on ? 'var(--accent)' : 'var(--border-strong)') + '">' +
    '<span style="position:absolute;top:2.5px;left:' + (on ? '23.5px' : '2.5px') + ';width:26px;height:26px;' +
      'border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);' +
      'transition:left var(--transition)"></span>' +
  '</button>';
}

function _mcpSetSwitch(el, on) {
  if (!el) return;
  el.setAttribute('aria-checked', on ? 'true' : 'false');
  el.style.background = on ? 'var(--accent)' : 'var(--border-strong)';
  var k = el.querySelector('span');
  if (k) k.style.left = on ? '23.5px' : '2.5px';
}
function _mcpGetSwitch(el) { return !!el && el.getAttribute('aria-checked') === 'true'; }

// =========== 列表渲染 ===========

function _mcpPill(text, tone) {
  var c = {
    on:   ['rgba(76,140,90,.12)',  '#3F7A4C'],
    off:  ['var(--bg-sunken)',     'var(--text-faint)'],
    info: ['rgba(31,30,29,.05)',   'var(--text-secondary)'],
  }[tone || 'info'];
  return '<span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:var(--radius-full);' +
    'background:' + c[0] + ';color:' + c[1] + ';font:500 11.5px/1.5 var(--font-sans);white-space:nowrap">' +
    escHtml(text) + '</span>';
}

function _mcpRenderList() {
  var box = $('mcpList');
  if (!box) return;

  var bar = $('mcpDirtyBar');
  if (bar) bar.style.display = _mcpDirtyAt ? 'block' : 'none';

  if (!_mcpServers.length) {
    box.innerHTML = '<p style="margin:40px 16px;text-align:center;color:var(--text-faint);' +
      'font:400 var(--text-base)/1.7 var(--font-sans)">还没有配过 MCP。<br>右上角 ＋ 加一个。</p>';
    return;
  }

  box.innerHTML = _mcpServers.map(function (s) {
    var pills = '';
    if (s.builtin) {
      pills += _mcpPill('内置', 'info') + _mcpPill('工具 ' + _mcpToolCount, 'info');
    } else {
      pills += _mcpPill(s.enabled ? '已启用' : '已停用', s.enabled ? 'on' : 'off');
      pills += _mcpPill(s.transport === 'sse' ? 'SSE' : 'HTTP', 'info');
      if (s.header_keys && s.header_keys.length) pills += _mcpPill('请求头 ' + s.header_keys.length, 'info');
      if (s._tools != null) pills += _mcpPill('工具 ' + s._tools, 'info');
    }
    // 停用的整张卡压暗 —— 让「哪些在花钱」一眼看得出来
    var dim = (!s.builtin && !s.enabled) ? 'opacity:.55;' : '';
    return '' +
    '<div class="mcp-card" data-id="' + escHtml(String(s.id)) + '" style="' + dim +
      'display:flex;align-items:center;gap:12px;margin-bottom:10px;padding:14px;' +
      'border-radius:var(--radius-md);background:var(--bg-surface);border:1px solid var(--border)">' +
      // 图标
      '<div style="flex:0 0 auto;width:38px;height:38px;border-radius:10px;position:relative;' +
        'background:var(--bg-sunken);display:flex;align-items:center;justify-content:center;' +
        'font:600 15px/1 var(--font-mono);color:var(--text-secondary)">&gt;_' +
        '<span style="position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border-radius:50%;' +
          'border:2px solid var(--bg-surface);background:' +
          (s.builtin || s.enabled ? '#4C8C5A' : 'var(--text-faint)') + '"></span>' +
      '</div>' +
      // 名字 + pills
      '<div style="flex:1;min-width:0">' +
        '<div style="font:600 15px/1.3 var(--font-sans);color:var(--text-primary);' +
          'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(s.name) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">' + pills + '</div>' +
      '</div>' +
      // 右侧：内置的只读，其余给开关
      (s.builtin
        ? '<span style="flex:0 0 auto;color:var(--text-faint);font:400 12px/1 var(--font-sans)">只读</span>'
        : '<div class="mcp-toggle" data-id="' + escHtml(String(s.id)) + '" style="flex:0 0 auto">' +
            _mcpSwitchHTML('', !!s.enabled) + '</div>') +
    '</div>';
  }).join('');

  // 点卡片 = 编辑（内置的不给编辑）
  box.querySelectorAll('.mcp-card').forEach(function (c) {
    c.addEventListener('click', function (e) {
      if (e.target.closest('.mcp-toggle')) return;      // 点开关不算点卡片
      var s = _mcpFind(c.dataset.id);
      if (!s || s.builtin) return;
      _mcpOpenSheet(s);
    });
  });
  box.querySelectorAll('.mcp-toggle').forEach(function (t) {
    t.addEventListener('click', function (e) {
      e.stopPropagation();
      _mcpToggle(t.dataset.id);
    });
  });
}

function _mcpFind(id) {
  return _mcpServers.filter(function (s) { return String(s.id) === String(id); })[0];
}

// =========== 后端往来 ===========

async function _mcpLoad() {
  try {
    var r = await api('/api/mcp/list');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var d = await r.json();
    _mcpServers = d.servers || [];
    _mcpDirtyAt = d.dirty_at || 0;
    _mcpToolCount = d.tool_count || 0;
  } catch (e) {
    _mcpServers = [];
    var box = $('mcpList');
    if (box) box.innerHTML = '<p style="margin:40px 16px;text-align:center;color:#C0392B;' +
      'font:400 var(--text-base)/1.7 var(--font-sans)">读不到列表：' + escHtml(String(e.message)) + '</p>';
    return;
  }
  _mcpRenderList();
}

async function _mcpToggle(id) {
  var s = _mcpFind(id);
  if (!s || s.builtin) return;
  // 先动界面，请求失败再回滚 —— 开关卡半秒才动手感很差
  s.enabled = !s.enabled;
  _mcpRenderList();
  try {
    var r = await api('/api/mcp/toggle', { method: 'POST', body: JSON.stringify({ id: id }) });
    if (!r.ok) throw new Error();
    _mcpDirtyAt = Date.now();
    _mcpRenderList();
  } catch (e) {
    s.enabled = !s.enabled;
    _mcpRenderList();
  }
}

// =========== 弹层 ===========

function _mcpOpenSheet(server) {
  _mcpEditing = server || null;
  var sh = $('mcpSheet'), mask = $('mcpSheetMask');
  if (!sh) return;

  $('mcpSheetTitle').textContent = server ? '编辑 MCP' : '添加 MCP';
  $('mcpFName').value = server ? server.name : '';
  $('mcpFUrl').value  = server ? server.url  : '';
  _mcpSetSwitch($('mcpFEnabled'), server ? !!server.enabled : true);
  _mcpSetTransport(server && server.transport === 'sse' ? 'sse' : 'http');
  _mcpRenderHeaderRows(server);
  $('mcpFErr').style.display = 'none';
  $('mcpDeleteBtn').style.display = server ? 'block' : 'none';
  $('mcpTestRow').style.display = server ? 'flex' : 'none';
  var tm = $('mcpTestMsg');
  tm.textContent = '点一下才去连它，平时不连。';
  tm.style.color = 'var(--text-faint)';

  mask.style.display = 'block';
  requestAnimationFrame(function () { sh.style.transform = 'translateY(0)'; });
}

function _mcpCloseSheet() {
  var sh = $('mcpSheet'), mask = $('mcpSheetMask');
  if (sh) sh.style.transform = 'translateY(100%)';
  if (mask) mask.style.display = 'none';
  _mcpEditing = null;
}

function _mcpSetTransport(v) {
  var box = $('mcpFTransport');
  if (!box) return;
  box.dataset.v = v;
  box.querySelectorAll('button').forEach(function (b) {
    var on = b.dataset.t === v;
    b.style.background = on ? 'var(--bg-primary)' : 'transparent';
    b.style.color = on ? 'var(--text-primary)' : 'var(--text-secondary)';
    b.style.boxShadow = on ? 'var(--shadow-soft)' : 'none';
  });
}

// 请求头行。编辑已有条目时**只知道 key，不知道值**（后端不回传），
// 所以值那格显示「已设置 · 不改就留着」，留空提交 = 沿用原来的。
function _mcpRenderHeaderRows(server) {
  var box = $('mcpFHeaders');
  if (!box) return;
  box.innerHTML = '';
  var keys = (server && server.header_keys) || [];
  if (keys.length) keys.forEach(function (k) { _mcpAddHeaderRow(k, true); });
}

function _mcpAddHeaderRow(key, existing) {
  var box = $('mcpFHeaders');
  if (!box) return;
  var inp = 'box-sizing:border-box;padding:11px 12px;border-radius:10px;' +
            'border:1px solid var(--border-strong);background:var(--bg-surface);' +
            'color:var(--text-primary);font:400 14px/1.4 var(--font-sans);outline:none';
  var row = document.createElement('div');
  row.className = 'mcp-hrow';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
  row.innerHTML =
    // ⚠️ min-width:0 不能少 —— input 的 min-width 默认是 auto，按 size 属性算固有宽度，
    //    会把 flex-basis 顶开，值那格就被挤成一个点（08-27 截图上真长这样）。
    '<input class="mcp-hk" placeholder="Authorization" value="' + escHtml(key || '') + '" ' +
      'autocapitalize="off" autocorrect="off" spellcheck="false" ' +
      'style="' + inp + ';flex:0 0 38%;min-width:0">' +
    '<input class="mcp-hv" type="password" placeholder="' +
      (existing ? '已设置 · 不改就留着' : '值') + '" ' +
      'autocapitalize="off" autocorrect="off" spellcheck="false" style="' + inp + ';flex:1;min-width:0">' +
    '<button type="button" class="mcp-hdel" aria-label="删掉这行" style="flex:0 0 auto;width:32px;height:32px;' +
      'border:none;background:transparent;color:var(--text-faint);font-size:18px;cursor:pointer">✕</button>';
  row.querySelector('.mcp-hdel').addEventListener('click', function () { row.remove(); });
  box.appendChild(row);
}

async function _mcpSave() {
  var err = $('mcpFErr');
  var name = ($('mcpFName').value || '').trim();
  var url  = ($('mcpFUrl').value || '').trim();
  var tr   = $('mcpFTransport').dataset.v;
  var en   = _mcpGetSwitch($('mcpFEnabled'));

  function fail(m) { err.textContent = m; err.style.display = 'block'; }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) return fail('名称只能用字母、数字、下划线和减号（1~64 位）。');
  if (!/^https?:\/\//i.test(url)) return fail('地址要以 http:// 或 https:// 开头。');

  // 只把「真填了值」的行传上去。留空的行 = 沿用后端存着的那个值。
  var headers = {};
  document.querySelectorAll('#mcpFHeaders .mcp-hrow').forEach(function (r) {
    var k = (r.querySelector('.mcp-hk').value || '').trim();
    var v = r.querySelector('.mcp-hv').value || '';
    if (k && v) headers[k] = v;
  });

  var body = { name: name, transport: tr, url: url, enabled: en, headers: headers };
  if (_mcpEditing) body.id = _mcpEditing.id;

  var btn = $('mcpSaveBtn');
  btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = '保存中…';
  try {
    var r = await api('/api/mcp/save', { method: 'POST', body: JSON.stringify(body) });
    var d = await r.json();
    if (!r.ok) return fail(d.error || '存不进去');
    _mcpCloseSheet();
    _mcpDirtyAt = Date.now();
    await _mcpLoad();
  } catch (e) {
    fail('存不进去：' + e.message);
  } finally {
    btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '保存';
  }
}

async function _mcpDelete() {
  if (!_mcpEditing) return;
  if (!confirm('删掉「' + _mcpEditing.name + '」？他下次醒来就不会再连它了。')) return;
  try {
    await api('/api/mcp/delete', { method: 'POST', body: JSON.stringify({ id: _mcpEditing.id }) });
    _mcpCloseSheet();
    _mcpDirtyAt = Date.now();
    await _mcpLoad();
  } catch (e) {}
}

// 探活。**只在她点的时候才去连** —— 列表加载时不连，
// 不然每开一次这页就往外打 N 枪，还会拖慢开页。
async function _mcpPing(id, el) {
  var old = el.textContent;
  el.textContent = '连接中…';
  try {
    var r = await api('/api/mcp/ping', { method: 'POST', body: JSON.stringify({ id: id }) });
    var d = await r.json();
    el.textContent = d.msg || (d.ok ? '连得上' : '连不上');
    el.style.color = d.ok ? '#3F7A4C' : '#C0392B';
    if (d.tools != null) {
      var s = _mcpFind(id);
      if (s) { s._tools = d.tools; _mcpRenderList(); }
    }
  } catch (e) {
    el.textContent = old;
  }
}

// =========== 事件 ===========

function _mcpBindEvents() {
  $('mcpBackBtn').addEventListener('click', closeMcpPanel);
  $('mcpAddBtn').addEventListener('click', function () { _mcpOpenSheet(null); });
  $('mcpSheetClose').addEventListener('click', _mcpCloseSheet);
  $('mcpSheetMask').addEventListener('click', _mcpCloseSheet);
  $('mcpSaveBtn').addEventListener('click', _mcpSave);
  $('mcpDeleteBtn').addEventListener('click', _mcpDelete);
  $('mcpAddHeaderBtn').addEventListener('click', function () { _mcpAddHeaderRow('', false); });
  $('mcpTestBtn').addEventListener('click', function () {
    if (_mcpEditing) _mcpPing(_mcpEditing.id, $('mcpTestMsg'));
  });
  $('mcpFEnabled').addEventListener('click', function () {
    _mcpSetSwitch(this, !_mcpGetSwitch(this));
  });
  $('mcpFTransport').querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () { _mcpSetTransport(b.dataset.t); });
  });
}
