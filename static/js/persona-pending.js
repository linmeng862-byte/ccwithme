// 人格文件的待确认改动（2026-09-16）
// Cis 用 propose_persona_edit 提一条改动，这个模块把它摆到她眼前：
// 他要改哪一段、改成什么样、为什么。她点「确认」才落盘 —— 他自己落不了盘。
//
// 独立成一个文件，不进主聊天的渲染管线：这张卡片跟消息流没关系，
// 混进去的话每次重画消息都要处理它，迟早出事。
(function () {
  var POLL_MS = 60000;
  var card = null;

  function authHeaders(extra) {
    var h = extra || {};
    // 跟主页面同一把钥匙：chat_token + Bearer（后端 auth() 只认这个）
    try {
      var k = localStorage.getItem('chat_token') || '';
      if (k) h['Authorization'] = 'Bearer ' + k;
    } catch (e) {}
    return h;
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  // 逐行 diff。不做真的 LCS —— old 整段标红、new 整段标绿就够她看了，
  // 一段人格文字通常就几行，配个假的行内高亮反而会骗她。
  function diffHTML(oldStr, newStr) {
    var out = [];
    String(oldStr).split('\n').forEach(function (l) {
      out.push('<div style="background:rgba(217,119,87,.10);color:#9A4B2E;padding:1px 6px;white-space:pre-wrap;word-break:break-word">- ' + esc(l) + '</div>');
    });
    String(newStr).split('\n').forEach(function (l) {
      if (!newStr) return;
      out.push('<div style="background:rgba(107,175,123,.12);color:#2F6B43;padding:1px 6px;white-space:pre-wrap;word-break:break-word">+ ' + esc(l) + '</div>');
    });
    if (!newStr) out.push('<div style="color:var(--text-faint);padding:1px 6px">（整段删掉）</div>');
    return out.join('');
  }

  function close() { if (card) { card.remove(); card = null; } }

  function render(p) {
    close();
    var host = document.getElementById('stream');
    if (!host) return;
    card = document.createElement('div');
    card.style.cssText = 'margin:12px auto;max-width:min(680px,92%);border:1px solid var(--border-strong);' +
      'border-radius:16px;background:var(--bg-surface);overflow:hidden';
    card.innerHTML =
      '<div style="padding:12px 14px 0;font:600 14px var(--font-sans);color:var(--text-primary)">他想改自己的人格文件</div>' +
      '<div style="padding:6px 14px 0;font:13px/1.6 var(--font-sans);color:var(--text-secondary);white-space:pre-wrap"></div>' +
      '<div style="margin:10px 14px;border:1px solid var(--border);border-radius:10px;overflow:auto;max-height:44vh;' +
      'font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace"></div>' +
      '<div style="display:flex;gap:9px;padding:0 14px 13px"></div>';
    var kids = card.children;
    kids[1].textContent = p.why || '';
    kids[2].innerHTML = diffHTML(p.old_str, p.new_str);

    function btn(label, primary, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'flex:1;padding:9px 0;border-radius:10px;cursor:pointer;font:600 13px var(--font-sans);' +
        (primary ? 'border:0;background:var(--accent);color:var(--accent-fg)'
                 : 'border:1px solid var(--border);background:transparent;color:var(--text-secondary)');
      b.onclick = fn;
      return b;
    }
    var note = document.createElement('div');
    note.style.cssText = 'padding:0 14px 12px;font:12px/1.5 var(--font-sans);color:var(--text-faint)';

    kids[3].append(
      btn('确认，改', true, function () {
        kids[3].style.display = 'none';
        note.textContent = '正在落盘…';
        card.append(note);
        fetch('/api/persona/apply', { method: 'POST', headers: authHeaders() })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            note.textContent = d.error ? ('没改成：' + d.error) : d.note;
            if (!d.error) setTimeout(close, 9000);
          })
          .catch(function (e) { note.textContent = '没改成：' + e.message; });
      }),
      btn('不要', false, function () {
        fetch('/api/persona/reject', { method: 'POST', headers: authHeaders() })
          .then(close).catch(close);
      })
    );
    host.append(card);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function poll() {
    fetch('/api/persona/pending', { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.pending) { if (!card) render(d.pending); }
        else close();
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poll);
  else poll();
  setInterval(poll, POLL_MS);
})();
