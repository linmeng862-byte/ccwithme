var fs=require('fs');
var orig=fs.readFileSync('static/index-original.html','utf8');

// Fix: keep guard but allow re-trigger when duration is provided
// Old: if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;
// New: if(!c||!_clawdCache[mood])return;if(mood===_clawdCurrent&&!duration)return;
var oldGuard='if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;';
var newGuard='if(!c||!_clawdCache[mood])return;if(mood===_clawdCurrent&&!duration)return;';
var fixed=orig.replace(oldGuard,newGuard);

// Also add bulb null check (safe change)
fixed=fixed.replace("$('clawdBulb').style.display='none';","var bulbEl=$('clawdBulb');if(bulbEl)bulbEl.style.display='none';");

var m=fixed.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(m[1]);console.log('Syntax: OK')}catch(e){console.log('Syntax ERROR:',e.message.substring(0,200))}

console.log('Changes:', fixed.length - orig.length, 'bytes');

fs.writeFileSync('static/index.html',fixed,'utf8');
console.log('DEPLOYED: fixed guard (allow re-trigger only with duration) + bulb null check');
