var fs=require("fs");
var w=fs.readFileSync("C:/Users/123/Chat-C/static/index.html","utf8");
var s=fs.readFileSync("C:/Users/123/Chat-C/static/index-current.html","utf8");
var step=0;

function verify(){
  var m=w.match(/<script>([\s\S]*?)<\/script>/);
  if(m){try{new Function(m[1]);console.log("Step "+step+": PARSE OK, size="+w.length)}catch(e){console.log("Step "+step+": PARSE ERROR - "+e.message);process.exit(1)}}
}

// === Step 1: Date Search HTML + menu button + JS + Menu fix + Image Context + Timer + Gallery ===
step=1;
// 1a: menu button
var btnStart=s.indexOf('<button class="menu-item" id="moreDateSearch"');
var btnEnd=s.indexOf('</button>',btnStart)+9;
var menuBtn=s.substring(btnStart, btnEnd);
var mmEnd=w.indexOf('</svg> Share music</button>');
mmEnd=w.indexOf('</button>',mmEnd)+9;
w=w.substring(0,mmEnd)+'\n\t  '+menuBtn+w.substring(mmEnd);

// 1b: Date search HTML
var dsStart=s.indexOf('<!-- \u{1F4C5} \u6309\u65E5\u671F\u67E5\u627E -->');
var dsEnd=s.indexOf('<!-- \u{1F3B5} Lyrics Room -->');
var dsHtml=s.substring(dsStart, dsEnd);
var lr=w.indexOf('<!-- \u{1F3B5} Lyrics Room -->');
w=w.substring(0,lr)+dsHtml+w.substring(lr);

// 1c: Menu fix — add classList.remove/add('hidden')
w=w.replace("_moreMenu.style.display='block';", "_moreMenu.classList.remove('hidden');_moreMenu.style.display='block';");
// Replace in more menu section only
var mmSection=w.indexOf('// \u22EF \u66F4\u591A\u83DC\u5355');
var mmEnd2=w.indexOf('// \u{1F3E0} \u300C\u5BB6\u300DProfile \u52A0\u8F7D');
var section=w.substring(mmSection, mmEnd2);
section=section.replace(/_moreMenu\.style\.display='none'/g, "_moreMenu.classList.add('hidden');_moreMenu.style.display='none'");
w=w.substring(0,mmSection)+section+w.substring(mmEnd2);

// 1d: Date search JS + moreDateSearch onclick
var dsJsStart=s.indexOf("$('moreDateSearch')");
var dsJsEnd=s.indexOf('// \u{1F3E0} \u300C\u5BB6\u300DProfile \u52A0\u8F7D');
var dsJs=s.substring(dsJsStart, dsJsEnd);
var initHome=w.indexOf('// \u{1F3E0} \u300C\u5BB6\u300DProfile \u52A0\u8F7D');
w=w.substring(0,initHome)+dsJs+'\n'+w.substring(initHome);

// 1e: Image context menu
var ctxStart=s.indexOf('function _showImageContextMenu');
var ctxEnd=s.indexOf('function saveApiConfig', ctxStart);
var ctxBlock=s.substring(ctxStart, ctxEnd);
var toastEnd=w.indexOf('function toast(');
toastEnd=w.indexOf('clearTimeout(toastTimer);', toastEnd);
toastEnd=w.indexOf('\n', toastEnd);
w=w.substring(0,toastEnd)+'\n\n'+ctxBlock+w.substring(toastEnd);

// 1f: Timer HTML replacement
var oldTimerHtmlStart=w.indexOf('<!-- \u{1F345} \u756A\u8304\u949F\u6D6E\u7A97 -->');
var oldTimerHtmlEnd=w.indexOf('<!-- \u22EF \u66F4\u591A\u83DC\u5355 -->');
var newTimerHtmlStart=s.indexOf('<!-- \u756A\u8304\u949F\u6D6E\u7A97 \u2014 \u5C45\u4E2D\u60AC\u6D6E\u5361\u7247 -->');
var newTimerHtmlEnd=s.indexOf('<!-- \u22EF \u66F4\u591A\u83DC\u5355 -->');
w=w.substring(0,oldTimerHtmlStart)+s.substring(newTimerHtmlStart,newTimerHtmlEnd)+w.substring(oldTimerHtmlEnd);

