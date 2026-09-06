// ============================================================
// Dethi Drive TV - phiên bản Web (quét Folder + quản lý + trình
// phát tuỳ chỉnh có tua lùi/tiến, tốc độ, phụ đề, ghi nhớ vị trí xem)
// ============================================================

// ============================================================
// CẤU HÌNH MẶC ĐỊNH (điền 1 LẦN DUY NHẤT trước khi đưa code lên
// GitHub Pages, để mở trang là có video ngay, không cần nhập gì).
//
// Hỗ trợ NHIỀU TÀI KHOẢN Google Drive cùng lúc: mỗi tài khoản là 1
// folder riêng (apiKey có thể dùng chung 1 key cho mọi tài khoản, vì
// API Key chỉ là khoá của 1 project Google Cloud, không gắn với tài
// khoản Drive nào - cái khác nhau giữa các "tài khoản" ở đây chính là
// folderLink, tức là 2 folder Drive khác nhau chứa 2 bản phim giống
// nhau). App sẽ tự quét hết các folder bên dưới, phim nào trùng tên ở
// nhiều tài khoản sẽ gộp làm 1 mục - khi phát mà tài khoản A bị giới
// hạn (quota) thì tự động nhảy qua tài khoản B phát tiếp, không cần
// bấm gì thêm.
//
// Để trống apiKey/folderLink của 1 dòng nếu chưa dùng tới - dòng đó sẽ
// bị bỏ qua. Có thể thêm/bớt/tuỳ chỉnh ngay trên web qua màn hình
// Cấu hình (⚙️ hoặc phím M) mà không cần sửa file này.
// ============================================================
const DEFAULT_ACCOUNTS = [
  {
    label: 'minhvukgh1979',
    apiKey: 'AIzaSyC8Wyr26jIvv7AETbMshe9u7jv2owfcQRw',
    folderLink: 'https://drive.google.com/drive/folders/17wcsWpbjUcW5shb61luAqPjaRoh-8qL2'
  },
  {
    label: 'minhvukgh1977',
    apiKey: '',      // <-- điền API Key dùng cho tài khoản 2 (có thể copy y hệt key ở trên)
    folderLink: ''   // <-- điền link folder Drive THẬT SỰ của minhvukgh1977 (khác folder ở trên)
  }
];

// ---------------- OAuth (đăng nhập Google, tránh download quota) ----------------
const OAUTH_CLIENT_ID = '50814470997-lo6soguprrloh213jvdbll7t3kl5mk9l.apps.googleusercontent.com';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let accessToken = null;   // token hiện tại (null nếu chưa đăng nhập)
let tokenClient = null;
let swRegistration = null;

const LS_KEY_API = 'drivetv_api_key';             // cũ - chỉ dùng để migrate 1 lần
const LS_KEY_FOLDER_LINK = 'drivetv_folder_link'; // cũ - chỉ dùng để migrate 1 lần
const LS_KEY_ACCOUNTS = 'drivetv_accounts';       // MỚI: [{label, apiKey, folderLink}, ...]
const LS_KEY_META = 'drivetv_meta';         // {key: {title, favorite, hidden}}
const LS_KEY_PROGRESS = 'drivetv_progress'; // {key: {time, duration}}

// ---------------- DOM refs ----------------

const gridScreen = document.getElementById('gridScreen');
const playerScreen = document.getElementById('playerScreen');
const settingsScreen = document.getElementById('settingsScreen');
const editModal = document.getElementById('editModal');

