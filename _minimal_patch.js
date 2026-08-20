var fs=require('fs');
var orig=fs.readFileSync('static/index-original.html','utf8');
var curr=fs.readFileSync('static/index-current.html','utf8');

var patched=orig;

// Step 1: Add 5 emote SVG constants + MAP + LABELS
var emoteRe=/var _CLAWD_EMOTE_IDEA=`[\s\S]*?var _CLAWD_EMOTE_LABELS=[^;]+;/;
var emoteMatch=curr.match(emoteRe);
if(!emoteMatch){console.log('ERROR: Cannot find emote block');process.exit(1)}
var emoteBlock=emoteMatch[0];

var insertBefore='const _CLAWD_SLEEPING_SVG';
var insertPos=patched.indexOf(insertBefore);
if(insertPos<0){console.log('ERROR: Cannot find insert point');process.exit(1)}
var lineStart=patched.lastIndexOf('\n',insertPos);
if(lineStart<0)lineStart=0;else lineStart++;
patched=patched.substring(0,lineStart)+emoteBlock+'\n'+patched.substring(lineStart);
console.log('Step 1: Added emote constants. Size:', patched.length);

// Step 2: Update _clawdCache
var oldCache='_clawdCache={idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG},';
var newCache='_clawdCache={idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG,idea:_CLAWD_EMOTE_IDEA,shy:_CLAWD_EMOTE_SHY,angry:_CLAWD_EMOTE_ANGRY,sad:_CLAWD_EMOTE_SAD,love:_CLAWD_EMOTE_LOVE},';
if(patched.indexOf(oldCache)>=0){
  patched=patched.replace(oldCache,newCache);
  console.log('Step 2: Updated _clawdCache');
} else {console.log('Step 2: _clawdCache NOT FOUND')}

// Step 3: Add love/sad/idea to preload moods
var oldMoods="notify:'/clawd-notify.svg'};";
var newMoods="notify:'/clawd-notify.svg',love:'/clawd-love.svg',sad:'/clawd-sad.svg',idea:'/clawd-idea.svg'};";
if(patched.indexOf(oldMoods)>=0){
  patched=patched.replace(oldMoods,newMoods);
  console.log('Step 3: Extended preload moods');
} else {
  var oldMoods2="notify:'/clawd-notify.svg'}";
  if(patched.indexOf(oldMoods2)>=0){
    patched=patched.replace(oldMoods2,"notify:'/clawd-notify.svg',love:'/clawd-love.svg',sad:'/clawd-sad.svg',idea:'/clawd-idea.svg'}");
    console.log('Step 3: Extended preload moods (alt)');
  } else {
    console.log('Step 3: preload moods NOT FOUND');
  }
}

// Step 4a: Fix setClawdMood same-mood guard
var oldSM='if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;';
var newSM='if(!c||!_clawdCache[mood])return;';
if(patched.indexOf(oldSM)>=0){
  patched=patched.replace(oldSM,newSM);
  console.log('Step 4a: Fixed same-mood guard');
} else {console.log('Step 4a: same-mood guard not found')}

// Step 4b: Fix bulb null check
var oldBulb="$('clawdBulb').style.display='none';";
var newBulb="var bulbEl=$('clawdBulb');if(bulbEl)bulbEl.style.display='none';";
if(patched.indexOf(oldBulb)>=0){
  patched=patched.replace(oldBulb,newBulb);
  console.log('Step 4b: Fixed bulb null check');
} else {console.log('Step 4b: bulb null check not found')}

// Verify syntax
var m=patched.match(/<script>([\s\S]*?)<\/script>/);
if(m){
  try{new Function(m[1]);console.log('Patched JS syntax: OK')}catch(e){console.log('Patched JS syntax ERROR:',e.message.substring(0,200))}
}

fs.writeFileSync('static/index.html',patched,'utf8');
console.log('DEPLOYED: minimal Clawd patch ('+patched.length+' bytes)');
