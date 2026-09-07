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

// Tài khoản dự phòng "cứng" trong code - giống tài khoản 1, sẽ tự có
// sẵn ở BẤT KỲ máy/mạng nào mở trang này, không cần cấu hình lại.
// Điền thêm object vào mảng này cho mỗi tài khoản dự phòng, ví dụ:
// { apiKey: 'AIzaSy...', folderLink: 'https://drive.google.com/drive/folders/...' }
const DEFAULT_EXTRA_ACCOUNTS = [
  // { apiKey: '', folderLink: '' },
];

// ---------------- OAuth (đăng nhập Google, tránh download quota) ----------------
const OAUTH_CLIENT_ID = '50814470997-lo6soguprrloh213jvdbll7t3kl5mk9l.apps.googleusercontent.com';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let accessToken = null;   // token hiện tại (null nếu chưa đăng nhập)
let tokenClient = null;
let swRegistration = null;

const LS_KEY_API = 'drivetv_api_key';
const LS_KEY_FOLDER_LINK = 'drivetv_folder_link';
const LS_KEY_PROXY = 'drivetv_proxy_url'; // URL server proxy tự host (vd Cloudflare Tunnel về máy nhà)
const LS_KEY_EXTRA_ACCOUNTS = 'drivetv_extra_accounts'; // tài khoản thêm qua giao diện, chỉ lưu trên máy này
const LS_KEY_META = 'drivetv_meta';         // {fileId: {title, favorite, hidden}}
const LS_KEY_PROGRESS = 'drivetv_progress'; // {fileId: seconds}

// ---------------- DOM refs ----------------

const gridScreen = document.getElementById('gridScreen');
const playerScreen = document.getElementById('playerScreen');
const settingsScreen = document.getElementById('settingsScreen');
const editModal = document.getElementById('editModal');

const settingsBtn = document.getElementById('settingsBtn');
const signInBtn = document.getElementById('signInBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const manifestInput = document.getElementById('manifestInput');
const proxyUrlInput = document.getElementById('proxyUrlInput');
const extraAccountsList = document.getElementById('extraAccountsList');
const addAccountBtn = document.getElementById('addAccountBtn');
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
const seekFlashLeft = document.getElementById('seekFlashLeft');
const seekFlashRight = document.getElementById('seekFlashRight');
const holdSpeedBadge = document.getElementById('holdSpeedBadge');
const playerError = document.getElementById('playerError');
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

function getExtraAccounts() {
  // Gộp 2 nguồn: tài khoản "cứng" trong code (DEFAULT_EXTRA_ACCOUNTS -
  // có sẵn ở MỌI máy/mạng) + tài khoản thêm qua giao diện Cài đặt
  // (chỉ lưu riêng trên máy/trình duyệt đang dùng).
  let fromUI = [];
  try {
    fromUI = JSON.parse(localStorage.getItem(LS_KEY_EXTRA_ACCOUNTS) || '[]');
    if (!Array.isArray(fromUI)) fromUI = [];
  } catch (e) { fromUI = []; }
  return DEFAULT_EXTRA_ACCOUNTS.concat(fromUI);
}

function getConfig() {
  const primary = {
    apiKey: localStorage.getItem(LS_KEY_API) || DEFAULT_API_KEY || '',
    folderLink: localStorage.getItem(LS_KEY_FOLDER_LINK) || DEFAULT_FOLDER_LINK || ''
  };
  // Danh sách đầy đủ các tài khoản (tài khoản 1 + các tài khoản dự
  // phòng) - dùng để quét/gộp video và tự chuyển tài khoản khi 1 cái
  // bị lỗi "download quota exceeded".
  const accounts = [primary].concat(getExtraAccounts()).filter(function (a) {
    return a && a.apiKey && a.folderLink;
  });
  return {
    apiKey: primary.apiKey,
    folderLink: primary.folderLink,
    accounts: accounts,
    // Nếu điền, mọi request tải video/phụ đề sẽ đi qua server proxy này
    // (chạy trên máy nhà) thay vì gọi thẳng Google ẩn danh -> tránh lỗi
    // "download quota exceeded".
    proxyUrl: (localStorage.getItem(LS_KEY_PROXY) || '').trim().replace(/\/+$/, '')
  };
}

// Tài khoản chia sẻ qua file accounts.json trong repo - sửa file này
// thẳng trên GitHub (không cần đụng vào code app.js) là MỌI máy mở
// trang đều tự thấy ngay từ lần tải trang kế tiếp.
async function fetchSharedAccounts() {
  try {
    const res = await fetch('accounts.json?t=' + Date.now()); // chặn cache cũ
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter(function (a) { return a && a.apiKey && a.folderLink; });
  } catch (e) {
    return []; // không có file / lỗi mạng -> bỏ qua, không chặn app chạy tiếp
  }
}

// Danh sách tài khoản đầy đủ dùng để quét video: tài khoản 1 + code
// (DEFAULT_EXTRA_ACCOUNTS) + giao diện (localStorage, riêng máy này)
// + accounts.json (chia sẻ qua GitHub, mọi máy đều thấy).
async function getAllAccounts() {
  const c = getConfig();
  const shared = await fetchSharedAccounts();
  const seen = new Set();
  const all = c.accounts.concat(shared).filter(function (a) {
    const key = a.apiKey + '|' + a.folderLink;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return all;
}

function saveConfig(apiKey, folderLink, proxyUrl, extraAccounts) {
  localStorage.setItem(LS_KEY_API, apiKey);
  localStorage.setItem(LS_KEY_FOLDER_LINK, folderLink);
  localStorage.setItem(LS_KEY_PROXY, proxyUrl || '');
  localStorage.setItem(LS_KEY_EXTRA_ACCOUNTS, JSON.stringify(extraAccounts || []));
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
  // Nếu có cấu hình proxy (server chạy ở nhà, đã xác thực sẵn bằng
  // service account) thì luôn ưu tiên đi qua đó - áp dụng cho mọi
  // trình duyệt/TV, kể cả loại không đăng nhập Google được, và không
  // bao giờ dính lỗi "download quota exceeded" vì phía Google thấy đây
  // là request có xác thực.
  const proxyUrl = getConfig().proxyUrl;
  if (proxyUrl) return proxyUrl + '/stream?id=' + encodeURIComponent(fileId);

  const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media';
  // Nếu đã đăng nhập Google, không gắn key nữa - service worker (sw.js)
  // sẽ tự chèn header Authorization: Bearer <token> vào request này.
  // Nhờ vậy request được tính là "có xác thực", không bị tính vào
  // download quota dành cho truy cập ẩn danh qua link công khai.
  if (accessToken) return base;
  return base + '&key=' + encodeURIComponent(apiKey);
}

// ---------------- OAuth: đăng nhập Google ----------------

function sendTokenToServiceWorker(token) {
  if (!('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SET_TOKEN', token: token });
  } else {
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage({ type: 'SET_TOKEN', token: token });
    });
  }
}