const settingsBtn = document.getElementById('settingsBtn');
const signInBtn = document.getElementById('signInBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const accountsListEl = document.getElementById('accountsList');
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
let currentSourceIndex = -1; // vị trí trong video.sources đang phát (để nhảy tài khoản khi lỗi)
let editingKey = null;
let controlsHideTimer = null;
let progressSaveTimer = null;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
let speedIndex = 2;

// ---------------- Config helpers ----------------

// Bản cũ chỉ lưu 1 tài khoản (LS_KEY_API + LS_KEY_FOLDER_LINK). Nếu
// trình duyệt người dùng còn cấu hình kiểu cũ và CHƯA có LS_KEY_ACCOUNTS,
// tự chuyển sang định dạng mới 1 lần duy nhất để không mất cấu hình.
function migrateOldConfigIfNeeded() {
  if (localStorage.getItem(LS_KEY_ACCOUNTS)) return;
  const oldKey = localStorage.getItem(LS_KEY_API);
  const oldFolder = localStorage.getItem(LS_KEY_FOLDER_LINK);
  if (oldKey || oldFolder) {
    saveAccounts([{ label: '', apiKey: oldKey || '', folderLink: oldFolder || '' }]);
  }
}

function getAccounts() {
  migrateOldConfigIfNeeded();
  let list = [];
  try { list = JSON.parse(localStorage.getItem(LS_KEY_ACCOUNTS) || '[]'); }
  catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];

  list = list.filter(function (a) { return a && a.apiKey && a.folderLink; });

  if (list.length === 0) {
    // Chưa có gì lưu trong trình duyệt -> dùng cấu hình mặc định điền
    // sẵn trong code (DEFAULT_ACCOUNTS ở đầu file).
    list = DEFAULT_ACCOUNTS.filter(function (a) { return a.apiKey && a.folderLink; });
  }
  return list;
}

function saveAccounts(accounts) {
  localStorage.setItem(LS_KEY_ACCOUNTS, JSON.stringify(accounts));
}

function isConfigured() {
  return getAccounts().length > 0;
}

function getMetaStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_META) || '{}'); }
  catch (e) { return {}; }
}

function saveMetaStore(store) {
  localStorage.setItem(LS_KEY_META, JSON.stringify(store));
}

// Lưu ý: "key" ở đây là khoá gộp phim theo TÊN (xem fetchFolderVideos),
// không phải fileId của 1 file cụ thể - để yêu thích/ẩn/tên hiển thị/vị
// trí xem giữ nguyên bất kể đang phát từ tài khoản/nguồn nào.
function getMeta(key) {
  const store = getMetaStore();
  return store[key] || { title: null, favorite: false, hidden: false };
}

function setMeta(key, patch) {
  const store = getMetaStore();
  store[key] = Object.assign({ title: null, favorite: false, hidden: false }, store[key] || {}, patch);
  saveMetaStore(store);
}

function getProgressStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_PROGRESS) || '{}'); }
  catch (e) { return {}; }
}

function getProgress(key) {
  const store = getProgressStore();
  return store[key] || null;
}

