var fs = require('fs');
var js = fs.readFileSync('C:/Users/123/Chat-C/check_inline.js', 'utf8');

// Helper: create a mock element
function el(id) {
  return {
    id: id, innerHTML: '', className: '', style: {}, value: '', textContent: '',
    classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){return false}, replace: function(){} },
    dataset: {}, parentNode: null, nextSibling: null, previousSibling: null,
    append: function(){}, appendChild: function(c){return c}, prepend: function(){}, remove: function(){},
    querySelector: function(){return null}, querySelectorAll: function(){return []},
    closest: function(s){return s === '.msg-claude' ? el('claude-row') : s === '.composer-box' ? el('composer-box') : null},
    addEventListener: function(){}, attachEvent: function(){},
    onclick: null, onchange: null, oninput: null, onkeydown: null,
    onpointerdown: null, onpointerup: null, onpointerleave: null, onpointercancel: null, onpointermove: null,
    onmouseenter: null, onmouseleave: null, onerror: null, onload: null, ontimeupdate: null, onloadedmetadata: null, onended: null,
    setAttribute: function(){}, getAttribute: function(){return null}, hasAttribute: function(){return false}, removeAttribute: function(){},
    getBoundingClientRect: function(){return {left:0,top:0,right:0,bottom:0,width:0,height:0,x:0,y:0}},
    cloneNode: function(){return el(id)},
    scrollIntoView: function(){}, focus: function(){}, blur: function(){}, click: function(){}, play: function(){}, pause: function(){},
    insertAdjacentHTML: function(){}, insertAdjacentElement: function(){},
    matches: function(){return false}, contains: function(){return false},
    before: function(){}, after: function(){},
    replaceWith: function(){},
    childNodes: [], children: [],
    offsetWidth: 0, offsetHeight: 0, scrollWidth: 0, scrollHeight: 0,
    tagName: 'DIV', nodeType: 1, nodeName: 'DIV',
    parentElement: null,
    checked: false, disabled: false, hidden: false, required: false,
    src: '', href: '', type: '', name: '', alt: '', title: '', placeholder: '',
    files: [], form: null,
    submit: function(){}, reset: function(){},
    select: function(){}, setSelectionRange: function(){},
    target: null, currentTarget: null,
    _listeners: {}
  };
}

var doc = {
  getElementById: function(id) { return el(id); },
  createElement: function(tag) { var e = el(tag+'_'+Math.random()); e.tagName = tag.toUpperCase(); e.nodeName = tag.toUpperCase(); return e; },
  createElementNS: function(ns, tag) { var e = el(tag+'_'+Math.random()); e.tagName = tag.toUpperCase(); e.nodeName = tag.toUpperCase(); return e; },
  createTextNode: function(text) { return { textContent: text, nodeType: 3, append: function(){}, remove: function(){} }; },
  createDocumentFragment: function() { return { appendChild: function(c){return c}, append: function(){}, querySelectorAll: function(){return []} }; },
  querySelector: function() { return el('qs'); },
  querySelectorAll: function() { return []; },
  getElementsByClassName: function() { return []; },
  getElementsByTagName: function() { return []; },
  body: el('body'), head: el('head'),
  documentElement: el('html'),
  addEventListener: function(){}, removeEventListener: function(){},
  createEvent: function(){return {initEvent:function(){}}},
  execCommand: function(){return false},
  cookie: '', domain: 'localhost', referrer: '', title: '', readyState: 'complete',
  activeElement: el('body'),
  hasFocus: function(){return false}
};

doc.body.appendChild = function(c){return c};
doc.body.append = function(){};
doc.body.querySelector = function(){return null};
doc.body.querySelectorAll = function(){return []};
doc.body.getBoundingClientRect = function(){return {left:0,top:0,right:0,bottom:0,width:0,height:0}};
doc.body.classList = { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){return false} };
doc.body.style = {};
doc.body.dataset = {};
doc.body.closest = function(){ return null; };

global.document = doc;
global.self = global;
global.window = global;

// Register common browser APIs on global
var mockFns = ['addEventListener','removeEventListener','dispatchEvent','scrollTo','scrollBy',
  'getSelection','getComputedStyle','matchMedia','open','alert','confirm','prompt'];
mockFns.forEach(function(fn) { global[fn] = global[fn] || function(){}; });

