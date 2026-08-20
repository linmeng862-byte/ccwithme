// === Gallery — EIDOS · KEEPS v2 ===
console.log('[gallery] v2 — 2026-08-08 iOS-style full-width cards');

// ====== State ======
var _galleryView = 'home'; // 'home' | 'album'
var _galleryAlbums = [];
var _galleryAlbumId = null;
var _galleryAlbum = null;
var _galleryPhotos = [];
var _galHomeEditMode = false;
var _galHomeSelected = {}; // { albumId: true }

// ====== Panel Lifecycle ======
function openGalleryPanel() {
  try { closeDrawer(); } catch(e) {}
  var panel = $('galleryPanel');
  panel.style.display = 'flex';
  panel.setAttribute('aria-hidden', 'false');
  _galleryView = 'home';
  _galHomeEditMode = false;
  _galHomeSelected = {};
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
  // Header — left aligned, with Edit button on the right
  html += '<div class="gallery-home-header">';
  html += '<div style="display:flex;align-items:flex-start">';
  html += '<div style="flex:1"><h1 class="gallery-title">Gallery</h1>';
  html += '<p class="gallery-stats">Collected memories · ' + totalPhotos + ' photos · ' + _galleryAlbums.length + ' albums</p>';
  html += '<p class="gallery-poem">Photos you shared, moments I kept.</p></div>';
  if (_galleryAlbums.length > 0) {
    html += '<button id="galHomeEditBtn" class="gallery-edit-btn" onclick="_toggleGalHomeEdit()" style="margin-top:6px">' + (_galHomeEditMode ? 'Cancel' : 'Edit') + '</button>';
  }
  html += '</div></div>';

  // Albums
  if (_galleryAlbums.length === 0) {
    html += '<div class="gallery-empty">';
    html += '<div style="font:400 56px/1 var(--font-serif, Georgia);color:var(--g-line);margin-bottom:16px">+</div>';
    html += '<p style="color:var(--g-muted);font:400 15px/1.5 var(--font-sans)">No albums yet.<br>Create your first memory album.</p>';
    html += '</div>';
  } else {
    html += '<div class="gallery-albums">';
    _galleryAlbums.forEach(function(a) {
      var isSel = !!_galHomeSelected[a.id];
      var totalPhotos = a.photo_count || 0;
      var previews = a.previews || [];
      html += '<div class="gallery-album-card' + (_galHomeEditMode ? ' home-edit-mode' : '') + (isSel ? ' selected' : '') + '" onclick="' + (_galHomeEditMode ? '_toggleHomeAlbumSelect(\'' + a.id + '\')' : '_openAlbum(\'' + a.id + '\')') + '">';
      // Selection circle — top-right, iOS style
      if (_galHomeEditMode) {
        html += '<div class="gal-select-circle' + (isSel ? ' checked' : '') + '" style="top:16px;right:16px;left:auto">';
        if (isSel) html += '<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3 3 7-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        html += '</div>';
      }
      // Info section
      html += '<div class="gallery-album-top">';
      html += '<div class="gallery-album-header-row">';
      html += '<h3 class="gallery-album-title">' + escHtml(a.title) + '</h3>';
      html += '<span class="gallery-album-star">★</span>';
      html += '<span class="gallery-album-count">' + totalPhotos + ' photos</span>';
      html += '</div>';
      if (a.description) html += '<p class="gallery-album-desc">' + escHtml(a.description) + '</p>';
      html += '</div>';
      // Photo previews
      html += '<div class="gallery-album-previews">';
      var showCount = Math.min(previews.length, 3);
      for (var i = 0; i < 3; i++) {
        if (i < showCount) {
          var isLast = (i === 2) && (totalPhotos > 3);
          html += '<div class="gallery-preview-photo' + (isLast ? ' has-more' : '') + '">';
          html += '<img src="' + escHtml(assetUrl(previews[i])) + '" alt="" loading="lazy">';
          if (isLast) html += '<span class="gallery-preview-more">+' + (totalPhotos - 2) + '</span>';
          html += '</div>';
        } else {
          html += '<div class="gallery-preview-photo empty"></div>';
        }
      }
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Create album button (hidden in edit mode)
  if (!_galHomeEditMode) {
    html += '<button class="gallery-create-btn" onclick="_showCreateAlbum()">+ New Album</button>';
  }

  // Bottom delete bar (edit mode)
  if (_galHomeEditMode) {
    var selCount = Object.keys(_galHomeSelected).length;
    html += '<div id="galHomeDeleteBar" style="position:fixed;bottom:0;left:0;right:0;z-index:90;display:flex;align-items:center;gap:12px;padding:14px 20px calc(env(safe-area-inset-bottom) + 14px);background:var(--g-bg,#FAF9F5);border-top:1px solid var(--g-line,#E5DFD4)">';
    html += '<span style="font:600 15px/1 var(--font-sans);color:var(--g-text,#2C2821)">' + selCount + ' selected</span>';
    html += '<div style="flex:1"></div>';
    html += '<button id="galHomeDeleteBtn" onclick="_deleteSelectedAlbums()" style="padding:10px 22px;border:0;border-radius:999px;background:' + (selCount > 0 ? '#E05050' : '#D0C8C0') + ';color:#fff;font:600 14px/1 var(--font-sans);cursor:pointer;transition:background .15s" ' + (selCount === 0 ? 'disabled' : '') + '>Delete</button>';
    html += '</div>';
  }

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
var _galSelectMode = false;
var _galSelected = {}; // { photoId: true }

async function _openAlbum(id) {
  _galleryView = 'album';
  _galSelectMode = false;
  _galSelected = {};
  await _loadAlbumDetail(id);
  _renderAlbumDetail();
}

function _renderAlbumDetail() {
  var grid = $('galleryGrid');
  var a = _galleryAlbum;
  if (!a) return;

  var html = '';
  // Top bar: Back + Edit
  html += '<div style="display:flex;align-items:center;padding:14px 16px 0;gap:8px">';
  html += '<button class="gallery-back-btn" style="padding:0;margin:0" onclick="_backToGalleryHome()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg> Back</button>';
  html += '<div style="flex:1"></div>';
  if (_galleryPhotos.length > 0) {
    html += '<button id="galEditBtn" class="gallery-edit-btn" onclick="_toggleGalSelect()">' + (_galSelectMode ? 'Cancel' : 'Edit') + '</button>';
  }
  html += '</div>';

  // Header — editorial
  html += '<div class="gallery-album-header">';
  html += '<h2 class="gallery-album-detail-title">' + escHtml(a.title) + '</h2>';
  html += '<p class="gallery-album-detail-meta">' + (a.photo_count || 0) + ' memories' + (a.mood ? ' · ' + a.mood : '') + '</p>';
  if (a.description) html += '<p class="gallery-album-detail-desc">' + escHtml(a.description) + '</p>';
  html += '</div>';

  // Add photo button (hidden in select mode)
  if (!_galSelectMode) {
    html += '<button class="gallery-add-photo-btn" onclick="_showAddPhoto()">+ Add a memory</button>';
  }

  // Photos — masonry scrapbook
  if (_galleryPhotos.length === 0) {
    html += '<div class="gallery-empty" style="padding:60px 20px"><p style="color:var(--g-muted);font:400 15px/1.5 var(--font-sans)">No photos in this album yet.<br>Add your first memory.</p></div>';
  } else {
    html += '<div class="gallery-photo-grid">';
    _galleryPhotos.forEach(function(p) {
      var isSel = !!_galSelected[p.id];
      var dateLabel = p.taken_at || '';
      if (!dateLabel && p.created_at) {
        var d = new Date(p.created_at * 1000);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        dateLabel = months[d.getMonth()] + ' ' + d.getDate();
      }
      html += '<div class="gallery-photo-card' + (_galSelectMode ? ' select-mode' : '') + (isSel ? ' selected' : '') + '" onclick="' + (_galSelectMode ? '_togglePhotoSelect(\'' + p.id + '\')' : '_viewPhoto(\'' + escHtml(assetUrl(p.url)) + '\',\'' + escHtml(p.caption||'') + '\')') + '">';
      // Selection circle — top-left, iOS style
      html += '<div class="gal-select-circle' + (isSel ? ' checked' : '') + '">';
      if (isSel) html += '<svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5l3 3 7-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      html += '</div>';
      html += '<img src="' + escHtml(assetUrl(p.url)) + '" alt="" loading="lazy">';
      if (dateLabel) html += '<span class="gallery-photo-date">' + dateLabel + '</span>';
      if (p.caption) html += '<p class="gallery-photo-caption">' + escHtml(p.caption) + '</p>';
      if (!_galSelectMode) {
        html += '<button class="gallery-photo-menu" onclick="event.stopPropagation();_deletePhoto(\'' + p.id + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  // Bottom delete bar
  if (_galSelectMode) {
    var selCount = Object.keys(_galSelected).length;
    html += '<div id="galDeleteBar" style="position:fixed;bottom:0;left:0;right:0;z-index:90;display:flex;align-items:center;gap:12px;padding:14px 20px calc(env(safe-area-inset-bottom) + 14px);background:var(--g-bg,#FAF9F5);border-top:1px solid var(--g-line,#E5DFD4)">';
    html += '<span style="font:600 15px/1 var(--font-sans);color:var(--g-text,#2C2821)">' + selCount + ' selected</span>';
    html += '<div style="flex:1"></div>';
    html += '<button id="galDeleteBtn" onclick="_deleteSelected()" style="padding:10px 22px;border:0;border-radius:999px;background:' + (selCount > 0 ? '#E05050' : '#D0C8C0') + ';color:#fff;font:600 14px/1 var(--font-sans);cursor:pointer;transition:background .15s" ' + (selCount === 0 ? 'disabled' : '') + '>Delete</button>';
    html += '</div>';
  }

  grid.innerHTML = html;
}

function _toggleGalSelect() {
  _galSelectMode = !_galSelectMode;
  _galSelected = {};
  _renderAlbumDetail();
}

function _togglePhotoSelect(pid) {
  if (_galSelected[pid]) {
    delete _galSelected[pid];
  } else {
    _galSelected[pid] = true;
  }
  _renderAlbumDetail();
}

async function _deleteSelected() {
  var ids = Object.keys(_galSelected);
  if (!ids.length) return;
  if (!confirm('Delete ' + ids.length + ' photo' + (ids.length > 1 ? 's' : '') + '?')) return;
  var failed = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      var r = await api('/api/gallery/photos/' + ids[i], { method: 'DELETE' });
      if (!r.ok) failed++;
    } catch(e) { failed++; }
  }
  _galSelectMode = false;
  _galSelected = {};
  await _loadAlbumDetail(_galleryAlbumId);
  _renderAlbumDetail();
  if (failed) toast('Removed ' + (ids.length - failed) + ', ' + failed + ' failed');
  else toast('Removed ' + ids.length);
}

function _backToGalleryHome() {
  _galleryView = 'home';
  _galleryAlbumId = null;
  _galleryAlbum = null;
  _galleryPhotos = [];
  _galHomeEditMode = false;
  _galHomeSelected = {};
  _loadAlbums().then(function() { _renderGalleryHome(); });
}

function _toggleGalHomeEdit() {
  _galHomeEditMode = !_galHomeEditMode;
  _galHomeSelected = {};
  _renderGalleryHome();
}

function _toggleHomeAlbumSelect(aid) {
  if (_galHomeSelected[aid]) {
    delete _galHomeSelected[aid];
  } else {
    _galHomeSelected[aid] = true;
  }
  _renderGalleryHome();
}

async function _deleteSelectedAlbums() {
  var ids = Object.keys(_galHomeSelected);
  if (!ids.length) return;
  if (!confirm('Delete ' + ids.length + ' album' + (ids.length > 1 ? 's' : '') + ' and all their photos?')) return;
  var failed = 0;
  for (var i = 0; i < ids.length; i++) {
    try {
      var r = await api('/api/gallery/albums/' + ids[i], { method: 'DELETE' });
      if (!r.ok) failed++;
    } catch(e) { failed++; }
  }
  _galHomeEditMode = false;
  _galHomeSelected = {};
  await _loadAlbums();
  _renderGalleryHome();
  if (failed) toast('Removed ' + (ids.length - failed) + ', ' + failed + ' failed');
  else toast('Removed ' + ids.length);
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
      '<div style="width:36px;height:4px;background:var(--g-line);border-radius:999px;margin:0 auto 20px"></div>' +
      '<h2 class="gallery-modal-title">New Album</h2>' +
      '<p class="gallery-modal-sub">A place for shared moments</p>' +
      '<input class="gallery-modal-input" id="galAlbumName" type="text" placeholder="Album name" autocomplete="off">' +
      '<div class="gallery-mood-tags">' +
        ['Heart','Missing','Comfort','Happy'].map(function(m) {
          return '<button class="gallery-mood-tag" onclick="_toggleGalMood(\'' + m + '\',this)">' + m + '</button>';
        }).join('') +
      '</div>' +
      '<textarea class="gallery-modal-textarea" id="galAlbumDesc" placeholder="A line about this album…" rows="2"></textarea>' +
      '<div class="gallery-modal-actions">' +
        '<button class="gallery-modal-cancel" onclick="_closeGalleryModal()">Cancel</button>' +
        '<button class="gallery-modal-create" onclick="_createAlbum()">Create</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  requestAnimationFrame(function() { modal.classList.add('show'); });
  setTimeout(function() { var inp = $('galAlbumName'); if (inp) inp.focus(); }, 300);
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

// ====== Add Photo — iOS style upload sheet ======
var _galPendingUrl = '';

function _showAddPhoto() {
  var old = document.getElementById('galleryModal');
  if (old) old.remove();
  _galPendingUrl = '';

  var modal = document.createElement('div');
  modal.id = 'galleryModal';
  modal.className = 'gallery-modal';
  modal.innerHTML =
    '<div class="gallery-modal-overlay" onclick="_closeGalleryModal()"></div>' +
    '<div class="gallery-modal-card" style="padding-bottom:calc(env(safe-area-inset-bottom) + 16px)">' +
      '<div style="width:36px;height:4px;background:var(--g-line);border-radius:999px;margin:0 auto 18px"></div>' +
      '<h2 class="gallery-modal-title">Add a Memory</h2>' +
      // Preview area — hidden until image selected
      '<div id="galPreview" style="display:none;margin:16px 0;border-radius:16px;overflow:hidden;background:var(--g-card);position:relative">' +
        '<img id="galPreviewImg" src="" style="width:100%;max-height:240px;object-fit:cover;display:block">' +
        '<button onclick="event.stopPropagation();_clearGalPreview()" style="position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:16px;cursor:pointer;display:grid;place-items:center;backdrop-filter:blur(6px)">×</button>' +
      '</div>' +
      // Caption
      '<input class="gallery-modal-input" id="galPhotoCaption" type="text" placeholder="A note about this moment…" autocomplete="off" style="margin-bottom:8px">' +
      // Upload row
      '<div style="display:flex;gap:8px;margin-bottom:10px">' +
        '<label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:13px;border:1px solid var(--g-line);border-radius:14px;font:500 14px/1 var(--font-sans);color:var(--g-text);cursor:pointer;background:var(--g-card)">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
          'Choose Photo' +
          '<input type="file" accept="image/*" onchange="_handleGalFile(this)" style="display:none">' +
        '</label>' +
        '<label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:13px;border:1px solid var(--g-line);border-radius:14px;font:500 14px/1 var(--font-sans);color:var(--g-text);cursor:pointer;background:var(--g-card)">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>' +
          'Take Photo' +
          '<input type="file" accept="image/*" capture="environment" onchange="_handleGalFile(this)" style="display:none">' +
        '</label>' +
      '</div>' +
      // URL paste
      '<div id="galUrlRow" style="display:flex;gap:8px">' +
        '<input class="gallery-modal-input" id="galPhotoUrl" type="text" placeholder="Or paste image URL…" autocomplete="off" style="flex:1" oninput="_onGalUrlInput(this.value)">' +
      '</div>' +
      '<div class="gallery-modal-actions" style="margin-top:18px">' +
        '<button class="gallery-modal-cancel" onclick="_closeGalleryModal()">Cancel</button>' +
        '<button class="gallery-modal-create" id="galAddBtn" onclick="_addPhoto()" disabled style="opacity:.4">Add</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  requestAnimationFrame(function() { modal.classList.add('show'); });
}

function _onGalUrlInput(val) {
  _galPendingUrl = (val||'').trim();
  _updateGalPreview();
}
function _handleGalFile(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var fd = new FormData();
  fd.append('file', file);
  var btn = document.getElementById('galAddBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
  api('/api/gallery/upload', { method: 'POST', body: fd, headers: {} }).then(function(r) {
    return r.json();
  }).then(function(d) {
    if (d.url) {
      _galPendingUrl = d.url;
      var urlInput = document.getElementById('galPhotoUrl');
      if (urlInput) urlInput.value = d.url;
      _updateGalPreview();
    }
  }).catch(function() {
    toast('Upload failed');
  }).finally(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Add'; _updateAddBtn(); }
  });
  input.value = '';
}
function _updateGalPreview() {
  var preview = document.getElementById('galPreview');
  var img = document.getElementById('galPreviewImg');
  if (!preview || !img) return;
  if (_galPendingUrl) {
    preview.style.display = 'block';
    img.src = _galPendingUrl;
  } else {
    preview.style.display = 'none';
  }
  _updateAddBtn();
}
function _clearGalPreview() {
  _galPendingUrl = '';
  var urlInput = document.getElementById('galPhotoUrl');
  if (urlInput) urlInput.value = '';
  _updateGalPreview();
}
function _updateAddBtn() {
  var btn = document.getElementById('galAddBtn');
  if (!btn) return;
  if (_galPendingUrl) { btn.disabled = false; btn.style.opacity = '1'; }
  else { btn.disabled = true; btn.style.opacity = '.4'; }
}

async function _addPhoto() {
  if (!_galPendingUrl) { toast('Select a photo or enter a URL'); return; }
  var caption = ($('galPhotoCaption')?.value || '').trim();
  try {
    var r = await api('/api/gallery/albums/' + _galleryAlbumId + '/photos', {
      method: 'POST',
      body: JSON.stringify({ url: _galPendingUrl, caption: caption })
    });
    if (!r.ok) throw Error();
    _closeGalleryModal();
    _galPendingUrl = '';
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
  fs.onclick = function(e) { if (e.target === fs || e.target.tagName === 'IMG') { fs.remove(); } };
  var img = document.createElement('img');
  img.src = url;
  fs.appendChild(img);
  if (caption) {
    var cap = document.createElement('div');
    cap.className = 'gallery-fullscreen-caption';
    cap.textContent = caption;
    fs.appendChild(cap);
  }
  // bottom action bar
  var bar = document.createElement('div');
  bar.className = 'gallery-fullscreen-bar';
  bar.onclick = function(e) { e.stopPropagation(); };
  var sendBtn = document.createElement('button');
  sendBtn.className = 'gallery-send-chat-btn';
  sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg> Send to Chat';
  sendBtn.onclick = function(e) {
    e.stopPropagation();
    // extract filename from URL
    var fname = url.split('/').pop().split('?')[0] || 'gallery_photo.jpg';
    if (!/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(fname)) fname += '.jpg';
    fetch(url).then(function(r) { return r.blob(); }).then(function(blob) {
      var file = new File([blob], fname, {type: blob.type || 'image/jpeg'});
      if (typeof addSelectedFiles === 'function') { addSelectedFiles([file]); }
      fs.remove();
    }).catch(function() {
      // fallback: open image in new tab
      if (typeof toast === 'function') toast('Send failed — opening image instead');
      window.open(url, '_blank');
      fs.remove();
    });
  };
  bar.appendChild(sendBtn);
  fs.appendChild(bar);
  document.body.appendChild(fs);
}

// ====== Init ======
function _initGalleryStyles() {
  var old = document.getElementById('galleryStyles');
  if (old) old.remove();
  var style = document.createElement('style');
  style.id = 'galleryStyles';
  style.textContent = [
    '/* Gallery — Editorial Memory Archive */',
    '#galleryPanel { --g-bg: #FAF9F5; --g-card: #F2EFE7; --g-text: #2C2821; --g-muted: #A0988B; --g-line: #E5DFD4; }',
    '@media (prefers-color-scheme: dark) { #galleryPanel { --g-bg: #2A1D22; --g-card: #35262C; --g-text: #EDE0E4; --g-muted: #B0989E; --g-line: #4A3840; } }',
    'html[data-theme="dark"] #galleryPanel { --g-bg: #2A1D22; --g-card: #35262C; --g-text: #EDE0E4; --g-muted: #B0989E; --g-line: #4A3840; }',

    /* Home header */
    '.gallery-home-header { padding:20px 16px 8px; }',
    '.gallery-title { font:700 36px/1 var(--font-sans); color:var(--g-text); letter-spacing:-.02em; margin:0 0 6px; }',
    '.gallery-stats { font:400 13px/1.3 var(--font-sans); color:var(--g-muted); margin:0; }',
    '.gallery-poem { font:italic 400 15px/1.5 var(--font-serif, Georgia); color:var(--g-muted); margin:6px 0 0; }',
    '.gallery-empty { text-align:center; padding:80px 20px; color:var(--g-muted); font:400 15px/1.5 var(--font-sans); }',

    /* Album cards — full-width iOS style */
    '.gallery-albums { display:flex; flex-direction:column; gap:16px; padding:12px 12px 20px; }',
    '.gallery-album-card { background:var(--g-card); border-radius:20px; padding:20px 20px 18px; cursor:pointer; transition:transform .15s, box-shadow .15s; box-shadow:0 1px 3px rgba(0,0,0,.04); }',
    '.gallery-album-card:active { transform:scale(.985); }',
    '.gallery-album-top { margin-bottom:14px; }',
    '.gallery-album-header-row { display:flex; align-items:center; gap:6px; }',
    '.gallery-album-title { font:600 17px/1.2 var(--font-serif, Georgia); color:var(--g-text); margin:0; letter-spacing:-.01em; }',
    '.gallery-album-star { font-size:13px; color:#E8A8B8; flex:none; line-height:1; }',
    '.gallery-album-count { font:400 13px/1 var(--font-sans); color:var(--g-muted); }',
    '.gallery-album-desc { font:400 13px/1.4 var(--font-sans); color:var(--g-muted); margin:6px 0 0; }',

    /* Photo preview row — responsive, fill card width */
    '.gallery-album-previews { display:flex; gap:4px; }',
    '.gallery-preview-photo { flex:1; aspect-ratio:1; border-radius:10px; overflow:hidden; background:var(--g-line); position:relative; min-width:0; }',
    '.gallery-preview-photo img { width:100%; height:100%; object-fit:cover; display:block; }',
    '.gallery-preview-photo.empty { background:var(--g-line); }',
    '.gallery-preview-photo.has-more img { filter:brightness(.45); }',
    '.gallery-preview-more { position:absolute; inset:0; display:grid; place-items:center; font:600 16px/1 var(--font-sans); color:#fff; }',

    /* Create button */
    '.gallery-create-btn { display:block; margin:8px 20px 40px; padding:14px 24px; border:1.5px dashed var(--g-line); border-radius:18px; background:transparent; font:500 15px/1 var(--font-sans); color:var(--g-muted); cursor:pointer; width:calc(100% - 40px); text-align:center; transition:background .15s; }',
    '.gallery-create-btn:active { background:var(--g-card); }',

    /* Album detail */
    '.gallery-back-btn { display:inline-flex; align-items:center; gap:4px; padding:14px 20px 0; border:0; background:transparent; font:500 14px/1 var(--font-sans); color:var(--g-muted); cursor:pointer; }',
    '.gallery-album-header { padding:8px 24px 16px; }',
    '.gallery-album-detail-title { font:700 28px/1.15 var(--font-serif, Georgia); color:var(--g-text); margin:0 0 4px; letter-spacing:-.01em; }',
    '.gallery-album-detail-meta { font:400 12px/1 var(--font-sans); color:var(--g-muted); margin:0; }',
    '.gallery-album-detail-desc { font:italic 400 15px/1.5 var(--font-serif, Georgia); color:var(--g-muted); margin:8px 0 0; }',
    '.gallery-add-photo-btn { display:block; margin:0 20px 18px; padding:12px 20px; border:1.5px dashed var(--g-line); border-radius:16px; background:transparent; font:500 14px/1 var(--font-sans); color:var(--g-muted); cursor:pointer; width:calc(100% - 40px); text-align:center; }',
    '.gallery-add-photo-btn:active { background:var(--g-card); }',

    /* Photo grid — masonry scrapbook */
    '.gallery-photo-grid { columns:2; column-gap:12px; padding:0 20px 40px; }',
    '.gallery-photo-card { break-inside:avoid; margin-bottom:14px; position:relative; border-radius:20px; overflow:hidden; background:var(--g-card); box-shadow:0 1px 3px rgba(0,0,0,.03); }',
    '.gallery-photo-card img { width:100%; display:block; cursor:pointer; }',
    '.gallery-photo-date { display:block; padding:12px 14px 0; font:400 11px/1 var(--font-sans); color:var(--g-muted); letter-spacing:.03em; }',
    '.gallery-photo-caption { padding:4px 14px 14px; font:400 13px/1.45 var(--font-sans); color:var(--g-text); margin:0; }',
    '.gallery-photo-menu { position:absolute; top:8px; right:8px; width:28px; height:28px; border-radius:50%; border:0; background:rgba(0,0,0,.4); color:#fff; font-size:13px; cursor:pointer; display:grid; place-items:center; opacity:0; transition:opacity .15s; backdrop-filter:blur(6px); }',
    '.gallery-photo-card:hover .gallery-photo-menu,.gallery-photo-card:active .gallery-photo-menu { opacity:1; }',

    /* Edit button */
    '.gallery-edit-btn { padding:8px 16px; border:0; border-radius:999px; background:var(--g-card); color:var(--g-text); font:600 14px/1 var(--font-sans); cursor:pointer; }',

    /* Selection mode — iOS style */
    '.gal-select-circle { position:absolute; top:10px; left:10px; z-index:2; width:24px; height:24px; border-radius:50%; border:2px solid rgba(255,255,255,.9); background:rgba(0,0,0,.15); transition:all .15s; display:grid; place-items:center; }',
    '.gal-select-circle.checked { background:#2C7BE5; border-color:#2C7BE5; }',
    '.gallery-photo-card.select-mode { cursor:pointer; }',
    '.gallery-photo-card.select-mode img { pointer-events:none; }',
    '.gallery-photo-card.selected { outline:2px solid #2C7BE5; outline-offset:-2px; }',

    /* Home edit mode */
    '.gallery-album-card.home-edit-mode { cursor:pointer; position:relative; }',
    '.gallery-album-card.home-edit-mode:active { transform:scale(.985); }',
    '.gallery-album-card.selected { outline:2px solid #2C7BE5; outline-offset:-2px; }',
    '@media (prefers-color-scheme:dark) { .gallery-album-card.selected { outline-color:#5B9CF5; } }',
    'html[data-theme="dark"] .gallery-album-card.selected { outline-color:#5B9CF5; }',

    /* Fullscreen */
    '.gallery-fullscreen{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer}',
    '.gallery-fullscreen img{max-width:94vw;max-height:75vh;object-fit:contain;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.4)}',
    '.gallery-fullscreen-caption { position:fixed;bottom:120px;left:24px;right:24px;text-align:center;color:#fff;font:italic 400 16px/1.5 var(--font-serif, Georgia);text-shadow:0 2px 8px rgba(0,0,0,.5); }',
    '.gallery-fullscreen-bar { position:fixed;bottom:40px;left:50%;transform:translateX(-50%);display:flex;gap:12px;z-index:81; }',
    '.gallery-send-chat-btn { display:flex;align-items:center;gap:8px;padding:12px 22px;border:0;border-radius:999px;background:rgba(255,255,255,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:#1C1C1E;font:600 15px/1 -apple-system,"SF Pro Display",var(--font-sans);cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);transition:transform .15s,background .15s; }',
    '.gallery-send-chat-btn:active { transform:scale(.96);background:rgba(255,255,255,.75); }',

    /* Modal — editorial */
    '.gallery-modal { position:fixed;inset:0;z-index:200;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s; }',
    '.gallery-modal.show { opacity:1;pointer-events:auto; }',
    '.gallery-modal-overlay { position:absolute;inset:0;background:rgba(0,0,0,.25); }',
    '.gallery-modal-card { --g-bg:#FAF9F5;--g-card:#F2EFE7;--g-text:#2C2821;--g-muted:#A0988B;--g-line:#E5DFD4; position:relative;z-index:1;width:100%;max-width:440px;background:var(--g-bg);border-radius:24px 24px 0 0;padding:28px 24px calc(env(safe-area-inset-bottom) + 20px); transform:translateY(20px); transition:transform .3s cubic-bezier(.32,.72,0,1); }',
    '@media (prefers-color-scheme:dark) { .gallery-modal-card { --g-bg:#2A1D22;--g-card:#35262C;--g-text:#EDE0E4;--g-muted:#B0989E;--g-line:#4A3840; } }',
    'html[data-theme="dark"] .gallery-modal-card { --g-bg:#2A1D22;--g-card:#35262C;--g-text:#EDE0E4;--g-muted:#B0989E;--g-line:#4A3840; }',
    '.gallery-modal.show .gallery-modal-card { transform:translateY(0); }',
    '.gallery-modal-title { font:700 22px/1.2 var(--font-serif, Georgia); color:var(--g-text); margin:0 0 4px; }',
    '.gallery-modal-sub { font:400 14px/1.4 var(--font-sans); color:var(--g-muted); margin:0 0 22px; }',
    '.gallery-modal-input { width:100%; padding:14px 16px; border:1px solid var(--g-line); border-radius:14px; font:400 15px/1 var(--font-sans); color:var(--g-text); background:var(--g-card); outline:0; box-sizing:border-box; }',
    '.gallery-modal-input::placeholder { color:var(--g-muted); }',
    '.gallery-modal-textarea { width:100%; padding:14px 16px; border:1px solid var(--g-line); border-radius:14px; font:400 14px/1.5 var(--font-sans); color:var(--g-text); background:var(--g-card); outline:0; resize:vertical; margin-top:10px; box-sizing:border-box; }',
    '.gallery-modal-textarea::placeholder { color:var(--g-muted); }',
    '.gallery-mood-tags { display:flex; gap:8px; margin:12px 0; flex-wrap:wrap; }',
    '.gallery-mood-tag { padding:8px 16px; border:1px solid var(--g-line); border-radius:999px; background:transparent; font:400 13px/1 var(--font-sans); color:var(--g-muted); cursor:pointer; transition:all .15s; }',
    '.gallery-mood-tag.active { background:#F5E0E5; border-color:#E8A8B8; color:#C07080; }',
    '.gallery-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:22px; }',
    '.gallery-modal-create { padding:11px 24px; border:0; border-radius:999px; background:#2C2821; color:#FAF9F5; font:600 14px/1 var(--font-sans); cursor:pointer; }',
    '.gallery-modal-create:active { opacity:.8; }',
    '@media (prefers-color-scheme: dark) { .gallery-modal-create { background:#E8E4DB; color:#1C1A17; } }',
    'html[data-theme="dark"] .gallery-modal-create { background:#E8E4DB; color:#1C1A17; }',

    /* Chat gallery cards */
    '.gallery-save-card { --gs-bg:#FAF9F5;--gs-card:#F2EFE7;--gs-text:#2C2821;--gs-muted:#A0988B;--gs-line:#E5DFD4; }',
    '@media (prefers-color-scheme:dark) { .gallery-save-card { --gs-bg:#2A1D22;--gs-card:#35262C;--gs-text:#EDE0E4;--gs-muted:#B0989E;--gs-line:#4A3840; } }',
    'html[data-theme="dark"] .gallery-save-card { --gs-bg:#2A1D22;--gs-card:#35262C;--gs-text:#EDE0E4;--gs-muted:#B0989E;--gs-line:#4A3840; }',
    '.gallery-album-card-chat { --gs-bg:#FAF9F5;--gs-card:#F2EFE7;--gs-text:#2C2821;--gs-muted:#A0988B;--gs-line:#E5DFD4; }',
    '@media (prefers-color-scheme:dark) { .gallery-album-card-chat { --gs-bg:#2A1D22;--gs-card:#35262C;--gs-text:#EDE0E4;--gs-muted:#B0989E;--gs-line:#4A3840; } }',
    'html[data-theme="dark"] .gallery-album-card-chat { --gs-bg:#2A1D22;--gs-card:#35262C;--gs-text:#EDE0E4;--gs-muted:#B0989E;--gs-line:#4A3840; }',

    /* Mobile — narrow screens */
    '@media(max-width:760px){',
      '.gallery-album-card{padding:16px 16px 14px!important}',
      '.gallery-album-title{font-size:15px!important}',
      '.gallery-album-detail-title{font-size:22px!important}',
      '.gallery-photo-grid{columns:1!important;padding:0 16px 30px!important}',
      '.gallery-modal-card{padding:22px 18px calc(env(safe-area-inset-bottom) + 14px)!important}',
      '.gallery-title{font-size:28px!important}',
      '.gallery-home-header{padding:16px 12px 6px!important}',
      '.gallery-create-btn,.gallery-add-photo-btn{width:calc(100% - 32px)!important;margin-left:16px!important;margin-right:16px!important}',
      '.gallery-album-previews{gap:3px!important}',
    '}',
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