// 1g: Timer JS replacement
var oldTimerJsStart=w.indexOf('// \u{1F345} \u756A\u8304\u949F');
var oldTimerJsEnd=w.indexOf('// \u{1F3B5} \u97F3\u4E50\u5206\u4EAB');
var newTimerJsStart=s.indexOf('// \u{1F345} \u756A\u8304\u949F');
var newTimerJsEnd=s.indexOf('// \u{1F3B5} \u97F3\u4E50\u5206\u4EAB');
w=w.substring(0,oldTimerJsStart)+s.substring(newTimerJsStart,newTimerJsEnd)+w.substring(oldTimerJsEnd);

// 1h: Gallery Save Card replacement
var oldGscStart=w.indexOf('function _renderGallerySaveCard');
var oldGscEnd=w.indexOf('function _addStarBadgeToImages');
var newGscStart=s.indexOf('function _renderGallerySaveCard');
var newGscEnd=s.indexOf('function _addStarBadgeToImages');
w=w.substring(0,oldGscStart)+s.substring(newGscStart,newGscEnd)+w.substring(oldGscEnd);

// 1i: Add _addStarBadgeToThumb
var badgeEnd3=w.indexOf('function _addBadgeToImg');
var depth=0, i=badgeEnd3;
for(;i<w.length;i++){if(w[i]==='{')depth++;else if(w[i]==='}'){depth--;if(depth===0)break;}}
var insertPoint=i+1;
var thumbStart=s.indexOf('function _addStarBadgeToThumb');
var thumbEnd2=s.indexOf('function _addStarBadgeToImages');
w=w.substring(0,insertPoint)+'\n'+s.substring(thumbStart,thumbEnd2)+w.substring(insertPoint);

verify();

// === Step 2: Attach sheet iOS redesign ===
step=2;
var newAttach = '<!-- \u9644\u4EF6\u5E95\u90E8\u5F39\u51FA -->\n<div class="overlay" id="attachOverlay" aria-hidden="true" inert></div>\n<section class="attach-sheet" id="attachSheet" aria-hidden="true" inert>\n  <div class="attach-sheet-handle"></div>\n  <header class="attach-sheet-head">\n    <button class="attach-sheet-close" id="closeAttach" aria-label="Close">\n      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>\n    </button>\n    <h2 class="attach-sheet-title">Add to Chat</h2>\n    <button class="attach-sheet-all-photos" id="attachAllPhotos">All photos</button>\n  </header>\n  <div class="attach-media-strip">\n    <button class="attach-camera-card" id="attachCameraBtn">\n      <span class="attach-camera-icon">\n        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>\n      </span>\n      <span class="attach-camera-label">Camera</span>\n    </button>\n    <button class="attach-library-card" id="attachLibraryBtn">\n      <span class="attach-library-icon">\n        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>\n      </span>\n      <span class="attach-camera-label">Photos</span>\n    </button>\n    <div class="attach-recent-photos" id="attachRecentPhotos"></div>\n  </div>\n  <div class="attach-action-group">\n    <button class="attach-action-row" id="attachUploadBtn">\n      <span class="attach-action-icon">\n        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>\n      </span>\n      <span class="attach-action-label">Add files</span>\n      <span class="attach-action-hint">Documents &amp; media</span>\n      <svg class="attach-action-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>\n    </button>\n    <div class="attach-action-divider"></div>\n    <button class="attach-action-row" id="attachProjectBtn" onclick="sheet(\\"attach\\",false);toast(\\"Projects coming soon \u2728\\")">\n      <span class="attach-action-icon">\n        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>\n      </span>\n      <span class="attach-action-label">Add to project</span>\n      <span class="attach-action-extra" id="attachProjectName">Chat-C</span>\n      <svg class="attach-action-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>\n    </button>\n    <div class="attach-action-divider"></div>\n    <button class="attach-action-row" id="attachAppearanceBtn">\n      <span class="attach-action-icon">\n        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>\n      </span>\n      <span class="attach-action-label">Tool access</span>\n      <span class="attach-action-extra" id="attachAppearanceStatus">System</span>\n      <svg class="attach-action-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>\n    </button>\n  </div>\n  <div class="attach-bottom-section">\n    <div class="attach-web-search" id="attachWebSearch">\n      <span class="attach-web-search-icon">\n        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>\n      </span>\n      <span class="attach-web-search-label">Search the web</span>\n      <span class="attach-web-search-status" id="attachWebSearchStatus">Off</span>\n      <label class="attach-toggle" onclick="event.stopPropagation()">\n        <input type="checkbox" id="attachWebSearchToggle" onchange="state.webSearch=this.checked;document.getElementById(\\"attachWebSearchStatus\\").textContent=this.checked?\\"On\\":\\"Off\\";localStorage.setItem(\\"chat_web_search\\",this.checked?\\"1\\":\\"0\\")">\n        <span class="attach-toggle-track"></span>\n      </label>\n    </div>\n    <div class="attach-connectors">\n      <button class="attach-connector-btn" id="attachGoogleDrive" onclick="sheet(\\"attach\\",false);toast(\\"Google Drive coming soon\\")">\n        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>\n      </button>\n      <button class="attach-connector-btn" onclick="sheet(\\"attach\\",false);toast(\\"GitHub coming soon\\")">\n        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>\n      </button>\n      <button class="attach-connector-btn" onclick="sheet(\\"attach\\",false);toast(\\"Notion coming soon\\")">\n        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"/><line x1="8" y1="2" x2="8" y2="22"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="16" x2="22" y2="16"/></svg>\n      </button>\n    </div>\n  </div>\n</section>';

