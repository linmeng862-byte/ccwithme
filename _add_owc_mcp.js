var fs = require('fs');
var f = fs.readFileSync('C:/Users/123/.claude/projects/C--Users-123/.mcp.json', 'utf8');
f = f.replace('"galatea-garden": {', '"open-watch-cinema": { "command": "node", "args": ["E:/open-watch-cinema-main/open-watch-cinema-main/mcp/server.mjs"] },\n    "galatea-garden": {');
fs.writeFileSync('C:/Users/123/.claude/projects/C--Users-123/.mcp.json', f);
console.log('OWC MCP added!');
