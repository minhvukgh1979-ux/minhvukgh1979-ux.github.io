// ============================================================
// Dethi Drive TV - phiên bản Web (quét Folder + quản lý + trình
// phát tuỳ chỉnh có tua lùi/tiến, tốc độ, phụ đề, ghi nhớ vị trí xem)
// ============================================================

// ============================================================
// CẤU HÌNH MẶC ĐỊNH (điền 1 LẦN DUY NHẤT trước khi đưa code lên
// GitHub Pages, để mở trang là có video ngay, không cần nhập gì).
// ============================================================
const DEFAULT_API_KEY = 'AIzaSyC8Wyr26jIvv7AETbMshe9u7jv2owfcQRw';
const DEFAULT_FOLDER_LINK = 'https://drive.google.com/drive/folders/17wcsWpbjUcW5shb61luAqPjaRoh-8qL2';

const LS_KEY_API = 'drivetv_api_key';
const LS_KEY_FOLDER_LINK = 'drivetv_folder_link';
const LS_KEY_META = 'drivetv_meta';         // {fileId: {title, favorite, hidden}}
const LS_KEY_PROGRESS = 'drivetv_progress'; // {fileId: seconds}

// ---------------- DOM refs ----------------

const gridScreen = document.getElementById('gridScreen');
const playerScreen = document.getElementById('playerScreen');
const settingsScreen = document.getElementById('settingsScreen');
const editModal = document.getElementById('editModal');

const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const manifestInput = document.getElementById('manifestInput');
const saveBtn = document.getElementById('saveBtn');
const settingsError = document.getElementById('settingsError');

const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const refreshBtn = document.getElementById('refreshBtn');
const tabsEl = document.getElementById('tabs');
const videoGrid = document.getElementById('videoGrid');
const statusMsg = document.getElementById('statusMsg');

const videoPlayer = document.getElementById('videoPlayer');
const subtitleTrack = document.getElementById('subtitleTrack');
const playerWrap = document.getElementById('playerWrap');
const playerControls = document.getElementById('playerControls');
const bigPlayBtn = document.getElementById('bigPlayBtn');
const backBtn = document.getElementById('backBtn');
const playerTitle = document.getElementById('playerTitle');
const seekBar = document.getElementById('seekBar');
const timeCurrent = document.getElementById('timeCurrent');
const timeDuration = document.getElementById('timeDuration');
const playPauseBtn = document.getElementById('playPauseBtn');
const rewindBtn = document.getElementById('rewindBtn');
const forwardBtn = document.getElementById('forwardBtn');
const muteBtn = document.getElementById('muteBtn');
const volumeBar = document.getElementById('volumeBar');
const subtitleBtn = document.getElementById('subtitleBtn');
const speedBtn = document.getElementById('speedBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');

const editTitleInput = document.getElementById('editTitleInput');
const editSaveBtn = document.getElementById('editSaveBtn');
const editResetBtn = document.getElementById('editResetBtn');
const editCancelBtn = document.getElementById('editCancelBtn');

// ---------------- State ----------------

let allVideos = [];        // dữ liệu gốc quét từ Drive
let currentTab = 'all';
let currentSubtitleUrl = null;
let currentVideo = null;
let editingFileId = null;
let controlsHideTimer = null;
let progressSaveTimer = null;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
let speedIndex = 2;

// ---------------- Config helpers ----------------

function getConfig() {
  return {
    apiKey: localStorage.getItem(LS_KEY_API) || DEFAULT_API_KEY || '',
    folderLink: localStorage.getItem(LS_KEY_FOLDER_LINK) || DEFAULT_FOLDER_LINK || ''
  };
}

function saveConfig(apiKey, folderLink) {
  localStorage.setItem(LS_KEY_API, apiKey);
  localStorage.setItem(LS_KEY_FOLDER_LINK, folderLink);
}

function isConfigured() {
  const c = getConfig();
  return c.apiKey.trim() !== '' && c.folderLink.trim() !== '';
}

function getMetaStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_META) || '{}'); }
  catch (e) { return {}; }
}

function saveMetaStore(store) {
  localStorage.setItem(LS_KEY_META, JSON.stringify(store));
}

function getMeta(fileId) {
  const store = getMetaStore();
  return store[fileId] || { title: null, favorite: false, hidden: false };
}