var oldAttachStart=w.indexOf('<!-- \u9644\u4EF6\u5E95\u90E8\u5F39\u51FA -->');
var oldAttachEnd=w.indexOf('</section>', oldAttachStart)+'</section>'.length;
w=w.substring(0, oldAttachStart)+newAttach+w.substring(oldAttachEnd);

// Update attachAppearanceBtn handler
w=w.replace(
  'sheet("attach",false);toast("Appearance coming soon \u2728")',
  'sheet("attach",false);toast("Tool access coming soon \u2728")'
);
verify();

// === Step 3: Clawd fixes ===
step=3;
// 3a: Fix setClawdMood — only schedule reset when duration provided
var oldSetClawd="_clawdTimer=setTimeout(function(){";
var sci=w.indexOf(oldSetClawd);
var blockStart=w.indexOf("if(duration){_clawdManualLock", sci-100);
var blockEnd=w.indexOf("},duration);", blockStart)+"},duration);".length;
var oldBlock=w.substring(blockStart, blockEnd);

// The indent before if(duration)
var beforeBlock=w.lastIndexOf("\n", blockStart);
var indentStr=w.substring(beforeBlock+1, blockStart);

var newBlock=indentStr+"if(duration){_clawdManualLock=Date.now()+duration;_clawdTimer=setTimeout(function(){"+
  "_clawdCurrent='idle';c.innerHTML=_clawdCache.idle;c.classList.remove('thinking-bulb');_clawdManualLock=0;"+
  "$('clawdBulb').style.display='none';c.style.left=_clawdBounds.max+'px';"+
  "},duration)}"+
  "_clawdWalkTimer=setTimeout(idleLoop,2000+Math.random()*3000)";

w=w.replace(oldBlock, newBlock);
console.log("Step 3a: setClawdMood fix applied");

// 3b: Add sad, love, idea to preload
w=w.replace(
  "notify:'/clawd-notify.svg'};",
  "notify:'/clawd-notify.svg',sad:'/clawd-sad.svg',love:'/clawd-love.svg',idea:'/clawd-idea.svg'};"
);
console.log("Step 3b: preload moods fix applied:", w.indexOf("clawd-sad.svg")!==-1);

// 3c: Don't clear _clawdWalkTimer
w=w.replace(
  "clearTimeout(_clawdTimer);_clawdWalking=false;c.classList.remove('walking','thinking-bulb');clearTimeout(_clawdWalkTimer);",
  "clearTimeout(_clawdTimer);_clawdWalking=false;c.classList.remove('walking','thinking-bulb');"
);
console.log("Step 3c: walkTimer fix applied");

verify();

fs.writeFileSync("C:/Users/123/Chat-C/static/index.html", w, "utf8");
console.log("ALL DONE. Final size:", w.length);
