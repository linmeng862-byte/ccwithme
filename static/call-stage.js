/* ============================================================
   call-stage.js —— 通话中那一层
   2026-09-14。原型见 /call-ui.html。

   ⚠️ 设计前提：**不改通话流程，只挂在它前面。**
   语音条、聊天记录、TTS、听写全都照旧走 index.html 里那一套，
   这一层只是包住几个已有的全局函数看它们什么时候被调用。
   所以 index.html 里只加了一行 <script src="/call-stage.js">。
   哪天这层出问题，删掉那一行，通话立刻回到 09-14 之前的样子。
   ============================================================ */
(function(){
'use strict';
if(window.CallStage) return;

/* ── 样式 ── */
var css = `
.call-stage{position:fixed;inset:0;z-index:320;display:flex;flex-direction:column;
  background:linear-gradient(180deg,#F7F3EC 0%,#EDE8DF 100%);
  padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  animation:csIn .28s ease}
html[data-theme="dark"] .call-stage{background:linear-gradient(180deg,#24221E 0%,#1B1917 100%)}
/* 09-20 自定义壁纸时通话界面也走玻璃（她要的）。它 position:fixed 盖在聊天上，
   底色半透 + backdrop-filter，后面铺着壁纸的 #chat 就磨砂透上来。
   门跟 home.css 末尾那批一致：wall-on 且不是主题背景（主题背景她要求不玻璃）。
   ⚠️ 这段必须写在 call-stage.js 里 —— 这套样式是运行时注入的 <style>，
      在 home.css 之后，同特异度下 home.css 压不住它。 */
html.wall-on:not(.wall-theme):not(.ui-plain) .call-stage{
  background:linear-gradient(180deg,rgba(255,255,255,.44) 0%,rgba(255,255,255,.36) 100%);
  backdrop-filter:blur(34px) saturate(1.2);-webkit-backdrop-filter:blur(34px) saturate(1.2)}
html.wall-on:not(.wall-theme):not(.ui-plain) .cs-ctrl button{
  background:rgba(255,255,255,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
html[data-theme="dark"].wall-on:not(.wall-theme):not(.ui-plain) .call-stage{
  background:linear-gradient(180deg,rgba(28,25,22,.56) 0%,rgba(20,18,16,.6) 100%)}
html[data-theme="dark"].wall-on:not(.wall-theme):not(.ui-plain) .cs-ctrl button{background:rgba(255,255,255,.12)}
@media (prefers-color-scheme:dark){
  html.wall-on:not(.wall-theme):not([data-theme="light"]):not(.ui-plain) .call-stage{
    background:linear-gradient(180deg,rgba(28,25,22,.56) 0%,rgba(20,18,16,.6) 100%)}
  html.wall-on:not(.wall-theme):not([data-theme="light"]):not(.ui-plain) .cs-ctrl button{background:rgba(255,255,255,.12)}
}
.call-stage.out{animation:csOut .25s ease forwards}
@keyframes csIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes csOut{to{opacity:0;transform:translateY(14px)}}

.cs-head{flex:0 0 auto;text-align:center;padding:34px 24px 10px}
.cs-tag{display:flex;align-items:center;justify-content:center;gap:6px;
  font:500 10px/1 var(--font-sans);letter-spacing:.18em;color:#8A8276;text-transform:uppercase;margin:0 0 22px}
.cs-tag i{width:5px;height:5px;border-radius:50%;background:#7BB37B;display:block;animation:csPulse 2s infinite}
@keyframes csPulse{0%,100%{opacity:1}50%{opacity:.25}}

.cs-avatar-wrap{position:relative;width:176px;height:176px;margin:0 auto 20px}
.cs-halo{position:absolute;inset:-14px;border-radius:50%;
  background:radial-gradient(circle,rgba(218,119,86,.22) 0%,rgba(218,119,86,0) 70%);
  opacity:0;transition:opacity .35s ease}
.cs-avatar{position:absolute;inset:0;display:grid;place-items:center;border-radius:50%;
  overflow:hidden;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.07);
  transition:transform .4s cubic-bezier(.4,0,.2,1)}
html[data-theme="dark"] .cs-avatar{background:#F5F3EF}
.cs-avatar img{width:100%;height:100%;object-fit:cover}
.call-stage[data-state="speaking"] .cs-halo{opacity:1;animation:csHalo 1.6s ease-in-out infinite}
.call-stage[data-state="speaking"] .cs-avatar{transform:scale(1.03)}
@keyframes csHalo{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
.call-stage[data-state="listening"] .cs-avatar{transform:scale(.985)}

.cs-name{font:400 30px/1.1 var(--font-serif);color:#201F1D;margin:0 0 6px}
html[data-theme="dark"] .cs-name{color:#F0EDE7}
.cs-status{font:400 13px/1 var(--font-sans);color:#8A8276;margin:0 0 4px;min-height:14px}
.cs-timer{font:400 13px/1 var(--font-mono);color:#A6A39A;letter-spacing:.06em}

/* 中段：只放他这会儿说的那句。语音条照常进聊天记录，这儿不重复。 */
.cs-live{flex:1 1 auto;display:grid;place-items:center;padding:18px 34px;overflow:hidden}
.cs-line{font:400 17px/1.75 var(--font-serif);color:var(--text-secondary);
  text-align:center;margin:0;max-width:22em;transition:opacity .4s ease;
  max-height:100%;overflow-y:auto}
.cs-line::-webkit-scrollbar{width:0}
.cs-line.mine{font-style:italic;opacity:.55;font-family:var(--font-sans);font-size:15px}

.cs-ctrls{flex:0 0 auto;display:flex;justify-content:center;align-items:flex-start;gap:34px;padding:16px 24px 30px}
.cs-ctrl{display:flex;flex-direction:column;align-items:center;gap:8px}
.cs-ctrl button{width:62px;height:62px;border-radius:50%;border:none;cursor:pointer;
  display:grid;place-items:center;background:rgba(255,255,255,.72);color:#4A4740;
  box-shadow:0 2px 10px rgba(0,0,0,.07);transition:transform .15s ease,background .2s ease}
html[data-theme="dark"] .cs-ctrl button{background:rgba(255,255,255,.1);color:#E8E4DC}
.cs-ctrl button:active{transform:scale(.93)}
.cs-ctrl button.on{background:#4A4740;color:#F7F3EC}
.cs-ctrl button.hangup{background:#E0553F;color:#fff;box-shadow:0 6px 18px rgba(224,85,63,.34)}
/* ⚠️ 暗色那条 .cs-ctrl button 的特异性比 .hangup 高，会把红的盖成黑的。这条得排在它后面。 */
html[data-theme="dark"] .cs-ctrl button.hangup{background:#E0553F;color:#fff}
.cs-ctrl span{font:400 11px var(--font-sans);color:#8A8276}

/* 收起之后的小条：通话还在，点一下回去 */
.cs-mini{position:fixed;left:50%;transform:translateX(-50%);z-index:318;
  top:calc(env(safe-area-inset-top) + 8px);display:flex;align-items:center;gap:8px;
  padding:7px 14px;border-radius:999px;border:none;cursor:pointer;
  background:#7BB37B;color:#fff;font:500 12px var(--font-sans);
  box-shadow:0 4px 14px rgba(0,0,0,.18)}
.cs-mini i{width:6px;height:6px;border-radius:50%;background:#fff;display:block;animation:csPulse 2s infinite}
`;
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

/* ── 元素 ── */
var CLAUDE_MARK='<use href="#claude-mark"/>';
var el=null, mini=null, tick=null, lineTimer=null, minimized=false, closing=false;

function avatarHTML(){
  var a=(localStorage.getItem('claude_avatar')||'').trim();
  // 她设过头像就用他的；没设过＝官端那张脸：橙色 logo 花。
  return a ? '<img src="'+a+'" alt="">'
           : '<svg viewBox="0 0 16 16" width="104" height="104" fill="var(--accent)">'+CLAUDE_MARK+'</svg>';
}
function callerName(){
  var n=(localStorage.getItem('claude_name')||'').trim();
  return n||'Claude';
}
function build(){
  var d=document.createElement('div');
  d.className='call-stage';d.id='callStage';d.dataset.state='listening';
  d.innerHTML=
    '<div class="cs-head">'+
      '<div class="cs-tag"><i></i>通话中</div>'+
      '<div class="cs-avatar-wrap"><div class="cs-halo"></div><div class="cs-avatar">'+avatarHTML()+'</div></div>'+
      '<h3 class="cs-name">'+callerName()+'</h3>'+
      '<p class="cs-status" id="csStatus">在听你说…</p>'+
      '<div class="cs-timer" id="csTimer">00:00</div>'+
    '</div>'+
    '<div class="cs-live"><p class="cs-line" id="csLine"></p></div>'+
    '<div class="cs-ctrls">'+
      '<div class="cs-ctrl"><button id="csMute" aria-label="静音">'+
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><path d="M12 19v3"/></svg>'+
      '</button><span id="csMuteLbl">静音</span></div>'+
      '<div class="cs-ctrl"><button class="hangup" id="csHangup" aria-label="挂断">'+
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform:rotate(135deg)"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>'+
      '</button><span>挂断</span></div>'+
      '<div class="cs-ctrl"><button id="csMin" aria-label="收起">'+
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>'+
      '</button><span>收起</span></div>'+
    '</div>';
  document.body.appendChild(d);
  d.querySelector('#csMute').onclick=toggleMute;
  d.querySelector('#csHangup').onclick=function(){ if(window._stopCall)_stopCall(); };
  d.querySelector('#csMin').onclick=minimize;
  return d;
}

/* ── 对外 ── */
function show(){
  if(closing) return;
  minimized=false;
  if(mini){mini.remove();mini=null}
  if(!el) el=build();
  el.style.display='';
  if(!tick) tick=setInterval(function(){
    var s=window._callSeconds||0,t=el&&el.querySelector('#csTimer');
    if(t)t.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  },500);
}
function hide(){
  if(tick){clearInterval(tick);tick=null}
  if(lineTimer){clearTimeout(lineTimer);lineTimer=null}
  if(mini){mini.remove();mini=null}
  minimized=false;
  if(!el) return;
  var node=el;el=null;
  node.classList.add('out');
  setTimeout(function(){try{node.remove()}catch(e){}},260);
}
function minimize(){
  if(!el) return;
  el.style.display='none';minimized=true;
  if(!mini){
    mini=document.createElement('button');mini.className='cs-mini';
    mini.innerHTML='<i></i>通话中 · 点这儿回去';
    mini.onclick=show;
    document.body.appendChild(mini);
  }
}
var LABEL={listening:'在听你说…',speaking:'正在说话',thinking:'在想…'};
function setState(s){
  if(!el)return;
  el.dataset.state=s;
  var n=el.querySelector('#csStatus');if(n)n.textContent=LABEL[s]||'';
}
function setLine(text,mine){
  if(!el)return;
  var n=el.querySelector('#csLine');if(!n)return;
  n.textContent=text||'';
  n.classList.toggle('mine',!!mine);
}
function toggleMute(){
  var on=false;
  try{
    var ms=window._callMediaStream;
    if(ms){ms.getAudioTracks().forEach(function(t){t.enabled=!t.enabled;on=!t.enabled})}
  }catch(e){}
  var b=el&&el.querySelector('#csMute');if(!b)return;
  b.classList.toggle('on',on);
  var l=el.querySelector('#csMuteLbl');if(l)l.textContent=on?'已静音':'静音';
}

/* ── 包住已有的通话函数。原函数一律照常先跑完，这层只看、不拦。 ── */
function wrap(name,after,before){
  var orig=window[name];
  if(typeof orig!=='function') return;   // 函数没了就静默跳过，别把通话带崩
  window[name]=function(){
    if(before){try{before.apply(null,arguments)}catch(e){}}
    var r=orig.apply(this,arguments);
    if(after){try{after.apply(null,arguments)}catch(e){}}
    return r;
  };
}

// 接通＝呼出卡撤掉的那一刻（他开口了），以及她接起来电那一刻。
// ⚠️ _stopCall 内部也会调 _clearOutgoingCall —— 靠 closing 这个闸拦住，
//    否则挂断的一瞬间会先把这层又弹出来一次。
wrap('_stopCall',null,function(){closing=true});
(function(){
  var orig=window._stopCall;
  if(typeof orig!=='function')return;
  window._stopCall=function(){var r=orig.apply(this,arguments);hide();closing=false;return r};
})();
wrap('_clearOutgoingCall',function(){ if(!closing&&window._callWs) show(); });
wrap('_acceptCall',function(){ show() });

// 他在说：delta 一来就是他开口了。字幕跟着攒，说完停 3 秒回到「在听」。
var deltaBuf='';
wrap('_feedCallDelta',function(t){
  if(!t||!el&&!minimized)return;
  deltaBuf+=t;
  setState('speaking');setLine(deltaBuf,false);
  if(lineTimer)clearTimeout(lineTimer);
});
wrap('_flushCallDelta',function(finalText){
  if(finalText)setLine(String(finalText).trim(),false);
  deltaBuf='';
  if(lineTimer)clearTimeout(lineTimer);
  lineTimer=setTimeout(function(){setState('listening')},3000);
});
// 她在说：听写草稿一来就切「在听」，顺便把草稿摆上去。
wrap('_showInterim',function(t){
  if(!el)return;
  if(t){deltaBuf='';setState('listening');setLine(t+'…',true)}
});

window.CallStage={show:show,hide:hide,minimize:minimize,setState:setState,setLine:setLine};
})();
