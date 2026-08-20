// === Gallery — EIDOS · KEEPS v1 ===
console.log('[gallery] v1 — editorial memory gallery');

// ====== State ======
var _galleryView = 'home'; // 'home' | 'album'
var _galleryAlbums = [];
var _galleryAlbumId = null;
var _galleryAlbum = null;
var _galleryPhotos = [];

// ====== Panel Lifecycle ======
function openGalleryPanel() {
  try { closeDrawer(); } catch(e) {}
  var panel = $('galleryPanel');
  panel.style.display = 'flex';
  panel.setAttribute('aria-hidden', 'false');
  _galleryView = 'home';
  _loadAlbums().then(function() { _renderGalleryHome(); });
}
function closeGalleryPanel() {
  $('galleryPanel').style.display = 'none';
  $('galleryPanel').setAttribute('aria-hidden', 'true');
}

// ====== Data ======
async function _loadAlbums() {
  try {
    var r = await api('/api/gallery/albums');
    if (!r.ok) throw Error();
    var data = await r.json();
    _galleryAlbums = data.albums || [];
  } catch(e) { console.error('[gallery] load albums failed', e); }
}
async function _loadAlbumDetail(id) {
  try {
    var r = await api('/api/gallery/albums/' + id + '/photos');
    if (!r.ok) throw Error();
    var data = await r.json();
    _galleryAlbum = data.album;
    _galleryPhotos = data.photos || [];
    _galleryAlbumId = id;
  } catch(e) { console.error('[gallery] load album failed', e); }
}

// ====== Gallery Home ======
function _renderGalleryHome() {
  var grid = $('galleryGrid');
  var totalPhotos = 0;
  _galleryAlbums.forEach(function(a) { totalPhotos += (a.photo_count || 0); });

  var html = '';
  // Header
  html += '<div class="gallery-home-header">';
  html += '<h1 class="gallery-title">Gallery</h1>';
  html += '<p class="gallery-stats">Collected memories · ' + totalPhotos + ' photos · ' + _galleryAlbums.length + ' albums</p>';
  html += '<p class="gallery-poem">Photos you shared, moments I kept.</p>';
  html += '</div>';

  // Albums
  if (_galleryAlbums.length === 0) {
    html += '<div class="gallery-empty">';
    html += '<div style="font-size:48px;margin-bottom:12px">&#x1F4F7;</div>';
    html += '<p>No albums yet.<br>Create your first memory album.</p>';
    html += '</div>';
  } else {
    html += '<div class="gallery-albums">';
    _galleryAlbums.forEach(function(a) {
      var moodDot = a.mood ? '<span class="gallery-album-mood" style="background:' + (_galleryMoodColor(a.mood)) + '"></span>' : '';
      html += '<div class="gallery-album-card" onclick="_openAlbum(\'' + a.id + '\')">';
      if (a.cover_url) {
        html += '<div class="gallery-album-cover"><img src="' + escHtml(a.cover_url) + '" alt="" loading="lazy"></div>';
      } else {
        html += '<div class="gallery-album-cover empty" style="background:' + _galleryCoverGradient(a.id) + '"></div>';
      }
      html += '<div class="gallery-album-info">';
      html += '<h3 class="gallery-album-title">' + escHtml(a.title) + '</h3>';
      html += '<p class="gallery-album-meta">' + (a.photo_count || 0) + ' photos' + (a.mood ? ' · ' + a.mood : '') + '</p>';
      if (a.description) html += '<p class="gallery-album-desc">' + escHtml(a.description) + '</p>';
      html += moodDot;
      html += '</div></div>';
    });
    html += '</div>';
  }

  // Create album button
  html += '<button class="gallery-create-btn" onclick="_showCreateAlbum()">+ New Album</button>';

  grid.innerHTML = html;
}

function _galleryMoodColor(mood) {
  var map = { 'Heart':'#E8A8B8', 'Missing':'#B8C8E8', 'Comfort':'#C8D8C0', 'Happy':'#F0D8A0' };
  return map[mood] || '#D0C8C0';
}

