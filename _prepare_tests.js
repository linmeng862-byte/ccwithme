// Prepare test versions for bisecting the changes
var fs=require('fs');
var orig=fs.readFileSync('static/index-original.html','utf8');
var curr=fs.readFileSync('static/index-current.html','utf8');

// Helper: split into before-script, script, after-script
function parts(html){
  var s=html.indexOf('<script>');
  var e=html.indexOf('</script>')+9;
  return {before:html.substring(0,s), script:html.substring(s,e), after:html.substring(e)};
}

var o=parts(orig);
var c=parts(curr);

// === Test 2: Clawd + HTML changes + original JS (except Clawd parts in JS) ===
// This tests if HTML structure changes cause the freeze
var t2 = c.before + o.script + c.after;
// Need to add Clawd emote constants to the script
// Actually this is complex. Let me just prepare by saving the current state.

// === Test 3: Full current but with renderMessage override reverted ===
// This tests if the renderMessage override causes the freeze

// === Test 4: Full current but with new HTML elements removed ===

// For now, just save the current minimal patch as index-minimal.html
var minimal=fs.readFileSync('static/index.html','utf8');
fs.writeFileSync('static/index-minimal.html',minimal,'utf8');
console.log('Saved index-minimal.html');

// Save the vB version (original HTML + current JS)
var vB=o.before+c.script+o.after;
fs.writeFileSync('static/index-vB-origHTML-currJS.html',vB,'utf8');
console.log('Saved index-vB-origHTML-currJS.html');

// Verify syntax of both
[vB, minimal].forEach(function(html, i){
  var m=html.match(/<script>([\s\S]*?)<\/script>/);
  if(m){
    try{new Function(m[1]);console.log('Test '+(i+1)+' syntax: OK')}catch(e){console.log('Test '+(i+1)+' syntax ERROR:',e.message.substring(0,100))}
  }
});

console.log('Done preparing test versions.');