function setMeta(fileId, patch) {
  const store = getMetaStore();
  store[fileId] = Object.assign({ title: null, favorite: false, hidden: false }, store[fileId] || {}, patch);
  saveMetaStore(store);
}

function getProgressStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_PROGRESS) || '{}'); }
  catch (e) { return {}; }
}

function getProgress(fileId) {
  const store = getProgressStore();
  return store[fileId] || null;
}

function setProgress(fileId, data) {
  const store = getProgressStore();
  if (data === null) { delete store[fileId]; }
  else { store[fileId] = data; }
  localStorage.setItem(LS_KEY_PROGRESS, JSON.stringify(store));
}

// Tách folder ID từ link Drive, hoặc chuỗi ID thuần.
function extractFolderId(text) {
  if (!text) return '';
  const t = text.trim();
  let m = t.match(/\/folders\/([-\w]{10,})/);
  if (m) return m[1];
  m = t.match(/[?&]id=([-\w]{10,})/);
  if (m) return m[1];
  if (/^[-\w]{10,}$/.test(t)) return t;
  return t;
}

function streamUrl(fileId, apiKey) {
  return 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
         '?alt=media&key=' + encodeURIComponent(apiKey);
}

function normalizeForSearch(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
}

// ---------------- Nhận diện loại file ----------------

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv'];
const SUBTITLE_EXTENSIONS = ['srt', 'vtt'];