function _galleryCoverGradient(id) {
  var palettes = [['#D4A0A0','#B87878'],['#A0B8D4','#7890B0'],['#A0C8B0','#78A088'],['#D4C8A0','#B0A878'],['#C0A0D0','#9878B0'],['#D4B0A0','#B08878']];
  var idx = 0;
  for (var i = 0; i < id.length; i++) idx = (idx * 31 + id.charCodeAt(i)) % palettes.length;
  return 'linear-gradient(135deg,' + palettes[idx][0] + ',' + palettes[idx][1] + ')';
}

// ====== Album Detail ======
async function _openAlbum(id) {
  _galleryView = 'album';
  await _loadAlbumDetail(id);
  _renderAlbumDetail();
}

function _renderAlbumDetail() {
  var grid = $('galleryGrid');
  var a = _galleryAlbum;
  if (!a) return;

  var html = '';
  // Back
  html += '<button class="gallery-back-btn" onclick="_backToGalleryHome()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Back</button>';

  // Header
  html += '<div class="gallery-album-header">';
  html += '<h2 class="gallery-album-detail-title">' + escHtml(a.title) + '</h2>';
  html += '<p class="gallery-album-detail-meta">' + (a.photo_count || 0) + ' photos' + (a.mood ? ' · ' + a.mood : '') + '</p>';
  if (a.description) html += '<p class="gallery-album-detail-desc">' + escHtml(a.description) + '</p>';
  html += '</div>';

  // Add photo button
  html += '<button class="gallery-add-photo-btn" onclick="_showAddPhoto()">+ Add Photo</button>';

  // Photos — masonry
  if (_galleryPhotos.length === 0) {
    html += '<div class="gallery-empty" style="padding:40px"><p>No photos in this album yet.</p></div>';
  } else {
    html += '<div class="gallery-photo-grid">';
    _galleryPhotos.forEach(function(p) {
      var dateLabel = p.taken_at || '';
      if (!dateLabel && p.created_at) {
        var d = new Date(p.created_at * 1000);
        dateLabel = (d.getMonth()+1) + '/' + d.getDate();
      }
      html += '<div class="gallery-photo-card">';
      if (dateLabel) html += '<span class="gallery-photo-date">' + dateLabel + '</span>';
      html += '<img src="' + escHtml(p.url) + '" alt="" loading="lazy" onclick="_viewPhoto(\'' + escHtml(p.url) + '\',\'' + escHtml(p.caption||'') + '\')">';
      if (p.caption) html += '<p class="gallery-photo-caption">' + escHtml(p.caption) + '</p>';
      html += '<button class="gallery-photo-menu" onclick="event.stopPropagation();_deletePhoto(\'' + p.id + '\')">···</button>';
      html += '</div>';
    });
    html += '</div>';
  }

  grid.innerHTML = html;
}

function _backToGalleryHome() {
  _galleryView = 'home';
  _galleryAlbumId = null;
  _galleryAlbum = null;
  _galleryPhotos = [];
  _loadAlbums().then(function() { _renderGalleryHome(); });
}