function setProgress(key, data) {
  const store = getProgressStore();
  if (data === null) { delete store[key]; }
  else { store[key] = data; }
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

// Quét NHIỀU tài khoản (mỗi tài khoản = 1 cặp apiKey + folder link),
// rồi GỘP các video trùng TÊN PHIM (bỏ dấu, không phân biệt hoa/thường)
// thành 1 mục duy nhất có nhiều "nguồn" (sources). Khi phát, app sẽ thử
// lần lượt từng nguồn - nếu tài khoản này bị giới hạn (quota/403) sẽ tự
// nhảy sang tài khoản khác phát cùng phim đó, không cần người xem làm
// gì thêm. Trả về mảng video, mỗi video có dạng:
//   { key, originalTitle, thumbnail, createdTime, sources: [
//       { accountLabel, apiKey, fileId, subtitleFileId, subtitleExt }, ...
//   ] }
async function fetchFolderVideos(accounts) {
  const merged = {};  // key (tên phim đã chuẩn hoá) -> video gộp
  const order = [];   // giữ đúng thứ tự phim xuất hiện lần đầu
  const errors = [];  // lỗi riêng của từng tài khoản (không làm hỏng cả danh sách)

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    if (!acc || !acc.apiKey || !acc.folderLink) continue;
    const accLabel = acc.label || ('Tài khoản ' + (i + 1));
    const folderId = extractFolderId(acc.folderLink);

    let files;
    try {
      files = await listFolderFiles(acc.apiKey, folderId);
    } catch (err) {
      // 1 tài khoản bị lỗi (sai key, hết quota liệt kê, folder riêng
      // tư...) không nên làm mất luôn danh sách của các tài khoản còn
      // lại - ghi nhận lỗi rồi bỏ qua, quét tiếp tài khoản kế.
      errors.push(accLabel + ': ' + err.message);
      continue;
    }

    const videoFiles = files.filter(isVideoFile);
    const subtitleFiles = files.filter(isSubtitleFile);
    const subtitleByBase = {};
    subtitleFiles.forEach(function (f) { subtitleByBase[getBaseName(f.name)] = f; });

    videoFiles.forEach(function (f) {
      const baseName = getBaseName(f.name);
      const key = normalizeForSearch(baseName);
      const sub = subtitleByBase[baseName];

      const source = {
        accountLabel: accLabel,
        apiKey: acc.apiKey,
        fileId: f.id,
        subtitleFileId: sub ? sub.id : null,
        subtitleExt: sub ? getExtension(sub.name) : null
      };

      if (!merged[key]) {
        merged[key] = {
          key: key,
          originalTitle: baseName,
          mimeType: f.mimeType || '',
          thumbnail: f.thumbnailLink || null,
          createdTime: f.createdTime || null,
          sources: [source]
        };
        order.push(key);
      } else {
        merged[key].sources.push(source);
        if (!merged[key].thumbnail && f.thumbnailLink) merged[key].thumbnail = f.thumbnailLink;
      }
    });
  }

  if (order.length === 0 && errors.length > 0) {
    // Không quét được bất kỳ tài khoản nào -> báo lỗi rõ ràng thay vì
    // âm thầm trả về danh sách rỗng.
    throw new Error(errors.join(' | '));
  }

  const videos = order.map(function (k) { return merged[k]; });
  videos._partialErrors = errors; // để loadVideos() có thể cảnh báo nhẹ nếu muốn
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

// ---------------- Cấu hình nhiều tài khoản (dòng động trong modal) ----------------

let accountDraftRows = []; // [{label, apiKey, folderLink}] đang chỉnh trong modal, chưa lưu


// ================= ACCOUNT SETUP WIZARD =================
const accountWizard = document.getElementById('accountWizard');
const closeAccountWizardBtn = document.getElementById('closeAccountWizardBtn');
const wizardGoogleAccount = document.getElementById('wizardGoogleAccount');
const wizardAccountLabel = document.getElementById('wizardAccountLabel');
const wizardFolderAccountLabel = document.getElementById('wizardFolderAccountLabel');
const wizardApiKey = document.getElementById('wizardApiKey');
const wizardApiStatus = document.getElementById('wizardApiStatus');
const wizardFolderLink = document.getElementById('wizardFolderLink');
const wizardAccountLabelInput = document.getElementById('wizardAccountLabelInput');
const wizardFolderStatus = document.getElementById('wizardFolderStatus');
const wizardStep5Next = document.getElementById('wizardStep5Next');
const wizardSummary = document.getElementById('wizardSummary');

let accountWizardStep = 1;
let accountWizardData = {
  googleAccount: '',
  label: '',
  apiKey: '',
  folderLink: '',
  folderOk: false,
  videoCount: 0
};

function wizardShowStep(step) {
  accountWizardStep = step;
  accountWizard.querySelectorAll('.wizard-panel').forEach(function(p) {
    p.classList.toggle('hidden', Number(p.dataset.panel) !== step);
  });
  accountWizard.querySelectorAll('[data-wstep]').forEach(function(p) {
    const n = Number(p.dataset.wstep);
    p.classList.toggle('active', n === step);
    p.classList.toggle('done', n < step);
  });
}

function openAccountWizard() {
  accountWizardData = { googleAccount:'', label:'', apiKey:'', folderLink:'', folderOk:false, videoCount:0 };
  wizardGoogleAccount.value = '';
  wizardApiKey.value = '';
  wizardAccountLabelInput.value = '';
  wizardFolderLink.value = '';
  wizardApiStatus.textContent = '';
  wizardFolderStatus.textContent = '';
  wizardStep5Next.disabled = true;
  wizardShowStep(1);
  accountWizard.classList.remove('hidden');
  wizardGoogleAccount.focus();
  accountWizard.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function closeAccountWizard() {
  accountWizard.classList.add('hidden');
}

document.getElementById('addAccountBtn')?.addEventListener('click', openAccountWizard);
closeAccountWizardBtn?.addEventListener('click', closeAccountWizard);

document.getElementById('wizardStep1Next')?.addEventListener('click', function() {
  const email = wizardGoogleAccount.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Vui lòng nhập đúng Google Account/Gmail của tài khoản mới.');
    return;
  }
  accountWizardData.googleAccount = email;
  wizardAccountLabel.textContent = email;
  wizardFolderAccountLabel.textContent = email;
  wizardShowStep(2);
});

document.getElementById('wizardCloudBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardProjectBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/projectcreate', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardStep2Next')?.addEventListener('click', function() {
  if (!document.getElementById('wizardProjectDone').checked) {
    alert('Hãy xác nhận bạn đã chọn/tạo Project bằng Google Account mới.');
    return;
  }
  wizardShowStep(3);
});
document.getElementById('wizardDriveApiBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/apis/library/drive.googleapis.com', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardStep3Next')?.addEventListener('click', function() {
  if (!document.getElementById('wizardDriveApiDone').checked) {
    alert('Hãy xác nhận Google Drive API đã được bật.');
    return;
  }
  wizardShowStep(4);
});
document.getElementById('wizardCredentialsBtn')?.addEventListener('click', function() {
  window.open('https://console.cloud.google.com/apis/credentials', '_blank', 'noopener,noreferrer');
});
document.getElementById('wizardStep4Next')?.addEventListener('click', function() {
  const key = wizardApiKey.value.trim();
  if (!key || key.length < 20) {
    wizardApiStatus.textContent = '⚠ API Key chưa được nhập đầy đủ.';
    return;
  }
  accountWizardData.apiKey = key;
  wizardApiStatus.textContent = '✓ Đã nhận API Key. Key này sẽ được lưu riêng cho ' + accountWizardData.googleAccount + '.';
  wizardShowStep(5);
});

