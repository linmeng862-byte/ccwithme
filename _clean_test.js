// Start from original and make ONE change at a time, verifying each
var fs=require('fs');
var orig=fs.readFileSync('static/index-original.html','utf8');

// Test 1: Just remove the same-mood guard
// Old: if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;
// New: if(!c||!_clawdCache[mood])return;
var t1=orig.replace('if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;','if(!c||!_clawdCache[mood])return;');
var m1=t1.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(m1[1]);console.log('T1 (guard only) syntax: OK')}catch(e){console.log('T1 syntax ERROR:',e.message.substring(0,200))}
console.log('T1 changes:', t1.length - orig.length, 'bytes (should be -21)');

// Test 2: Just add bulb null check
// Old: $('clawdBulb').style.display='none';
// New: var bulbEl=$('clawdBulb');if(bulbEl)bulbEl.style.display='none';
var t2=orig.replace("$('clawdBulb').style.display='none';","var bulbEl=$('clawdBulb');if(bulbEl)bulbEl.style.display='none';");
var m2=t2.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(m2[1]);console.log('T2 (bulb check only) syntax: OK')}catch(e){console.log('T2 syntax ERROR:',e.message.substring(0,200))}
console.log('T2 changes:', t2.length - orig.length, 'bytes');

// Test 3: Both changes together
var t3=orig.replace('if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;','if(!c||!_clawdCache[mood])return;');
t3=t3.replace("$('clawdBulb').style.display='none';","var bulbEl=$('clawdBulb');if(bulbEl)bulbEl.style.display='none';");
var m3=t3.match(/<script>([\s\S]*?)<\/script>/);
try{new Function(m3[1]);console.log('T3 (both) syntax: OK')}catch(e){console.log('T3 syntax ERROR:',e.message.substring(0,200))}
console.log('T3 changes:', t3.length - orig.length, 'bytes');

// Deploy T1 first (most likely: guard change lets code through that shouldn't)
fs.writeFileSync('static/index.html',t1,'utf8');
console.log('DEPLOYED: T1 (guard removal only, no other changes)');

// Save others for later testing
fs.writeFileSync('static/index-T1.html',t1,'utf8');
fs.writeFileSync('static/index-T2.html',t2,'utf8');
fs.writeFileSync('static/index-T3.html',t3,'utf8');