// ====== Create Album Modal ======
function _showCreateAlbum() {
  var old = document.getElementById('galleryModal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'galleryModal';
  modal.className = 'gallery-modal';
  modal.innerHTML =
    '<div class="gallery-modal-overlay" onclick="_closeGalleryModal()"></div>' +
    '<div class="gallery-modal-card">' +
      '<h2 class="gallery-modal-title">Create a New Album</h2>' +
      '<p class="gallery-modal-sub">Give it a name, choose a mood. The rest can be written together.</p>' +
      '<input class="gallery-modal-input" id="galAlbumName" type="text" placeholder="Album name" autocomplete="off">' +
      '<div class="gallery-mood-tags">' +
        ['Heart','Missing','Comfort','Happy'].map(function(m) {
          return '<button class="gallery-mood-tag" onclick="_toggleGalMood(\'' + m + '\',this)">' + m + '</button>';
        }).join('') +
      '</div>' +
      '<textarea class="gallery-modal-textarea" id="galAlbumDesc" placeholder="One sentence about this album" rows="2"></textarea>' +
      '<div class="gallery-modal-actions">' +
        '<button class="gallery-modal-cancel" onclick="_closeGalleryModal()">Cancel</button>' +
        '<button class="gallery-modal-create" onclick="_createAlbum()">Create</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  requestAnimationFrame(function() { modal.classList.add('show'); });
  setTimeout(function() { var inp = $('galAlbumName'); if (inp) inp.focus(); }, 200);
}

var _galSelectedMood = '';
function _toggleGalMood(mood, btn) {
  _galSelectedMood = _galSelectedMood === mood ? '' : mood;
  var tags = document.querySelectorAll('.gallery-mood-tag');
  tags.forEach(function(t) { t.classList.remove('active'); });
  if (_galSelectedMood) btn.classList.add('active');
}

function _closeGalleryModal() {
  var m = document.getElementById('galleryModal');
  if (!m) return;
  m.classList.remove('show');
  setTimeout(function() { m.remove(); }, 250);
}

async function _createAlbum() {
  var title = ($('galAlbumName')?.value || '').trim();
  if (!title) { toast('Please enter a name'); return; }
  var desc = ($('galAlbumDesc')?.value || '').trim();
  try {
    var r = await api('/api/gallery/albums', {
      method: 'POST',
      body: JSON.stringify({ title: title, description: desc, mood: _galSelectedMood })
    });
    if (!r.ok) throw Error();
    _closeGalleryModal();
    await _loadAlbums();
    _renderGalleryHome();
    toast('Album created');
  } catch(e) { toast('Failed to create album'); }
}

// ====== Add Photo ======
function _showAddPhoto() {
  var old = document.getElementById('galleryModal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'galleryModal';
  modal.className = 'gallery-modal';
  modal.innerHTML =
    '<div class="gallery-modal-overlay" onclick="_closeGalleryModal()"></div>' +
    '<div class="gallery-modal-card">' +
      '<h2 class="gallery-modal-title">Add a Photo</h2>' +
      '<p class="gallery-modal-sub">Paste an image URL or choose from recent uploads.</p>' +
      '<input class="gallery-modal-input" id="galPhotoUrl" type="text" placeholder="Image URL" autocomplete="off">' +
      '<input class="gallery-modal-input" id="galPhotoCaption" type="text" placeholder="Caption (optional)" autocomplete="off" style="margin-top:8px">' +
      '<div class="gallery-modal-actions">' +
        '<button class="gallery-modal-cancel" onclick="_closeGalleryModal()">Cancel</button>' +
        '<button class="gallery-modal-create" onclick="_addPhoto()">Add</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  requestAnimationFrame(function() { modal.classList.add('show'); });
}

async function _addPhoto() {
  var url = ($('galPhotoUrl')?.value || '').trim();
  if (!url) { toast('Please enter an image URL'); return; }
  var caption = ($('galPhotoCaption')?.value || '').trim();
  try {
    var r = await api('/api/gallery/albums/' + _galleryAlbumId + '/photos', {
      method: 'POST',
      body: JSON.stringify({ url: url, caption: caption })
    });
    if (!r.ok) throw Error();
    _closeGalleryModal();
    await _loadAlbumDetail(_galleryAlbumId);
    _renderAlbumDetail();
    toast('Photo added');
  } catch(e) { toast('Failed to add photo'); }
}

async function _deletePhoto(pid) {
  if (!confirm('Remove this photo from the album?')) return;
  try {
    var r = await api('/api/gallery/photos/' + pid, { method: 'DELETE' });
    if (!r.ok) throw Error();
    await _loadAlbumDetail(_galleryAlbumId);
    _renderAlbumDetail();
    toast('Removed');
  } catch(e) { toast('Failed to remove'); }
}

function _viewPhoto(url, caption) {
  var fs = document.createElement('div');
  fs.className = 'gallery-fullscreen';
  fs.onclick = function() { fs.remove(); };
  var img = document.createElement('img');
  img.src = url;
  fs.appendChild(img);
  if (caption) {
    var cap = document.createElement('div');
    cap.className = 'gallery-fullscreen-caption';
    cap.textContent = caption;
    fs.appendChild(cap);
  }
  document.body.appendChild(fs);
}

// ====== Init ======
function _initGalleryStyles() {
  if (document.getElementById('galleryStyles')) return;
  var style = document.createElement('style');
  style.id = 'galleryStyles';
  style.textContent = [
    '/* Gallery — Editorial */',
    '.gallery-home-header { padding:24px 24px 8px; }',
    '.gallery-brand { font:400 11px/1 var(--font-sans); color:var(--text-time); letter-spacing:.08em; text-transform:uppercase; margin:0 0 6px; }',
    '.gallery-title { font:700 36px/1 var(--font-sans); color:var(--text-primary); letter-spacing:-.02em; margin:0 0 8px; }',
    '.gallery-stats { font:400 13px/1 var(--font-sans); color:var(--text-time); margin:0 0 4px; }',
    '.gallery-poem { font:italic 400 15px/1.4 var(--font-serif); color:var(--text-time); margin:8px 0 0; }',
    '.gallery-empty { text-align:center; padding:80px 20px; color:var(--text-time); font:400 15px/1.5 var(--font-sans); }',
    '.gallery-albums { display:flex;flex-direction:column;gap:16px;padding:20px 24px; }',
    '.gallery-album-card { display:flex;gap:16px;padding:16px;background:var(--bg-surface);border-radius:20px;cursor:pointer;transition:transform .15s; }',
    '.gallery-album-card:active { transform:scale(.98); }',
    '.gallery-album-cover { width:80px;height:100px;border-radius:14px;overflow:hidden;flex:none; }',
    '.gallery-album-cover img { width:100%;height:100%;object-fit:cover; }',
    '.gallery-album-cover.empty { }',
    '.gallery-album-info { flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;position:relative; }',
    '.gallery-album-title { font:600 18px/1.2 var(--font-sans);color:var(--text-primary);margin:0 0 4px; }',
    '.gallery-album-meta { font:400 12px/1 var(--font-sans);color:var(--text-time);margin:0 0 4px; }',
    '.gallery-album-desc { font:400 14px/1.4 var(--font-sans);color:var(--text-secondary);margin:4px 0 0; }',
    '.gallery-album-mood { position:absolute;top:0;right:0;width:10px;height:10px;border-radius:50%; }',
    '.gallery-create-btn { display:block;margin:20px 24px 40px;padding:14px 24px;border:1.5px dashed var(--border-strong);border-radius:16px;background:transparent;font:500 15px/1 var(--font-sans);color:var(--text-secondary);cursor:pointer;width:calc(100% - 48px);text-align:center; }',
    '.gallery-create-btn:active { background:rgba(0,0,0,.02); }',

    /* Album detail */
    '.gallery-back-btn { display:inline-flex;align-items:center;gap:4px;padding:16px 24px 0;border:0;background:transparent;font:500 14px/1 var(--font-sans);color:var(--text-time);cursor:pointer; }',
    '.gallery-album-header { padding:12px 24px 20px; }',
    '.gallery-album-detail-title { font:700 28px/1.2 var(--font-sans);color:var(--text-primary);margin:0 0 6px; }',
    '.gallery-album-detail-meta { font:400 13px/1 var(--font-sans);color:var(--text-time);margin:0 0 6px; }',
    '.gallery-album-detail-desc { font:italic 400 15px/1.4 var(--font-serif);color:var(--text-secondary);margin:4px 0 0; }',
    '.gallery-add-photo-btn { display:block;margin:0 24px 20px;padding:12px 20px;border:1.5px dashed var(--border-strong);border-radius:14px;background:transparent;font:500 14px/1 var(--font-sans);color:var(--text-secondary);cursor:pointer;width:calc(100% - 48px);text-align:center; }',

    /* Photo grid — masonry */
    '.gallery-photo-grid { columns:2;column-gap:12px;padding:0 20px 40px; }',
    '.gallery-photo-card { break-inside:avoid;margin-bottom:12px;position:relative;border-radius:16px;overflow:hidden;background:var(--bg-surface); }',
    '.gallery-photo-card img { width:100%;display:block;cursor:pointer; }',
    '.gallery-photo-date { display:block;padding:10px 12px 2px;font:400 11px/1 var(--font-sans);color:var(--text-time); }',
    '.gallery-photo-caption { padding:4px 12px 12px;font:italic 400 13px/1.4 var(--font-serif);color:var(--text-secondary);margin:0; }',
    '.gallery-photo-menu { position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.35);color:#fff;font-size:14px;cursor:pointer;display:grid;place-items:center;opacity:0;transition:opacity .15s; }',
    '.gallery-photo-card:hover .gallery-photo-menu,.gallery-photo-card:active .gallery-photo-menu { opacity:1; }',

    /* Fullscreen */
    '.gallery-fullscreen-caption { position:fixed;bottom:60px;left:24px;right:24px;text-align:center;color:#fff;font:italic 400 16px/1.4 var(--font-serif);text-shadow:0 2px 8px rgba(0,0,0,.5); }',

    /* Modal */
    '.gallery-modal { position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s; }',
    '.gallery-modal.show { opacity:1;pointer-events:auto; }',
    '.gallery-modal-overlay { position:absolute;inset:0;background:rgba(0,0,0,.3); }',
    '.gallery-modal-card { position:relative;z-index:1;width:calc(100% - 48px);max-width:400px;background:var(--bg-primary);border-radius:24px;padding:28px 24px 20px; }',
    '.gallery-modal-title { font:700 22px/1.2 var(--font-sans);color:var(--text-primary);margin:0 0 6px; }',
    '.gallery-modal-sub { font:400 14px/1.4 var(--font-sans);color:var(--text-time);margin:0 0 20px; }',
    '.gallery-modal-input { width:100%;padding:14px 16px;border:1px solid var(--border);border-radius:14px;font:400 15px/1 var(--font-sans);color:var(--text-primary);background:var(--bg-surface);outline:0;box-sizing:border-box; }',
    '.gallery-modal-textarea { width:100%;padding:14px 16px;border:1px solid var(--border);border-radius:14px;font:400 14px/1.4 var(--font-sans);color:var(--text-primary);background:var(--bg-surface);outline:0;resize:vertical;margin-top:10px;box-sizing:border-box; }',
    '.gallery-mood-tags { display:flex;gap:8px;margin:12px 0; }',
    '.gallery-mood-tag { padding:8px 16px;border:1px solid var(--border);border-radius:999px;background:transparent;font:400 13px/1 var(--font-sans);color:var(--text-secondary);cursor:pointer;transition:all .15s; }',
    '.gallery-mood-tag.active { background:#F5E0E5;border-color:#E8A8B8;color:#C07080; }',
    '.gallery-modal-actions { display:flex;justify-content:flex-end;gap:10px;margin-top:20px; }',
    '.gallery-modal-cancel { padding:10px 18px;border:0;border-radius:999px;background:transparent;font:500 14px/1 var(--font-sans);color:var(--text-time);cursor:pointer; }',
    '.gallery-modal-create { padding:10px 22px;border:0;border-radius:999px;background:#E8A8B8;color:#fff;font:600 14px/1 var(--font-sans);cursor:pointer; }',
    '.gallery-modal-create:active { background:#D898A8; }',
  ].join('\n');
  document.head.appendChild(style);
}

(function() {
  _initGalleryStyles();
  function _bind() {
    var cb = $('closeGallery');
    if (cb) cb.onclick = function() { closeGalleryPanel(); };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bind);
  } else {
    _bind();
  }
})();
