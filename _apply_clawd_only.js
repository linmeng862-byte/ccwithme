// Take original index.html and apply ONLY Clawd-related changes
var fs=require('fs');
var orig=fs.readFileSync('static/index-original.html','utf8');
var curr=fs.readFileSync('static/index-current.html','utf8');

// === 1. Add 5 emote SVG constants before _CLAWD_SLEEPING_SVG ===
// Extract from current
var emoteRe=/(var _CLAWD_EMOTE_IDEA=`[\s\S]*?var _CLAWD_EMOTE_LABELS=[^;]+;)/;
var emoteMatch=curr.match(emoteRe);
if(!emoteMatch){console.log('ERROR: Cannot find emote block in current');process.exit(1)}
var emoteBlock=emoteMatch[1];

// Find insertion point in original: right before 'const _CLAWD_SLEEPING_SVG'
var insertPoint=orig.indexOf('const _CLAWD_SLEEPING_SVG');
if(insertPoint<0){console.log('ERROR: Cannot find _CLAWD_SLEEPING_SVG in original');process.exit(1)}
// Go back to start of the line
var lineStart=orig.lastIndexOf('\n',insertPoint);
if(lineStart<0)lineStart=0;else lineStart++;

var patched=orig.substring(0,lineStart)+emoteBlock+'\n'+orig.substring(lineStart);
console.log('Step 1: Added emote block. Size:', patched.length);

// === 2. Update _clawdCache to include emote keys ===
// Old: var _clawdCache={idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG},
// New: var _clawdCache={idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG,idea:_CLAWD_EMOTE_IDEA,shy:_CLAWD_EMOTE_SHY,angry:_CLAWD_EMOTE_ANGRY,sad:_CLAWD_EMOTE_SAD,love:_CLAWD_EMOTE_LOVE},
var oldCache='_clawdCache={idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG},';
var newCache='_clawdCache={idle:_CLAWD_SLEEPING_SVG,groove:_clawdGrooveSVG,idea:_CLAWD_EMOTE_IDEA,shy:_CLAWD_EMOTE_SHY,angry:_CLAWD_EMOTE_ANGRY,sad:_CLAWD_EMOTE_SAD,love:_CLAWD_EMOTE_LOVE},';
if(patched.indexOf(oldCache)>=0){
  patched=patched.replace(oldCache,newCache);
  console.log('Step 2: Updated _clawdCache');
} else {
  console.log('Step 2: _clawdCache not found (may already be updated)');
}

// === 3. Add love/sad/idea to preload moods ===
var oldMoods="notify:'/clawd-notify.svg'};";
var newMoods="notify:'/clawd-notify.svg',love:'/clawd-love.svg',sad:'/clawd-sad.svg',idea:'/clawd-idea.svg'};";
if(patched.indexOf(oldMoods)>=0){
  patched=patched.replace(oldMoods,newMoods);
  console.log('Step 3: Extended preload moods');
} else {
  console.log('Step 3: preload moods not found (may already be updated)');
}

// === 4. Add renderMessage override (music/memory/terminal/clawd) ===
var overrideBlock=curr.match(/(\/\/ 🎵 双向音乐 \+ 💾 收藏卡 \+ 🖥️ 终端卡[\s\S]*?setTimeout\(function\(\)\{)/);
if(overrideBlock){
  // In the original, find the equivalent section and replace it
  var origOverrideStart=patched.indexOf('// 🎵 双向音乐');
  if(origOverrideStart<0){
    // Find renderMessage function definition
    origOverrideStart=patched.indexOf('function renderMessage');
    if(origOverrideStart<0){
      origOverrideStart=patched.indexOf('var renderMessage');
    }
  }
  if(origOverrideStart<0){
    console.log('Step 4: Cannot find renderMessage in original');
  } else {
    // Find the end of the override block in current: the setTimeout right after
    var overrideEnd=curr.indexOf('setTimeout(function(){',curr.indexOf('_origRenderMessage2(md,text)'));
    if(overrideEnd<0){
      // Fallback: find the end of the override function
      console.log('Step 4: Cannot find override end');
    } else {
      // In original, find the beginning of renderMessage and replace it
      // Actually, let's find _origRenderMessage2 in original and replace the whole section
      var origRmStart=orig.indexOf('function renderMessage(');
      if(origRmStart<0)origRmStart=orig.indexOf('var renderMessage=');
      if(origRmStart<0)origRmStart=orig.indexOf('renderMessage=function');

      if(origRmStart<0){
        console.log('Step 4: Cannot find renderMessage definition');
      } else {
        // Find the line start
        var rmLineStart=orig.lastIndexOf('\n',origRmStart);
        if(rmLineStart<0)rmLineStart=0;else rmLineStart++;

        // Find the end of the original renderMessage function
        // It's a huge function — find where it ends and the next top-level code starts
        // The override replaces renderMessage entirely, so we need to find the function boundary
        // This is complex — let's take a simpler approach
        // Just prepend the override before the original renderMessage

        // The current code has: var _origRenderMessage2=renderMessage;\nrenderMessage=function(md,text){\n...
        // followed by the original at the end

        // Simpler: extract the override from current and insert into patched
        var ovStart=curr.indexOf('var _origRenderMessage2=renderMessage;');
        var ovEnd=curr.indexOf('_origRenderMessage2(md,text);setTimeout(function(){');
        if(ovStart>=0 && ovEnd>=0){
          ovEnd=curr.indexOf('\n',ovEnd); // end of that line
          var overrideCode=curr.substring(ovStart,ovEnd+1);

          // In patched, find the same insertion point (before renderMessage)
          // Actually, the current override wraps the original. Let me extract the complete override
          // The override starts at ovStart and ends at the closing } of the last _origRenderMessage2 call

          console.log('Step 4: RenderMessage override found, but applying it is complex.');
          console.log('  Override start:', ovStart, 'end:', ovEnd);
          console.log('  Skipping renderMessage override for now — it might be the problem');
        }
      }
    }
  }
} else {
  console.log('Step 4: Cannot find override block in current');
}

// === 5. Fix setClawdMood (remove same-mood guard + null-check bulb) ===
var oldSM="if(!c||!_clawdCache[mood]||mood===_clawdCurrent)return;";
var newSM="if(!c||!_clawdCache[mood])return;";
if(patched.indexOf(oldSM)>=0){
  patched=patched.replace(oldSM,newSM);
  console.log('Step 5a: Fixed setClawdMood same-mood guard');
}
var oldBulb="$('clawdBulb').style.display='none';";
var newBulb="var bulbEl=$('clawdBulb');if(bulbEl)bulbEl.style.display='none';";
if(patched.indexOf(oldBulb)>=0){
  patched=patched.replace(oldBulb,newBulb);
  console.log('Step 5b: Fixed bulb null check');
}

// === Verify syntax ===
var m=patched.match(/<script>([\s\S]*?)<\/script>/);
if(m){
  try{new Function(m[1]);console.log('Patched script syntax: OK')}catch(e){console.log('Patched script syntax ERROR:',e.message.substring(0,150))}
}

fs.writeFileSync('static/index.html',patched,'utf8');
console.log('Wrote patched index.html ('+patched.length+' bytes)');