document.getElementById('wizardCheckFolderBtn')?.addEventListener('click', async function() {
  const label = wizardAccountLabelInput.value.trim();
  const folder = wizardFolderLink.value.trim();
  if (!label) {
    wizardFolderStatus.textContent = '⚠ Hãy nhập tên hiển thị cho account.';
    return;
  }
  if (!folder) {
    wizardFolderStatus.textContent = '⚠ Hãy nhập link folder Google Drive.';
    return;
  }
  wizardFolderStatus.textContent = '⏳ Đang kiểm tra folder...';
  wizardStep5Next.disabled = true;

  try {
    // Dùng đúng hàm quét folder hiện có trong app.
    // Không lưu account cho tới khi kiểm tra thành công.
    const result = await fetchFolderVideos(accountWizardData.apiKey, folder);
    const count = Array.isArray(result) ? result.length : (result?.videos?.length || 0);
    accountWizardData.label = label;
    accountWizardData.folderLink = folder;
    accountWizardData.folderOk = true;
    accountWizardData.videoCount = count;
    wizardFolderStatus.textContent = '✓ OK — tìm thấy ' + count + ' video trong folder.';
    wizardStep5Next.disabled = false;
  } catch (err) {
    wizardFolderStatus.textContent = '✗ Không quét được folder: ' + (err?.message || String(err));
  }
});

document.getElementById('wizardStep5Next')?.addEventListener('click', function() {
  if (!accountWizardData.folderOk) return;
  wizardSummary.innerHTML =
    '<div><b>Google Account:</b> ' + escapeHtml(accountWizardData.googleAccount) + '</div>' +
    '<div><b>Tên:</b> ' + escapeHtml(accountWizardData.label) + '</div>' +
    '<div><b>API Key:</b> ' + escapeHtml(accountWizardData.apiKey.slice(0,8)) + '••••••••</div>' +
    '<div><b>Folder:</b> ' + escapeHtml(accountWizardData.folderLink) + '</div>' +
    '<div><b>Video tìm thấy:</b> ' + accountWizardData.videoCount + '</div>';
  wizardShowStep(6);
});

document.getElementById('wizardFinishBtn')?.addEventListener('click', function() {
  accountDraftRows.push({
    label: accountWizardData.label,
    googleAccount: accountWizardData.googleAccount,
    apiKey: accountWizardData.apiKey,
    folderLink: accountWizardData.folderLink
  });
  renderAccountRows();
  closeAccountWizard();
  if (typeof settingsStatus !== 'undefined' && settingsStatus) {
    settingsStatus.textContent = '✓ Đã thêm ' + accountWizardData.googleAccount + '. Bấm Lưu cấu hình để áp dụng.';
  }
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, function(ch) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);
  });
}