function getExtension(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function getBaseName(name) {
  return (name || '').replace(/\.[a-zA-Z0-9]+$/, '');
}

function isVideoFile(file) {
  if (file.mimeType && file.mimeType.indexOf('video/') === 0) return true;
  return VIDEO_EXTENSIONS.includes(getExtension(file.name));
}

function isSubtitleFile(file) {
  return SUBTITLE_EXTENSIONS.includes(getExtension(file.name));
}

// ---------------- Quét toàn bộ file trong 1 folder Drive ----------------

async function listFolderFiles(apiKey, folderId) {
  let files = [];
  let pageToken = '';

  do {
    const q = encodeURIComponent("'" + folderId + "' in parents and trashed = false");
    let url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
      '&fields=' + encodeURIComponent('nextPageToken, files(id,name,mimeType,thumbnailLink,createdTime)') +
      '&orderBy=' + encodeURIComponent('name') +
      '&pageSize=1000&key=' + encodeURIComponent(apiKey);
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      throw new Error(msg);
    }

    files = files.concat(data.files || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return files;
}

async function fetchFolderVideos(apiKey, folderLink) {
  const folderId = extractFolderId(folderLink);
  const files = await listFolderFiles(apiKey, folderId);

  const videoFiles = files.filter(isVideoFile);
  const subtitleFiles = files.filter(isSubtitleFile);

  const subtitleByBase = {};
  subtitleFiles.forEach(function (f) { subtitleByBase[getBaseName(f.name)] = f; });

  const videos = videoFiles.map(function (f) {
    const sub = subtitleByBase[getBaseName(f.name)];
    return {
      fileId: f.id,
      originalTitle: getBaseName(f.name),
      mimeType: f.mimeType || '',
      thumbnail: f.thumbnailLink || null,
      createdTime: f.createdTime || null,
      subtitleFileId: sub ? sub.id : null,
      subtitleExt: sub ? getExtension(sub.name) : null
    };
  });

  return videos;
}

// ---------------- Chuyển .srt sang .vtt ----------------

function srtToVtt(srtText) {
  let text = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + text;
}

async function buildSubtitleUrl(video, apiKey) {
  if (!video.subtitleFileId) return null;
  const res = await fetch(streamUrl(video.subtitleFileId, apiKey));
  if (!res.ok) return null;
  let text = await res.text();
  if (video.subtitleExt === 'srt') text = srtToVtt(text);
  else if (!/^WEBVTT/.test(text.trim())) text = 'WEBVTT\n\n' + text;
  const blob = new Blob([text], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}

// ---------------- Screen switching ----------------

function showScreen(name) {
  gridScreen.classList.add('hidden');
  playerScreen.classList.add('hidden');
  if (name === 'grid') gridScreen.classList.remove('hidden');
  if (name === 'player') playerScreen.classList.remove('hidden');
}

function openSettings() {
  const c = getConfig();
  apiKeyInput.value = c.apiKey;
  manifestInput.value = c.folderLink;
  settingsError.textContent = '';
  settingsScreen.classList.remove('hidden');
  apiKeyInput.focus();
}

function closeSettings() {
  settingsScreen.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', function () {
  if (isConfigured()) closeSettings();
});

saveBtn.addEventListener('click', function () {
  const apiKey = apiKeyInput.value.trim();
  const folderLink = manifestInput.value.trim();
  if (!apiKey || !folderLink) {
    settingsError.textContent = 'Vui lòng nhập đủ API Key và link folder Google Drive.';
    return;
  }
  saveConfig(apiKey, folderLink);
  closeSettings();
  showScreen('grid');
  loadVideos();
});

// ---------------- Tabs & sort ----------------

tabsEl.addEventListener('click', function (e) {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  currentTab = btn.getAttribute('data-tab');
  Array.from(tabsEl.querySelectorAll('.tab')).forEach(function (t) { t.classList.toggle('active', t === btn); });
  applyFilters();
});

sortSelect.addEventListener('change', applyFilters);
searchInput.addEventListener('input', applyFilters);
refreshBtn.addEventListener('click', function () { loadVideos(); });

function decorate(video) {
  const meta = getMeta(video.fileId);
  const progress = getProgress(video.fileId);
  return Object.assign({}, video, {
    title: meta.title || video.originalTitle,
    favorite: !!meta.favorite,
    hidden: !!meta.hidden,
    watchedPct: progress && progress.duration ? Math.min(100, Math.round((progress.time / progress.duration) * 100)) : 0
  });
}

function applyFilters() {
  const term = normalizeForSearch(searchInput.value);
  const sortMode = sortSelect.value;

  let list = allVideos.map(decorate);

  if (currentTab === 'favorite') list = list.filter(function (v) { return v.favorite && !v.hidden; });
  else if (currentTab === 'hidden') list = list.filter(function (v) { return v.hidden; });
  else list = list.filter(function (v) { return !v.hidden; });

  if (term) {
    list = list.filter(function (v) { return normalizeForSearch(v.title).includes(term); });
  }

  if (sortMode === 'name') {
    list.sort(function (a, b) { return a.title.localeCompare(b.title, 'vi'); });
  } else if (sortMode === 'newest') {
    list.sort(function (a, b) { return new Date(b.createdTime || 0) - new Date(a.createdTime || 0); });
  } else if (sortMode === 'favorite') {
    list.sort(function (a, b) {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.title.localeCompare(b.title, 'vi');
    });
  }

  renderVideos(list);

  if (allVideos.length === 0) {
    statusMsg.textContent = 'Không thấy video nào trong folder. Kiểm tra lại link folder và quyền chia sẻ.';
  } else {
    statusMsg.textContent = list.length + ' / ' + allVideos.length + ' video.';
  }
}

// ---------------- Grid rendering ----------------

function renderVideos(videos) {
  videoGrid.innerHTML = '';

  videos.forEach(function (video) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.dataset.fileId = video.fileId;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = video.title;
    if (video.thumbnail) {
      img.src = video.thumbnail;
      img.onerror = function () { img.style.background = '#37474f'; img.removeAttribute('src'); };
    } else {
      img.style.background = '#37474f';
    }
    thumbWrap.appendChild(img);

    if (video.subtitleFileId) {
      const ccBadge = document.createElement('span');
      ccBadge.className = 'badge badge-cc';
      ccBadge.textContent = 'CC';
      thumbWrap.appendChild(ccBadge);
    }
    if (video.favorite) {
      const favBadge = document.createElement('span');
      favBadge.className = 'badge badge-fav';
      favBadge.textContent = '★';
      thumbWrap.appendChild(favBadge);
    }
    if (video.watchedPct > 3) {
      const sliver = document.createElement('div');
      sliver.className = 'progress-sliver';
      sliver.style.width = video.watchedPct + '%';
      thumbWrap.appendChild(sliver);
    }

    const info = document.createElement('div');
    info.className = 'info';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = video.title;

    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = video.watchedPct >= 95 ? 'Đã xem xong' :
      (video.watchedPct > 3 ? 'Đã xem ' + video.watchedPct + '%' : 'Nhấn để phát');

    info.appendChild(title);
    info.appendChild(desc);

    const tools = document.createElement('div');
    tools.className = 'card-tools';

    const favBtn = document.createElement('button');
    favBtn.textContent = video.favorite ? '★ Bỏ thích' : '☆ Yêu thích';
    if (video.favorite) favBtn.classList.add('active-fav');
    favBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setMeta(video.fileId, { favorite: !video.favorite });
      applyFilters();
    });

    const editBtn = document.createElement('button');
    editBtn.textContent = '✎ Sửa tên';
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openEditModal(video);
    });

    const hideBtn = document.createElement('button');
    hideBtn.textContent = video.hidden ? '↩ Khôi phục' : '🙈 Ẩn';
    hideBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setMeta(video.fileId, { hidden: !video.hidden });
      applyFilters();
    });

    tools.appendChild(favBtn);
    tools.appendChild(editBtn);
    tools.appendChild(hideBtn);

    card.appendChild(thumbWrap);
    card.appendChild(info);
    card.appendChild(tools);

    card.addEventListener('click', function () { openPlayer(video); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); openPlayer(video); }
    });

    videoGrid.appendChild(card);
  });
}