function updateSignInButton() {
  if (!signInBtn) return;
  signInBtn.textContent = accessToken ? '✅ Đã đăng nhập' : '👤 Đăng nhập';
  signInBtn.title = accessToken
    ? 'Đã đăng nhập Google (tránh giới hạn tải xuống)'
    : 'Đăng nhập Google để tránh lỗi "download quota exceeded"';
}

// ---------------- Nhận diện TV / trình duyệt cũ không hỗ trợ đăng nhập Google ----------------
// Google chặn hẳn luồng OAuth (lỗi "disallowed_useragent") trên nhiều
// trình duyệt TV đời cũ / WebView nhúng. Vì đây là chặn từ phía Google,
// không có cách nào vượt qua bằng code, nên tốt nhất là ẩn hẳn nút đăng
// nhập trên các thiết bị này để tránh người dùng bị kẹt ở màn hình lỗi.
function isLikelyUnsupportedAuthBrowser() {
  const ua = navigator.userAgent || '';
  const tvPattern = /SmartTV|Tizen|Web0S|WebOS|NetCast|BRAVIA|VIDAA|HbbTV|CrKey|AFTM|AFTT|AFTS|AFTB|AFTA|Roku|PhilipsTV|GoogleTV|SMART-TV|DuiD|POV_TV|TV Store|LG Browser|Espial|OMI\/|Quest/i;
  if (tvPattern.test(ua)) return true;
  // Engine quá cũ (thường thấy trên TV) sẽ thiếu các API JS hiện đại này.
  if (typeof Promise === 'undefined' || typeof fetch === 'undefined') return true;
  if (!window.crypto || !window.crypto.subtle) return true;
  return false;
}

let authInitAttempts = 0;
const AUTH_INIT_MAX_ATTEMPTS = 15; // ~4.5s, sau đó coi như trình duyệt không hỗ trợ

function hideSignInButton() {
  if (signInBtn) signInBtn.classList.add('hidden');
}

