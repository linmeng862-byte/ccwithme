var fs=require('fs');
var html=fs.readFileSync('static/index-current.html','utf8');

var emptySvg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45"></svg>';

var emotes=['_CLAWD_EMOTE_IDEA','_CLAWD_EMOTE_SHY','_CLAWD_EMOTE_ANGRY','_CLAWD_EMOTE_SAD','_CLAWD_EMOTE_LOVE'];
emotes.forEach(function(name){
  var re=new RegExp('(var '+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'=`)'+'<svg[\\s\\S]*?</svg>`;','g');
  html=html.replace(re,'$1'+emptySvg+'`;');
});

var m=html.match(/<script>([\s\S]*?)<\/script>/);
if(m){
  try{new Function(m[1]);console.log('Empty-emote script syntax: OK')}catch(e){console.log('Syntax error:',e.message.substring(0,150))}
}

fs.writeFileSync('static/index.html',html,'utf8');
console.log('Wrote empty-emote index.html');