async function loadVideos() {
  const c = getConfig();
  statusMsg.textContent = 'Đang quét folder Google Drive...';
  videoGrid.innerHTML = '';

  try {
    allVideos = await fetchFolderVideos(c.apiKey, c.folderLink);
    searchInput.value = '';
    applyFilters();
    const firstCard = videoGrid.querySelector('.card');
    if (firstCard) firstCard.focus();
  } catch (err) {
    statusMsg.textContent = 'Lỗi quét folder: ' + err.message;
  }
}

// ---------------- Edit modal ----------------

function openEditModal(video) {
  editingFileId = video.fileId;
  editTitleInput.value = video.title;
  editModal.classList.remove('hidden');
  editTitleInput.focus();
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editingFileId = null;
}

editSaveBtn.addEventListener('click', function () {
  if (!editingFileId) return;
  const val = editTitleInput.value.trim();
  setMeta(editingFileId, { title: val || null });
  closeEditModal();
  applyFilters();
});

editResetBtn.addEventListener('click', function () {
  if (!editingFileId) return;
  setMeta(editingFileId, { title: null });
  closeEditModal();
  applyFilters();
});

editCancelBtn.addEventListener('click', closeEditModal);

// ---------------- Player ----------------

function clearSubtitle() {
  if (currentSubtitleUrl) { URL.revokeObjectURL(currentSubtitleUrl); currentSubtitleUrl = null; }
  subtitleTrack.removeAttribute('src');
  subtitleTrack.src = '';
  subtitleBtn.classList.add('hidden');
  subtitleBtn.classList.remove('on');
}

function updatePlayPauseIcon() {
  const icon = videoPlayer.paused ? '▶' : '⏸';
  playPauseBtn.textContent = icon;
  bigPlayBtn.textContent = icon;
  bigPlayBtn.style.display = videoPlayer.paused ? 'flex' : 'none';
}

function showControls() {
  playerControls.classList.remove('faded');
  clearTimeout(controlsHideTimer);
  if (!videoPlayer.paused) {
    controlsHideTimer = setTimeout(function () { playerControls.classList.add('faded'); }, 3000);
  }
}

async function openPlayer(rawVideo) {
  const video = decorate(rawVideo);
  const c = getConfig();
  currentVideo = video;
  clearSubtitle();

  playerTitle.textContent = video.title;
  videoPlayer.src = streamUrl(video.fileId, c.apiKey);
  videoPlayer.playbackRate = SPEEDS[speedIndex];
  speedBtn.textContent = SPEEDS[speedIndex] + 'x';
  showScreen('player');
  showControls();

  const saved = getProgress(video.fileId);
  if (saved && saved.time > 5 && saved.duration && saved.time < saved.duration - 5) {
    videoPlayer.currentTime = saved.time;
  }

  videoPlayer.play().catch(function () { /* có thể bị chặn autoplay */ });
  updatePlayPauseIcon();

  if (video.subtitleFileId) {
    try {
      const url = await buildSubtitleUrl(video, c.apiKey);
      if (url) {
        currentSubtitleUrl = url;
        subtitleTrack.src = url;
        subtitleBtn.classList.remove('hidden');
        subtitleBtn.classList.add('on');
        if (videoPlayer.textTracks && videoPlayer.textTracks[0]) {
          videoPlayer.textTracks[0].mode = 'showing';
        }
      }
    } catch (e) { /* bỏ qua nếu không tải được phụ đề */ }
  }
}