function initGoogleAuth() {
  if (isLikelyUnsupportedAuthBrowser()) {
    hideSignInButton();
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.oauth2) {
    authInitAttempts++;
    if (authInitAttempts >= AUTH_INIT_MAX_ATTEMPTS) {
      // Thư viện đăng nhập Google không load được (mạng chặn, trình
      // duyệt không hỗ trợ...) - ẩn nút để tránh bấm vào bị lỗi.
      hideSignInButton();
      return;
    }
    // Thư viện GIS load async, thử lại sau 300ms nếu chưa sẵn sàng
    setTimeout(initGoogleAuth, 300);
    return;
  }
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: OAUTH_CLIENT_ID,
      scope: OAUTH_SCOPE,
      callback: function (response) {
        if (response && response.access_token) {
          accessToken = response.access_token;
          sendTokenToServiceWorker(accessToken);
          updateSignInButton();
          // Đặt hẹn giờ tự hỏi lại token mới trước khi hết hạn (~1 giờ)
          const expiresInMs = (response.expires_in || 3600) * 1000;
          setTimeout(function () {
            if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
          }, Math.max(expiresInMs - 60000, 30000));
        }
      },
      error_callback: function () {
        // Google báo không đăng nhập được (vd. disallowed_useragent) -
        // im lặng bỏ qua, người dùng vẫn dùng được app qua API key.
      }
    });
  } catch (e) {
    hideSignInButton();
  }
}

if (signInBtn) {
  signInBtn.addEventListener('click', function () {
    if (isLikelyUnsupportedAuthBrowser()) { hideSignInButton(); return; }
    if (!tokenClient) { initGoogleAuth(); setTimeout(function () { if (tokenClient) tokenClient.requestAccessToken(); }, 500); return; }
    try { tokenClient.requestAccessToken(); } catch (e) { /* bỏ qua, dùng API key */ }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    swRegistration = reg;
    if (accessToken) sendTokenToServiceWorker(accessToken);
  }).catch(function () { /* nếu SW không đăng ký được, app vẫn chạy bằng API key */ });
}

initGoogleAuth();
updateSignInButton();

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
const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'];

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

// Quét 1 tài khoản, trả về danh sách "source" (1 video = 1 file cụ
// thể trên đúng tài khoản đó, kèm apiKey riêng để phát/tải đúng nó).
async function fetchAccountSources(account, accountIndex) {
  const folderId = extractFolderId(account.folderLink);
  const files = await listFolderFiles(account.apiKey, folderId);

  const videoFiles = files.filter(isVideoFile);
  const subtitleFiles = files.filter(isSubtitleFile);

  const subtitleByBase = {};
  subtitleFiles.forEach(function (f) { subtitleByBase[getBaseName(f.name)] = f; });

  return videoFiles.map(function (f) {
    const sub = subtitleByBase[getBaseName(f.name)];
    return {
      baseTitle: getBaseName(f.name),
      accountIndex: accountIndex,
      apiKey: account.apiKey,
      fileId: f.id,
      mimeType: f.mimeType || '',
      thumbnail: f.thumbnailLink || null,
      createdTime: f.createdTime || null,
      subtitleFileId: sub ? sub.id : null,
      subtitleExt: sub ? getExtension(sub.name) : null
    };
  });
}

// Quét TẤT CẢ tài khoản đã cấu hình, gộp phim trùng tên (cùng 1 phim
// nằm ở nhiều tài khoản) thành 1 thẻ duy nhất, giữ danh sách "sources"
// theo thứ tự ưu tiên để tự chuyển tài khoản khi 1 cái bị lỗi quota.
async function fetchFolderVideos(accounts) {
  const results = await Promise.allSettled(
    accounts.map(function (acc, i) { return fetchAccountSources(acc, i); })
  );

  const errors = [];
  const byTitle = new Map();

  results.forEach(function (result, i) {
    if (result.status !== 'fulfilled') {
      errors.push('Tài khoản ' + (i + 1) + ': ' + result.reason.message);
      return;
    }
    result.value.forEach(function (source) {
      if (!byTitle.has(source.baseTitle)) byTitle.set(source.baseTitle, []);
      byTitle.get(source.baseTitle).push(source);
    });
  });

  if (byTitle.size === 0 && errors.length) {
    throw new Error(errors.join(' | '));
  }

  const videos = [];
  byTitle.forEach(function (sources, title) {
    sources.sort(function (a, b) { return a.accountIndex - b.accountIndex; });
    const primary = sources[0];
    videos.push({
      fileId: primary.fileId,
      originalTitle: title,
      mimeType: primary.mimeType,
      thumbnail: primary.thumbnail,
      createdTime: primary.createdTime,
      subtitleFileId: primary.subtitleFileId,
      subtitleExt: primary.subtitleExt,
      sources: sources
    });
  });

  return videos;
}