function renderAccountRows() {
  accountsListEl.innerHTML = '';
  accountDraftRows.forEach(function (row, idx) {
    const div = document.createElement('div');
    div.className = 'account-row';

    const labelWrap = document.createElement('label');
    labelWrap.className = 'account-label-wrap';
    labelWrap.textContent = 'Tài khoản ' + (idx + 1);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.placeholder = 'Tên gợi nhớ (vd. minhvukgh1979)';
    labelInput.value = row.label || '';
    labelInput.setAttribute('tabindex', '0');
    labelInput.addEventListener('input', function () { row.label = labelInput.value; });

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Google Drive API Key (AIzaSy...)';
    keyInput.value = row.apiKey || '';
    keyInput.setAttribute('tabindex', '0');
    keyInput.addEventListener('input', function () { row.apiKey = keyInput.value; });

    const folderInput = document.createElement('input');
    folderInput.type = 'text';
    folderInput.placeholder = 'Link folder Google Drive (https://drive.google.com/drive/folders/...)';
    folderInput.value = row.folderLink || '';
    folderInput.setAttribute('tabindex', '0');
    folderInput.addEventListener('input', function () { row.folderLink = folderInput.value; });

    // ---- Kiểm tra ngay tại chỗ: bấm là biết luôn folder có quét
    // được video không, không cần Lưu rồi thử lại từ đầu. ----
    const checkRow = document.createElement('div');
    checkRow.className = 'account-check-row';

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn account-check-btn';
    checkBtn.textContent = '🔍 Kiểm tra folder này';
    checkBtn.setAttribute('tabindex', '0');

    const checkStatus = document.createElement('span');
    checkStatus.className = 'account-check-status';

    checkBtn.addEventListener('click', async function () {
      const apiKey = (row.apiKey || '').trim();
      const folderLink = (row.folderLink || '').trim();
      if (!apiKey || !folderLink) {
        checkStatus.textContent = 'Cần nhập đủ API Key và link folder trước đã.';
        checkStatus.className = 'account-check-status err';
        return;
      }
      checkBtn.disabled = true;
      checkStatus.textContent = 'Đang kiểm tra...';
      checkStatus.className = 'account-check-status';
      try {
        const folderId = extractFolderId(folderLink);
        const files = await listFolderFiles(apiKey, folderId);
        const videoCount = files.filter(isVideoFile).length;
        if (videoCount > 0) {
          checkStatus.textContent = '✓ OK - tìm thấy ' + videoCount + ' video.';
          checkStatus.className = 'account-check-status ok';
        } else {
          checkStatus.textContent = '⚠ Kết nối được, nhưng folder chưa có video nào.';
          checkStatus.className = 'account-check-status warn';
        }
      } catch (err) {
        checkStatus.textContent = '✗ Lỗi: ' + err.message;
        checkStatus.className = 'account-check-status err';
      } finally {
        checkBtn.disabled = false;
      }
    });

    checkRow.appendChild(checkBtn);
    checkRow.appendChild(checkStatus);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn account-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Xoá tài khoản này';
    removeBtn.setAttribute('tabindex', '0');
    removeBtn.addEventListener('click', function () {
      accountDraftRows.splice(idx, 1);
      if (accountDraftRows.length === 0) accountDraftRows.push({ label: '', apiKey: '', folderLink: '' });
      renderAccountRows();
    });

    div.appendChild(labelWrap);
    div.appendChild(labelInput);
    div.appendChild(keyInput);
    div.appendChild(folderInput);
    div.appendChild(checkRow);
    div.appendChild(removeBtn);
    accountsListEl.appendChild(div);
  });
}

function openSettings() {
  const accounts = getAccounts();
  accountDraftRows = accounts.length > 0
    ? accounts.map(function (a) { return { label: a.label || '', apiKey: a.apiKey || '', folderLink: a.folderLink || '' }; })
    : [{ label: '', apiKey: '', folderLink: '' }];
  renderAccountRows();
  settingsError.textContent = '';
  settingsScreen.classList.remove('hidden');
  const firstInput = accountsListEl.querySelector('input');
  if (firstInput) firstInput.focus();
}

function closeSettings() {
  settingsScreen.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', function () {
  if (isConfigured()) closeSettings();
});