function saveCurrentProgress() {
  if (!currentVideo || !videoPlayer.duration) return;
  if (videoPlayer.currentTime < 3 || videoPlayer.currentTime > videoPlayer.duration - 2) {
    setProgress(currentVideo.fileId, null);
  } else {
    setProgress(currentVideo.fileId, { time: videoPlayer.currentTime, duration: videoPlayer.duration });
  }
}

function closePlayer() {
  saveCurrentProgress();
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  clearSubtitle();
  videoPlayer.load();
  currentVideo = null;
  showScreen('grid');
  applyFilters();
  const firstCard = videoGrid.querySelector('.card:focus') || videoGrid.querySelector('.card');
  if (firstCard) firstCard.focus();
}

backBtn.addEventListener('click', closePlayer);

function togglePlayPause() {
  if (videoPlayer.paused) videoPlayer.play(); else videoPlayer.pause();
}

playPauseBtn.addEventListener('click', togglePlayPause);
bigPlayBtn.addEventListener('click', togglePlayPause);
videoPlayer.addEventListener('play', function () { updatePlayPauseIcon(); showControls(); });
videoPlayer.addEventListener('pause', function () { updatePlayPauseIcon(); showControls(); });
videoPlayer.addEventListener('click', togglePlayPause);

rewindBtn.addEventListener('click', function () { videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10); showControls(); });
forwardBtn.addEventListener('click', function () { videoPlayer.currentTime = Math.min(videoPlayer.duration || Infinity, videoPlayer.currentTime + 10); showControls(); });

let seeking = false;
seekBar.addEventListener('input', function () {
  seeking = true;
  if (videoPlayer.duration) {
    const t = (seekBar.value / 1000) * videoPlayer.duration;
    timeCurrent.textContent = formatTime(t);
  }
});
seekBar.addEventListener('change', function () {
  if (videoPlayer.duration) {
    videoPlayer.currentTime = (seekBar.value / 1000) * videoPlayer.duration;
  }
  seeking = false;
  showControls();
});

videoPlayer.addEventListener('timeupdate', function () {
  if (!seeking && videoPlayer.duration) {
    seekBar.value = (videoPlayer.currentTime / videoPlayer.duration) * 1000;
    timeCurrent.textContent = formatTime(videoPlayer.currentTime);
  }
  clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(saveCurrentProgress, 2000);
});

videoPlayer.addEventListener('loadedmetadata', function () {
  timeDuration.textContent = formatTime(videoPlayer.duration);
});

videoPlayer.addEventListener('ended', function () {
  if (currentVideo) setProgress(currentVideo.fileId, { time: videoPlayer.duration, duration: videoPlayer.duration });
  updatePlayPauseIcon();
});

function updateMuteIcon() {
  muteBtn.textContent = (videoPlayer.muted || videoPlayer.volume === 0) ? '🔇' : '🔊';
}

muteBtn.addEventListener('click', function () {
  videoPlayer.muted = !videoPlayer.muted;
  updateMuteIcon();
  showControls();
});

volumeBar.addEventListener('input', function () {
  videoPlayer.volume = parseFloat(volumeBar.value);
  videoPlayer.muted = videoPlayer.volume === 0;
  updateMuteIcon();
  showControls();
});

subtitleBtn.addEventListener('click', function () {
  if (!videoPlayer.textTracks || !videoPlayer.textTracks[0]) return;
  const tr = videoPlayer.textTracks[0];
  const on = tr.mode === 'showing';
  tr.mode = on ? 'hidden' : 'showing';
  subtitleBtn.classList.toggle('on', !on);
  showControls();
});

speedBtn.addEventListener('click', function () {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  videoPlayer.playbackRate = SPEEDS[speedIndex];
  speedBtn.textContent = SPEEDS[speedIndex] + 'x';
  showControls();
});

function isFullscreen() {
  return !!document.fullscreenElement;
}

fullscreenBtn.addEventListener('click', function () {
  if (!isFullscreen()) {
    (playerWrap.requestFullscreen || playerWrap.webkitRequestFullscreen || function () {}).call(playerWrap);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
  }
  showControls();
});

playerWrap.addEventListener('mousemove', showControls);
playerWrap.addEventListener('touchstart', showControls);

// Lưu tiến độ khi rời/đóng trang
window.addEventListener('beforeunload', saveCurrentProgress);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) saveCurrentProgress();
});

// ---------------- Bàn phím / điều khiển từ xa ----------------

