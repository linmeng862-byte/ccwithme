// 工具台速查页生成器（09-05）
// 用法：node scripts/build-tools-page.js   → 写出 pages/tools.html
// 页面走 backend.js 里的 /tools 路由（authFile 鉴权，浏览器用 ?t=TOKEN 打开）。
// 冷热次数 = assistant 消息里工具名出现的次数，粗略信号，不是精确调用统计。
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const L=fs.readFileSync(path.join(ROOT,'backend.js'),'utf8').split('\n');
const _i=L.findIndex(l=>l.startsWith('const TOOLS = ['));
let _j=_i; while(L[_j]!=='];') _j++;
const T=eval('('+L.slice(_i,_j).join('\n').replace('const TOOLS = ','')+'\n])');
const D=require('better-sqlite3');const d=new D(path.join(ROOT,'data','claude.db'),{readonly:true});
const rows=d.prepare("select content,traces from messages where role='assistant'").all();
const blob=rows.map(r=>(r.content||'')+(r.traces||'')).join('\n');
const use=Object.fromEntries(T.map(t=>[t.name,(blob.match(new RegExp(t.name,'g'))||[]).length]));
const GROUP={
 '看她':['read_her_thinking','read_her_body','measure_her_heart','look_through_camera','read_voice_favorites','read_checklist','read_annotations','read_diary','search_chat_history','read_uploaded_file','reading_context'],
 '够到她':['reach_her','call_her','hangup_call','leave_watch_note','issue_command','ask_rewrite','annotation_reply','diary_comment','send_sticker','share_music','send_file','send_gallery_photo','reading_note','reading_highlight'],
 '记忆 / 内心':['trace','recall','nocturne_hold','nocturne_breath','nocturne_texture','drive','wander','wander_mark','undercurrent','garden','origin','trail_family','revise','save_note'],
 '做东西':['create_file','edit_file','create_artifact','generate_image','create_gallery_album','save_to_gallery','list_gallery_photos','project_write_file','project_read_file','project_list_files','notion','open_extra'],
 '身体 / 世界':['toy_control','get_weather','get_time','schedule_wakeup'],
};
const cat={};for(const[k,v]of Object.entries(GROUP))v.forEach(n=>cat[n]=k);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const md=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/「(.+?)」/g,'<q>「$1」</q>').replace(/\n/g,'<br>');
const EDITED=['read_checklist','read_voice_favorites','look_through_camera','read_her_body','reach_her','ask_rewrite','read_her_thinking','issue_command','leave_watch_note'];
const heat=n=>use[n]>=20?'hot':use[n]>=5?'warm':use[n]>=1?'cool':'cold';
const HL={hot:'常用',warm:'用过几次',cool:'零星',cold:'从没用过'};
const order=Object.keys(GROUP);
const byCat={};T.forEach(t=>{const c=cat[t.name]||'其他';(byCat[c]=byCat[c]||[]).push(t)});
const sections=[...order,'其他'].filter(c=>byCat[c]).map(c=>{
  const items=byCat[c].sort((a,b)=>use[b.name]-use[a.name]).map(t=>{
    const props=(t.input_schema&&t.input_schema.properties)||{};
    const req=(t.input_schema&&t.input_schema.required)||[];
    const params=Object.entries(props).map(([k,v])=>`<tr><th>${esc(k)}${req.includes(k)?'<span class="req">必填</span>':''}</th><td class="ty">${esc(v.type||'')}${v.enum?' · '+v.enum.map(esc).join(' / '):''}</td><td>${md(v.description||'')}</td></tr>`).join('');
    return `<article class="tool ${heat(t.name)}" data-k="${esc((t.name+' '+t.description).toLowerCase())}">
<header><h3>${esc(t.name)}</h3>
<span class="heat" title="assistant 历史里出现 ${use[t.name]} 次">${HL[heat(t.name)]}<i>${use[t.name]}</i></span>
${EDITED.includes(t.name)?'<span class="tag">09-05 改过语气</span>':''}</header>
<div class="desc">${md(t.description)}</div>
${params?`<div class="pwrap"><table class="params">${params}</table></div>`:'<p class="noparam">无参数</p>'}
</article>`}).join('\n');
  return `<section id="c-${encodeURIComponent(c)}"><h2>${esc(c)}<span class="n">${byCat[c].length}</span></h2>${items}</section>`;
}).join('\n');
const nav=[...order,'其他'].filter(c=>byCat[c]).map(c=>`<a href="#c-${encodeURIComponent(c)}">${esc(c)}<i>${byCat[c].length}</i></a>`).join('');
const cold=T.filter(t=>use[t.name]===0).length;
const html=`<title>他的工具台</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&family=Noto+Sans+SC:wght@400;500;700&display=swap">
<style>
:root{
 --paper:#f4f6f8; --card:#ffffff; --ink:#161a20; --dim:#5d6773; --line:#dde3ea;
 --accent:#2f4fb8; --hot:#b4472a; --warm:#a8712c; --cool:#6f7d8c; --cold:#9aa6b2;
 --tagbg:#e7edfb;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --paper:#101318; --card:#171b22; --ink:#e6eaf0; --dim:#98a3b1; --line:#262d37;
 --accent:#8fa8ff; --hot:#e08a6b; --warm:#d6a869; --cool:#93a1b1; --cold:#69747f;
 --tagbg:#1d2740;
}}
:root[data-theme="dark"]{
 --paper:#101318; --card:#171b22; --ink:#e6eaf0; --dim:#98a3b1; --line:#262d37;
 --accent:#8fa8ff; --hot:#e08a6b; --warm:#d6a869; --cool:#93a1b1; --cold:#69747f;
 --tagbg:#1d2740;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans","Noto Sans SC",system-ui,sans-serif;line-height:1.75;margin:0}
.wrap{max-width:1180px;margin:0 auto;padding:40px 24px 96px;display:grid;grid-template-columns:210px 1fr;gap:40px;align-items:start}
@media(max-width:860px){.wrap{grid-template-columns:1fr;gap:24px;padding-top:24px}aside{position:static!important}}
h1{font-size:26px;margin:0 0 6px;letter-spacing:.01em}
.sub{color:var(--dim);font-size:13.5px;margin:0 0 4px}
aside{position:sticky;top:24px;display:flex;flex-direction:column;gap:14px}
#q{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--ink);font:inherit;font-size:14px}
#q:focus{outline:2px solid var(--accent);outline-offset:1px}
nav{display:flex;flex-direction:column}
nav a{color:var(--dim);text-decoration:none;font-size:14px;padding:5px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between}
nav a:hover{color:var(--accent)}
nav a i{font-style:normal;font-variant-numeric:tabular-nums;font-size:12px;opacity:.7}
section{margin:0 0 40px}
h2{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:600;border-bottom:1px solid var(--line);padding-bottom:8px;margin:0 0 18px;display:flex;gap:10px;align-items:baseline}
h2 .n{font-size:12px;opacity:.6;font-variant-numeric:tabular-nums}
.tool{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:16px 18px;margin-bottom:12px;border-left:3px solid var(--cold)}
.tool.hot{border-left-color:var(--hot)}.tool.warm{border-left-color:var(--warm)}.tool.cool{border-left-color:var(--cool)}
.tool header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}
h3{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:15px;margin:0;font-weight:600}
.heat{font-size:11.5px;color:var(--dim);display:inline-flex;gap:5px;align-items:baseline}
.heat i{font-style:normal;font-variant-numeric:tabular-nums;opacity:.65}
.tool.cold .heat{color:var(--cold)}.tool.hot .heat{color:var(--hot)}
.tag{font-size:11px;background:var(--tagbg);color:var(--accent);padding:1px 7px;border-radius:20px}
.desc{font-size:14.5px;max-width:66ch}
.desc b{font-weight:700}
.desc q{quotes:none;color:var(--dim)}
.pwrap{overflow-x:auto;margin-top:12px}
table.params{border-collapse:collapse;font-size:13px;width:100%}
.params th{text-align:left;font-family:"IBM Plex Mono",monospace;font-weight:600;white-space:nowrap;padding:5px 14px 5px 0;vertical-align:top;color:var(--ink)}
.params td{padding:5px 14px 5px 0;vertical-align:top;color:var(--dim)}
.params .ty{font-family:"IBM Plex Mono",monospace;font-size:12px;white-space:nowrap;opacity:.8}
.params tr+tr th,.params tr+tr td{border-top:1px solid var(--line)}
.req{font-family:"IBM Plex Sans","Noto Sans SC",sans-serif;font-size:10px;color:var(--hot);margin-left:6px;font-weight:400}
.noparam{color:var(--dim);font-size:12.5px;margin:8px 0 0}
.hide{display:none}
footer{grid-column:1/-1;color:var(--dim);font-size:12.5px;border-top:1px solid var(--line);padding-top:14px}
</style>
<div class="wrap">
<aside>
 <div><h1>他的工具台</h1><p class="sub">${T.length} 个 · ${cold} 个从没用过</p></div>
 <input id="q" placeholder="搜工具名 / 描述" autocomplete="off">
 <nav>${nav}</nav>
</aside>
<main>${sections}</main>
<footer>数据取自 backend.js 的 TOOLS 与 claude.db 里 assistant 消息的名字出现次数（粗略冷热，不是精确调用统计）。生成于 2026-09-05。</footer>
</div>
<script>
const q=document.getElementById('q'),tools=[...document.querySelectorAll('.tool')],secs=[...document.querySelectorAll('section')];
q.addEventListener('input',()=>{const v=q.value.trim().toLowerCase();
 tools.forEach(t=>t.classList.toggle('hide',v&&!t.dataset.k.includes(v)));
 secs.forEach(s=>s.classList.toggle('hide',![...s.querySelectorAll('.tool')].some(t=>!t.classList.contains('hide'))));});
</script>`;
fs.writeFileSync(path.join(ROOT,'pages','tools.html'),html);
console.log('written',html.length,'bytes; cold=',cold);