// ---------------- Chuyển .srt sang .vtt ----------------

function srtToVtt(srtText) {
  let text = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + text;
}

// ---------------- Chuyển .ass/.ssa sang .vtt ----------------

// Đổi mốc thời gian kiểu ASS "0:00:01.23" (H:MM:SS.cc, cc = centgiây)
// sang mốc thời gian kiểu VTT "00:00:01.230" (HH:MM:SS.mmm).
function assTimeToVtt(t) {
  const m = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/.exec(t.trim());
  if (!m) return '00:00:00.000';
  const h = String(m[1]).padStart(2, '0');
  const mm = m[2];
  const ss = m[3];
  const ms = m[4] + '0'; // centigiây (2 chữ số) -> mili giây (3 chữ số)
  return h + ':' + mm + ':' + ss + '.' + ms;
}

// Bóc sạch các mã định dạng riêng của ASS trong nội dung câu thoại,
// ví dụ {\an8}, {\pos(400,300)}, {\c&H0000FF&}... và đổi \N, \n, \h
// thành xuống dòng / khoảng trắng cho dễ đọc trên phụ đề thường.
function cleanAssText(text) {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .trim();
}

function assToVtt(assText) {
  const raw = assText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');

  let inEvents = false;
  let fields = [];
  let idxStart = -1, idxEnd = -1, idxText = -1;
  const cues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^\[.+\]$/.test(trimmed)) {
      inEvents = /^\[Events\]$/i.test(trimmed);
      continue;
    }
    if (!inEvents) continue;

    if (/^Format:/i.test(trimmed)) {
      fields = trimmed.substring(trimmed.indexOf(':') + 1).split(',').map(function (s) { return s.trim().toLowerCase(); });
      idxStart = fields.indexOf('start');
      idxEnd = fields.indexOf('end');
      idxText = fields.indexOf('text');
      continue;
    }

    if (/^Dialogue:/i.test(trimmed) && idxText !== -1) {
      const body = trimmed.substring(trimmed.indexOf(':') + 1);
      // Text là trường cuối cùng và có thể chứa dấu phẩy, nên chỉ tách
      // đúng số trường đứng trước nó, phần còn lại giữ nguyên làm text.
      const parts = body.split(',');
      if (parts.length <= idxText) continue;
      const head = parts.slice(0, idxText);
      const textPart = parts.slice(idxText).join(',');

      const start = idxStart !== -1 ? assTimeToVtt(head[idxStart]) : null;
      const end = idxEnd !== -1 ? assTimeToVtt(head[idxEnd]) : null;
      const text = cleanAssText(textPart);

      if (start && end && text) {
        cues.push({ start: start, end: end, text: text });
      }
    }
  }

  let vtt = 'WEBVTT\n\n';
  cues.forEach(function (cue, i) {
    vtt += (i + 1) + '\n' + cue.start + ' --> ' + cue.end + '\n' + cue.text + '\n\n';
  });
  return vtt;
}