function isTextInput(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

function getFocusables(container) {
  return Array.from(container.querySelectorAll('[tabindex], input, button, select'))
    .filter(function (el) { return el.offsetParent !== null; });
}

function moveFocus(container, direction) {
  const focusables = getFocusables(container);
  const active = document.activeElement;

  if (!active || !focusables.includes(active)) {
    if (focusables[0]) focusables[0].focus();
    return;
  }

  const r1 = active.getBoundingClientRect();
  const c1x = r1.left + r1.width / 2;
  const c1y = r1.top + r1.height / 2;

  let best = null;
  let bestDist = Infinity;

  focusables.forEach(function (el) {
    if (el === active) return;
    const r2 = el.getBoundingClientRect();
    const c2x = r2.left + r2.width / 2;
    const c2y = r2.top + r2.height / 2;
    const dx = c2x - c1x;
    const dy = c2y - c1y;

    let valid = false;
    if (direction === 'up') valid = dy < -10 && Math.abs(dx) < Math.abs(dy) * 3 + r1.width;
    if (direction === 'down') valid = dy > 10 && Math.abs(dx) < Math.abs(dy) * 3 + r1.width;
    if (direction === 'left') valid = dx < -10 && Math.abs(dy) < r1.height * 1.5;
    if (direction === 'right') valid = dx > 10 && Math.abs(dy) < r1.height * 1.5;
    if (!valid) return;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) { bestDist = dist; best = el; }
  });

  if (best) best.focus();
}

document.addEventListener('keydown', function (e) {
  const key = e.key;
  const active = document.activeElement;

  // ---- Modal cấu hình / sửa tên đang mở: chỉ Escape để đóng (nếu đã cấu hình) ----
  if (!settingsScreen.classList.contains('hidden')) {
    if (key === 'Escape' && isConfigured()) { closeSettings(); }
    return;
  }
  if (!editModal.classList.contains('hidden')) {
    if (key === 'Escape') closeEditModal();
    return;
  }

  // ---- Màn hình phát video: phím tắt điều khiển media ----
  if (!playerScreen.classList.contains('hidden')) {
    if (isTextInput(active) && (key === 'ArrowLeft' || key === 'ArrowRight')) return; // để range input tự xử lý

    if (key === ' ' || key === 'k' || key === 'K') { e.preventDefault(); togglePlayPause(); return; }
    if (key === 'ArrowLeft' || key === 'j' || key === 'J') { e.preventDefault(); rewindBtn.click(); return; }
    if (key === 'ArrowRight' || key === 'l' || key === 'L') { e.preventDefault(); forwardBtn.click(); return; }
    if (key === 'ArrowUp') { e.preventDefault(); videoPlayer.volume = Math.min(1, videoPlayer.volume + 0.1); volumeBar.value = videoPlayer.volume; videoPlayer.muted = false; updateMuteIcon(); showControls(); return; }
    if (key === 'ArrowDown') { e.preventDefault(); videoPlayer.volume = Math.max(0, videoPlayer.volume - 0.1); volumeBar.value = videoPlayer.volume; updateMuteIcon(); showControls(); return; }
    if (key === 'f' || key === 'F') { e.preventDefault(); fullscreenBtn.click(); return; }
    if (key === 'm' || key === 'M') { e.preventDefault(); muteBtn.click(); return; }
    if (key === 'c' || key === 'C') { e.preventDefault(); if (!subtitleBtn.classList.contains('hidden')) subtitleBtn.click(); return; }
    if (key === 'Escape' || key === 'Backspace') { e.preventDefault(); closePlayer(); return; }
    if (key === 'Enter') {
      if (active && active.tagName === 'BUTTON') { e.preventDefault(); active.click(); }
      return;
    }
    return;
  }

  // ---- Màn hình danh sách: điều hướng không gian bằng phím mũi tên ----
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    if (isTextInput(active) && (key === 'ArrowLeft' || key === 'ArrowRight')) return;
    e.preventDefault();
    moveFocus(gridScreen, key.replace('Arrow', '').toLowerCase());
    return;
  }

  if (key === 'Enter') {
    if (active && (active.tagName === 'BUTTON' || active.classList.contains('card'))) {
      e.preventDefault();
      active.click();
    }
    return;
  }

  if (key === 'm' || key === 'M') {
    if (!isTextInput(active)) openSettings();
  }
});

// ---------------- Khởi động ----------------

if (isConfigured()) {
  showScreen('grid');
  loadVideos();
} else {
  showScreen('grid');
  openSettings();
}