global.getSelection = function(){ return { removeAllRanges: function(){}, addRange: function(){} }; };
global.getComputedStyle = function(){ return {}; };
global.matchMedia = function(){ return { matches: false, addEventListener: function(){}, removeEventListener: function(){} }; };
global.open = function(){ return { document: { write: function(){}, close: function(){} }, close: function(){}, focus: function(){} }; };
global.location = { href: 'http://localhost:4567/', reload: function(){}, replace: function(){}, assign: function(){}, origin: 'http://localhost:4567', pathname: '/', search: '', hash: '', hostname: 'localhost', port: '4567', protocol: 'http:' };
global.localStorage = { getItem: function(){return null}, setItem: function(){}, removeItem: function(){}, clear: function(){}, length: 0, key: function(){return null} };
global.sessionStorage = { getItem: function(){return null}, setItem: function(){}, removeItem: function(){}, clear: function(){} };
global.history = { pushState: function(){}, replaceState: function(){}, back: function(){}, forward: function(){}, go: function(){} };
global.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 };
global.innerWidth = 1920; global.innerHeight = 1080;
global.outerWidth = 1920; global.outerHeight = 1080;
global.pageXOffset = 0; global.pageYOffset = 0;

global.navigator = {
  clipboard: { writeText: function(){return Promise.resolve()}, readText: function(){return Promise.resolve('')} },
  userAgent: 'mock', platform: 'mock', language: 'zh-CN', onLine: true, maxTouchPoints: 0,
  mediaDevices: { getUserMedia: function(){return Promise.resolve({getTracks:function(){return[]}})} },
  serviceWorker: null, hardwareConcurrency: 8, deviceMemory: 8
};

global.speechSynthesis = { speaking: false, cancel: function(){}, speak: function(){} };
global.fetch = function(){ return Promise.resolve({ ok:true, status:200, json:function(){return Promise.resolve({})}, text:function(){return Promise.resolve('')}, blob:function(){return Promise.resolve({})}, arrayBuffer:function(){return Promise.resolve(new ArrayBuffer(0))}, headers: { get:function(){return null} } }); };
global.URL = { createObjectURL: function(){return 'blob:xxx'}, revokeObjectURL: function(){} };
global.Blob = function(arr, opts) { return { size: 0, type: (opts||{}).type||'', slice: function(){return new Blob()} }; };
global.File = function() { this.name = ''; this.size = 0; this.type = ''; };
global.FileReader = function(){ this.readAsDataURL = function(){}; this.readAsText = function(){}; this.readAsArrayBuffer = function(){}; };
global.FormData = function(){ this.append = function(){} };
global.IntersectionObserver = function(){ this.observe = function(){}; this.unobserve = function(){}; this.disconnect = function(){} };
global.MutationObserver = function(){ this.observe = function(){}; this.disconnect = function(){}; };
global.ResizeObserver = function(){ this.observe = function(){}; this.disconnect = function(){}; };
global.Audio = function(){ return { play: function(){}, pause: function(){}, load: function(){}, addEventListener: function(){}, removeEventListener: function(){}, currentTime: 0, duration: 0, volume: 1, muted: false, src: '', ontimeupdate: null, onloadedmetadata: null, onended: null, onerror: null }; };
global.Image = function(){ return { src: '', onload: null, onerror: null, width: 0, height: 0 }; };
global.WebSocket = function(){ return { send: function(){}, close: function(){}, addEventListener: function(){}, readyState: 1, OPEN: 1 }; };
global.XMLHttpRequest = function(){ this.open = function(){}; this.send = function(){}; this.setRequestHeader = function(){}; this.upload = {}; this.readyState = 4; this.status = 200; this.responseText = ''; this.onload = null; };
global.SpeechSynthesisUtterance = function(t) { this.text = t||''; this.lang = 'zh-CN'; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.onend = null; };

global.setTimeout = function(fn, t) { if (typeof fn === 'function') { try { fn(); } catch(e) {} } return Math.random(); };
global.clearTimeout = function(){};
global.setInterval = function(fn, t) { return Math.random(); };
global.clearInterval = function(){};
global.requestAnimationFrame = function(fn) { try { fn(); } catch(e) {} return Math.random(); };
global.cancelAnimationFrame = function(){};

global.console = { log: function(){}, warn: function(){}, error: function(){}, info: function(){}, debug: function(){}, trace: function(){} };
global.performance = { now: function(){return Date.now()}, mark: function(){}, measure: function(){}, getEntriesByType: function(){return []} };

try {
  eval(js);
  console.log('JS RAN SUCCESSFULLY - no crash!');
} catch(e) {
  console.log('CRASH:', e.constructor.name + ': ' + e.message);
  if (e.stack) {
    var lines = e.stack.split('\n');
    console.log('Stack top 6:');
    lines.slice(0, 6).forEach(function(l) { console.log('  ' + l.trim()); });
  }
}