if (addAccountBtn) {
  addAccountBtn.addEventListener('click', function () {
    // Tự điền sẵn API Key của dòng cuối cùng (thường dùng chung được
    // cho mọi tài khoản, vì key gắn với 1 project Google Cloud chứ
    // không gắn với tài khoản Drive nào) - đỡ phải gõ lại mỗi lần thêm.
    const lastRow = accountDraftRows[accountDraftRows.length - 1];
    const reuseApiKey = lastRow ? (lastRow.apiKey || '') : '';
    accountDraftRows.push({ label: '', apiKey: reuseApiKey, folderLink: '' });
    renderAccountRows();
    const rows = accountsListEl.querySelectorAll('.account-row');
    const lastRowEl = rows[rows.length - 1];
    const inputs = lastRowEl ? lastRowEl.querySelectorAll('input') : [];
    // Focus vào ô "Tên gợi nhớ" (ô đầu tiên) của dòng mới, vì API Key
    // đã tự điền sẵn rồi - chỉ cần gõ tên + dán link folder.
    if (inputs[0]) inputs[0].focus();
  });
}

saveBtn.addEventListener('click', function () {
  const cleaned = accountDraftRows.map(function (r) {
    return { label: (r.label || '').trim(), apiKey: (r.apiKey || '').trim(), folderLink: (r.folderLink || '').trim() };
  });
  // Bỏ các dòng hoàn toàn trống (không đụng tới), chỉ giữ dòng có ít
  // nhất API Key hoặc link folder đã điền.
  const nonEmpty = cleaned.filter(function (r) { return r.apiKey || r.folderLink; });
  const valid = nonEmpty.filter(function (r) { return r.apiKey && r.folderLink; });

  if (valid.length === 0) {
    settingsError.textContent = 'Vui lòng nhập đủ API Key và link folder Google Drive cho ít nhất 1 tài khoản.';
    return;
  }

  saveAccounts(valid);
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
  const meta = getMeta(video.key);
  const progress = getProgress(video.key);
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
    card.dataset.key = video.key;

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

    if (video.sources.some(function (s) { return s.subtitleFileId; })) {
      const ccBadge = document.createElement('span');
      ccBadge.className = 'badge badge-cc';
      ccBadge.textContent = 'CC';
      thumbWrap.appendChild(ccBadge);
    }
    if (video.sources.length > 1) {
      const multiBadge = document.createElement('span');
      multiBadge.className = 'badge badge-multi';
      multiBadge.textContent = video.sources.length + ' nguồn';
      multiBadge.title = 'Có ở ' + video.sources.length + ' tài khoản: ' +
        video.sources.map(function (s) { return s.accountLabel; }).join(', ');
      thumbWrap.appendChild(multiBadge);
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
      setMeta(video.key, { favorite: !video.favorite });
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
      setMeta(video.key, { hidden: !video.hidden });
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
  const accounts = getAccounts();
  statusMsg.textContent = 'Đang quét folder Google Drive (' + accounts.length + ' tài khoản)...';
  videoGrid.innerHTML = '';

  try {
    allVideos = await fetchFolderVideos(accounts);
    searchInput.value = '';
    applyFilters();
    const partialErrors = allVideos._partialErrors || [];
    if (partialErrors.length > 0) {
      // Vẫn quét được ít nhất 1 tài khoản, nhưng có tài khoản khác lỗi -
      // hiện thêm cảnh báo nhẹ phía sau số liệu video, không chặn xem.
      statusMsg.textContent += ' (Lỗi ở ' + partialErrors.length + ' tài khoản: ' + partialErrors.join(' | ') + ')';
    }
    const firstCard = videoGrid.querySelector('.card');
    if (firstCard) firstCard.focus();
  } catch (err) {
    statusMsg.textContent = 'Lỗi quét folder: ' + err.message;
  }
}

// ---------------- Edit modal ----------------

function openEditModal(video) {
  editingKey = video.key;
  editTitleInput.value = video.title;
  editModal.classList.remove('hidden');
  editTitleInput.focus();
}

function closeEditModal() {
  editModal.classList.add('hidden');
  editingKey = null;
}

editSaveBtn.addEventListener('click', function () {
  if (!editingKey) return;
  const val = editTitleInput.value.trim();
  setMeta(editingKey, { title: val || null });
  closeEditModal();
  applyFilters();
});

editResetBtn.addEventListener('click', function () {
  if (!editingKey) return;
  setMeta(editingKey, { title: null });
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

// Thử phát lần lượt từng "nguồn" (mỗi nguồn = 1 tài khoản) của 1 phim,
// bắt đầu từ startIndex. Nguồn nào bị lỗi (403 hết quota/quyền, 404...)
// sẽ tự động thử nguồn kế tiếp, không cần người xem bấm gì. Trả về
// true nếu tìm được 1 nguồn phát được, false nếu tất cả đều lỗi.
async function tryLoadSource(video, startIndex) {
  for (let i = startIndex; i < video.sources.length; i++) {
    const source = video.sources[i];
    const vidUrl = streamUrl(source.fileId, source.apiKey);

    if (video.sources.length > 1) {
      statusForPlayerLoading(source, i, video.sources.length);
    }

    const check = await checkPlayableUrl(vidUrl);
    if (!check.ok) continue; // thử nguồn kế tiếp

    currentSourceIndex = i;
    hidePlayerError();
    videoPlayer.src = vidUrl;

    const saved = getProgress(video.key);
    if (saved && saved.time > 5 && saved.duration && saved.time < saved.duration - 5) {
      videoPlayer.currentTime = saved.time;
    }

    videoPlayer.play().catch(function () { /* có thể bị chặn autoplay */ });
    updatePlayPauseIcon();

    if (source.subtitleFileId) {
      try {
        const url = await buildSubtitleUrl(source);
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
    return true;
  }
  return false;
}

function statusForPlayerLoading(source, index, total) {
  if (index === 0) return; // lần thử đầu tiên không cần báo gì
  showPlayerError('Tài khoản trước bị giới hạn - đang thử phát từ "' + source.accountLabel + '" (' + (index + 1) + '/' + total + ')...');
}

async function openPlayer(rawVideo) {
  const video = decorate(rawVideo);
  currentVideo = video;
  currentSourceIndex = -1;
  clearSubtitle();
  hidePlayerError();

  playerTitle.textContent = video.title;
  videoPlayer.playbackRate = SPEEDS[speedIndex];
  speedBtn.textContent = SPEEDS[speedIndex] + 'x';
  showScreen('player');
  showControls();

  const played = await tryLoadSource(video, 0);
  if (!played) {
    const lastSource = video.sources[video.sources.length - 1];
    const single = video.sources.length === 1;
    hidePlayerError();
    const check = await checkPlayableUrl(streamUrl(lastSource.fileId, lastSource.apiKey));
    showPlayerError(
      (single ? '' : 'Đã thử ' + video.sources.length + ' tài khoản, tài khoản nào cũng lỗi. ') +
      describePlaybackError(check.status)
    );
  }
}

videoPlayer.addEventListener('error', function () {
  // Trường hợp preflight qua được nhưng thẻ <video> vẫn không phát nổi
  // giữa chừng (vd. quota bị tính sau khi đã stream 1 phần, codec lỗi,
  // mất kết nối...). Nếu phim này còn nguồn khác chưa thử, tự nhảy
  // sang nguồn kế tiếp thay vì báo lỗi luôn.
  if (!currentVideo) return;
  const nextIndex = currentSourceIndex + 1;
  if (nextIndex < currentVideo.sources.length) {
    tryLoadSource(currentVideo, nextIndex).then(function (ok) {
      if (!ok) showPlayerError('Không phát được video này. Định dạng có thể không được trình duyệt hỗ trợ, hoặc kết nối tới Google Drive bị gián đoạn.');
    });
  } else if (playerError && playerError.classList.contains('hidden')) {
    showPlayerError('Không phát được video này. Định dạng có thể không được trình duyệt hỗ trợ, hoặc kết nối tới Google Drive bị gián đoạn.');
  }
});

function saveCurrentProgress() {
  if (!currentVideo || !videoPlayer.duration) return;
  if (videoPlayer.currentTime < 3 || videoPlayer.currentTime > videoPlayer.duration - 2) {
    setProgress(currentVideo.key, null);
  } else {
    setProgress(currentVideo.key, { time: videoPlayer.currentTime, duration: videoPlayer.duration });
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
  if (currentVideo) setProgress(currentVideo.key, { time: videoPlayer.duration, duration: videoPlayer.duration });
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
