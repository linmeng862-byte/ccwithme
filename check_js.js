var fs = require('fs');
var html = fs.readFileSync('C:/Users/123/Chat-C/static/index.html','utf8');
var m = html.match(/<script>([\s\S]*?)<\/script>/);
if(!m) { console.log('No inline script'); process.exit(1); }
var js = m[1];

// Find all $('X').something patterns at top level
var lines = js.split('\n');
var inFunction = 0;
lines.forEach(function(line, i){
  var t = line.trim();
  // Track function depth
  var opens = (t.match(/\bfunction\b/g) || []).length;
  var closes = (t.match(/}/g) || []).length;
  inFunction += opens - closes;
  if(inFunction < 0) inFunction = 0;

  if(inFunction === 0 && t.length > 0 && !t.startsWith('//') && !t.startsWith('var ') && !t.startsWith('let ') && !t.startsWith('const ') && !t.startsWith('function ') && !t.startsWith('class ') && !t.startsWith('}') && !t.startsWith('if ') && !t.startsWith('for ') && !t.startsWith('while ') && !t.startsWith('return') && !t.startsWith('try') && !t.startsWith('catch') && !t.startsWith('else') && !t.startsWith('switch') && !t.startsWith('case')){
    console.log('L' + (i+1) + ' (depth=' + inFunction + '): ' + t.substring(0, 150));
  }
});
console.log('--- DONE ---');