async function buildSubtitleUrl(source) {
  if (!source || !source.subtitleFileId) return null;
  const res = await fetch(streamUrl(source.subtitleFileId, source.apiKey));
  if (!res.ok) return null;
  let text = await res.text();
  if (source.subtitleExt === 'srt') text = srtToVtt(text);
  else if (source.subtitleExt === 'ass' || source.subtitleExt === 'ssa') text = assToVtt(text);
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

// ---------------- Tài khoản dự phòng thêm qua giao diện (chỉ trên máy này) ----------------

function getUIOnlyExtraAccounts() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY_EXTRA_ACCOUNTS) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function renderExtraAccountRows(accounts) {
  if (!extraAccountsList) return;
  extraAccountsList.innerHTML = '';
  accounts.forEach(function (acc, i) {
    const row = document.createElement('div');
    row.className = 'account-row';
    row.innerHTML =
      '<div class="account-fields">' +
      '<label>Google Drive API Key (tài khoản thêm ' + (i + 1) + ')</label>' +
      '<input type="text" class="extraApiKey" placeholder="AIzaSy..." value="' +
      (acc.apiKey || '').replace(/"/g, '&quot;') + '" />' +
      '<label>Link thư mục Google Drive (tài khoản thêm ' + (i + 1) + ')</label>' +
      '<input type="text" class="extraFolderLink" placeholder="https://drive.google.com/drive/folders/..." value="' +
      (acc.folderLink || '').replace(/"/g, '&quot;') + '" />' +
      '</div>' +
      '<button type="button" class="btn removeAccountBtn" tabindex="0">Xoá</button>';
    row.querySelector('.removeAccountBtn').addEventListener('click', function () {
      row.remove();
    });
    extraAccountsList.appendChild(row);
  });
}

function collectExtraAccountsFromUI() {
  if (!extraAccountsList) return [];
  const rows = Array.from(extraAccountsList.querySelectorAll('.account-row'));
  return rows.map(function (row) {
    return {
      apiKey: row.querySelector('.extraApiKey').value.trim(),
      folderLink: row.querySelector('.extraFolderLink').value.trim()
    };
  }).filter(function (a) { return a.apiKey && a.folderLink; });
}

if (addAccountBtn) {
  addAccountBtn.addEventListener('click', function () {
    const current = collectExtraAccountsFromUI();
    current.push({ apiKey: '', folderLink: '' });
    renderExtraAccountRows(current);
  });
}

function openSettings() {
  const c = getConfig();
  apiKeyInput.value = c.apiKey;
  manifestInput.value = c.folderLink;
  renderExtraAccountRows(getUIOnlyExtraAccounts());
  if (proxyUrlInput) proxyUrlInput.value = c.proxyUrl;
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
  const proxyUrl = proxyUrlInput ? proxyUrlInput.value.trim().replace(/\/+$/, '') : '';
  const extraAccounts = collectExtraAccountsFromUI();
  if (!apiKey || !folderLink) {
    settingsError.textContent = 'Vui lòng nhập đủ API Key và link folder Google Drive.';
    return;
  }
  saveConfig(apiKey, folderLink, proxyUrl, extraAccounts);
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
  statusMsg.textContent = 'Đang quét folder Google Drive...';
  videoGrid.innerHTML = '';

  try {
    const accounts = await getAllAccounts();
    allVideos = await fetchFolderVideos(accounts);
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

function showPlayerError(message) {
  if (!playerError) return;
  playerError.textContent = message;
  playerError.classList.remove('hidden');
}

function hidePlayerError() {
  if (!playerError) return;
  playerError.classList.add('hidden');
  playerError.textContent = '';
}

// Gọi thử 1 byte đầu của file trước khi gán vào thẻ <video>, để phát
// hiện sớm lỗi 403 (file chưa chia sẻ công khai) / 404 (file bị xoá,
// sai ID) và báo rõ ràng, thay vì để video đơ im lặng không rõ lý do.
async function checkPlayableUrl(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    if (res.ok || res.status === 206) return { ok: true };
    return { ok: false, status: res.status };
  } catch (e) {
    // Lỗi mạng/CORS: thường đi kèm 403 phía server không trả header
    // CORS, trình duyệt báo thành lỗi "Failed to fetch" chung chung.
    return { ok: false, status: null };
  }
}

function describePlaybackError(status) {
  if (status === 403) {
    return 'Không phát được video (lỗi 403). Nhiều khả năng file trên Google Drive chưa để chia sẻ "Bất kỳ ai có đường liên kết → Người xem". Vào Drive, chuột phải vào file → Chia sẻ → đổi thành "Bất kỳ ai có đường liên kết", quyền Người xem.';
  }
  if (status === 404) {
    return 'Không tìm thấy video (lỗi 404). File có thể đã bị xoá hoặc di chuyển khỏi thư mục trên Google Drive.';
  }
  return 'Không phát được video. Vui lòng kiểm tra lại kết nối mạng hoặc quyền chia sẻ file trên Google Drive rồi tải lại trang.';
}

async function openPlayer(rawVideo) {
  const video = decorate(rawVideo);
  currentVideo = video;
  clearSubtitle();
  hidePlayerError();

  playerTitle.textContent = video.title;
  videoPlayer.playbackRate = SPEEDS[speedIndex];
  speedBtn.textContent = SPEEDS[speedIndex] + 'x';
  showScreen('player');
  showControls();

  // Thử lần lượt từng "nguồn" (mỗi tài khoản Drive chứa phim này 1
  // bản) - nếu tài khoản đầu bị lỗi (vd "download quota exceeded"),
  // tự động thử tài khoản kế tiếp mà không cần người xem làm gì.
  const sources = (video.sources && video.sources.length) ? video.sources : [{
    apiKey: getConfig().apiKey,
    fileId: video.fileId,
    subtitleFileId: video.subtitleFileId,
    subtitleExt: video.subtitleExt
  }];

  let workingSource = null;
  let lastStatus = null;

  for (const source of sources) {
    const url = streamUrl(source.fileId, source.apiKey);
    const check = await checkPlayableUrl(url);
    if (check.ok) { workingSource = source; break; }
    lastStatus = check.status;
  }

  if (!workingSource) {
    showPlayerError(describePlaybackError(lastStatus));
    return;
  }

  videoPlayer.src = streamUrl(workingSource.fileId, workingSource.apiKey);

  const saved = getProgress(video.fileId);
  if (saved && saved.time > 5 && saved.duration && saved.time < saved.duration - 5) {
    videoPlayer.currentTime = saved.time;
  }

  videoPlayer.play().catch(function () { /* có thể bị chặn autoplay */ });
  updatePlayPauseIcon();

  if (workingSource.subtitleFileId) {
    try {
      const url = await buildSubtitleUrl(workingSource);
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

videoPlayer.addEventListener('error', function () {
  // Trường hợp preflight qua được nhưng thẻ <video> vẫn không phát nổi
  // (vd. định dạng codec không hỗ trợ, hoặc lỗi phát sinh giữa chừng).
  if (currentVideo && playerError && playerError.classList.contains('hidden')) {
    showPlayerError('Không phát được video này. Định dạng có thể không được trình duyệt hỗ trợ, hoặc kết nối tới Google Drive bị gián đoạn.');
  }
});

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
  hidePlayerError();
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

function seekBy(delta) {
  if (!videoPlayer.duration) return;
  videoPlayer.currentTime = Math.min(Math.max(0, videoPlayer.currentTime + delta), videoPlayer.duration);
  showControls();
}

rewindBtn.addEventListener('click', function () { seekBy(-10); });
forwardBtn.addEventListener('click', function () { seekBy(10); });

// ---------------- Nhấn đúp 2 bên video để tua ±10s, giữ để tua nhanh 2x ----------------

function showSeekFlash(side) {
  const el = side === 'left' ? seekFlashLeft : seekFlashRight;
  el.classList.remove('show');
  void el.offsetWidth; // ép trình duyệt tính lại để chạy lại animation
  el.classList.add('show');
}

let videoClickTimer = null;
let videoClickCount = 0;
let suppressNextVideoClick = false;

videoPlayer.addEventListener('click', function (e) {
  if (suppressNextVideoClick) { suppressNextVideoClick = false; return; }
  const rect = videoPlayer.getBoundingClientRect();
  const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;

  videoClickCount++;
  if (videoClickCount === 1) {
    videoClickTimer = setTimeout(function () {
      if (videoClickCount === 1) togglePlayPause();
      videoClickCount = 0;
    }, 280);
  } else {
    clearTimeout(videoClickTimer);
    videoClickCount = 0;
    seekBy(isLeftHalf ? -10 : 10);
    showSeekFlash(isLeftHalf ? 'left' : 'right');
  }
});

// Chạm/nhấn giữ trên video (không phải đúp) -> tua nhanh tạm 2x, giống
// thao tác quen thuộc trên Youtube/TikTok. Nhả tay là về tốc độ cũ.
let holdTimer = null;
let holdActive = false;
let rateBeforeHold = 1;

function startHoldTimer(e) {
  if (e.target !== videoPlayer) return;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(function () {
    holdActive = true;
    rateBeforeHold = videoPlayer.playbackRate;
    videoPlayer.playbackRate = 2;
    holdSpeedBadge.classList.add('show');
  }, 420);
}

function endHoldTimer() {
  clearTimeout(holdTimer);
  if (holdActive) {
    videoPlayer.playbackRate = rateBeforeHold;
    holdSpeedBadge.classList.remove('show');
    holdActive = false;
    suppressNextVideoClick = true;
    videoClickCount = 0;
  }
}

videoPlayer.addEventListener('mousedown', startHoldTimer);
videoPlayer.addEventListener('touchstart', startHoldTimer, { passive: true });
videoPlayer.addEventListener('mouseup', endHoldTimer);
videoPlayer.addEventListener('mouseleave', endHoldTimer);
videoPlayer.addEventListener('touchend', endHoldTimer);
videoPlayer.addEventListener('touchcancel', endHoldTimer);

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
