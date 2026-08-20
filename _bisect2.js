// Create 4 test versions, each removing ONE of the 4 Clawd changes
var fs=require('fs');
var minimal=fs.readFileSync('static/index-minimal.html','utf8');
var orig=fs.readFileSync('static/index-original.html','utf8');

// Test A: Remove emote SVG constants (keep cache, preload, setClawdMood fixes)
var testA=minimal;
// Remove emote SVG block
testA=testA.replace(/var _CLAWD_EMOTE_IDEA=`[\s\S]*?var _CLAWD_EMOTE_LABELS=[^;]+;\s*\n/,'');
// Remove emote references from cache
testA=testA.replace(/,idea:_CLAWD_EMOTE_IDEA,shy:_CLAWD_EMOTE_SHY,angry:_CLAWD_EMOTE_ANGRY,sad:_CLAWD_EMOTE_SAD,love:_CLAWD_EMOTE_LOVE/,'');
// Remove love/sad/idea from preload
testA=testA.replace(/,love:'\/clawd-love\.svg',sad:'\/clawd-sad\.svg',idea:'\/clawd-idea\.svg'/,'');
var mA=testA.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(mA[1]);console.log('Test A (no emote SVGs) syntax: OK')}catch(e){console.log('Test A syntax ERROR:',e.message.substring(0,200))}

// Test B: Revert _clawdCache (keep emote SVGs, preload, setClawdMood fixes)
var testB=minimal;
testB=testB.replace(/_clawdCache=\{idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG,idea:_CLAWD_EMOTE_IDEA,shy:_CLAWD_EMOTE_SHY,angry:_CLAWD_EMOTE_ANGRY,sad:_CLAWD_EMOTE_SAD,love:_CLAWD_EMOTE_LOVE\},/,'_clawdCache={idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG},');
var mB=testB.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(mB[1]);console.log('Test B (revert cache) syntax: OK')}catch(e){console.log('Test B syntax ERROR:',e.message.substring(0,200))}

// Test C: Revert preload moods (keep emote SVGs, cache, setClawdMood fixes)
var testC=minimal;
testC=testC.replace(/,love:'\/clawd-love\.svg',sad:'\/clawd-sad\.svg',idea:'\/clawd-idea\.svg'/,'');
var mC=testC.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(mC[1]);console.log('Test C (revert preload) syntax: OK')}catch(e){console.log('Test C syntax ERROR:',e.message.substring(0,200))}

// Test D: Revert setClawdMood fixes (keep emote SVGs, cache, preload)
var testD=minimal;
var oldGuard='if(!c||!_clawdCache[mood])return;';
var newGuard='if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;';
testD=testD.replace(oldGuard,newGuard);
var oldBulb="var bulbEl=$('clawdBulb');if(bulbEl)bulbEl.style.display='none';";
var newBulb="$('clawdBulb').style.display='none';";
testD=testD.replace(oldBulb,newBulb);
var mD=testD.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(mD[1]);console.log('Test D (revert setClawdMood) syntax: OK')}catch(e){console.log('Test D syntax ERROR:',e.message.substring(0,200))}

// Save all versions
fs.writeFileSync('static/index-testA.html',testA,'utf8');
fs.writeFileSync('static/index-testB.html',testB,'utf8');
fs.writeFileSync('static/index-testC.html',testC,'utf8');
fs.writeFileSync('static/index-testD.html',testD,'utf8');
console.log('Saved tests A-D');

// Deploy Test A first (most likely culprit - SVG constants)
fs.writeFileSync('static/index.html',testA,'utf8');
console.log('DEPLOYED: Test A (no emote SVG constants, keep cache/preload/setClawdMood fixes)');
console.log('Size:', testA.length);
