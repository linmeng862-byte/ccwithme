var fs=require("fs");
var w=fs.readFileSync("C:/Users/123/Chat-C/static/index.html","utf8");

// Fix 1: setClawdMood — only schedule reset when duration provided
// Find: _clawdTimer=setTimeout(function(){
var marker = "_clawdTimer=setTimeout(function(){";
var idx = w.indexOf(marker);
// Go back to find the start of the if(duration) line
var lineStart = w.lastIndexOf("\n", idx);
var line = w.substring(lineStart + 1, w.indexOf("\n", idx));

console.log("Line:", JSON.stringify(line));

// The full block to replace: from "if(duration){" to "},duration);"
var blockStart = w.indexOf("if(duration){_clawdManualLock", idx - 100);
var blockEnd = w.indexOf("},duration);\n", blockStart) + "},duration);\n".length;
var oldBlock = w.substring(blockStart, blockEnd);

console.log("Block start:", blockStart, "end:", blockEnd);
console.log("Old block:", JSON.stringify(oldBlock.substring(0,200)));

// Build replacement
var indent = "\t  "; // tab then 2 spaces
var newBlock =
  indent + "if(duration){_clawdManualLock=Date.now()+duration;_clawdTimer=setTimeout(function(){\n" +
  indent + "\t_clawdCurrent='idle';c.innerHTML=_clawdCache.idle;c.classList.remove('thinking-bulb');_clawdManualLock=0;\n" +
  indent + "\t$('clawdBulb').style.display='none';c.style.left=_clawdBounds.max+'px';\n" +
  indent + "},duration)}\n" +
  indent + "_clawdWalkTimer=setTimeout(idleLoop,2000+Math.random()*3000)";

w = w.replace(oldBlock, newBlock);
console.log("Fix 1 applied");

// Fix 2: Add sad, love, idea to preload moods
w = w.replace(
  'notify:\'/clawd-notify.svg\'};',
  'notify:\'/clawd-notify.svg\',sad:\'/clawd-sad.svg\',love:\'/clawd-love.svg\',idea:\'/clawd-idea.svg\'};'
);
console.log("Fix 2 applied:", w.indexOf("clawd-sad.svg") !== -1);

// Fix 3: Don't clear _clawdWalkTimer in setClawdMood
w = w.replace(
  'clearTimeout(_clawdTimer);_clawdWalking=false;c.classList.remove(\'walking\',\'thinking-bulb\');clearTimeout(_clawdWalkTimer);',
  'clearTimeout(_clawdTimer);_clawdWalking=false;c.classList.remove(\'walking\',\'thinking-bulb\');'
);
console.log("Fix 3 applied");

fs.writeFileSync("C:/Users/123/Chat-C/static/index.html", w, "utf8");

var m=w.match(/<script>([\s\S]*?)<\/script>/);
if(m){
  try{new Function(m[1]);console.log("PARSE OK")}
  catch(e){console.log("PARSE ERROR:",e.message)}
}
console.log("Size:", w.length);
