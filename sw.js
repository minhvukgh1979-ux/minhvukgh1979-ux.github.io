// ============================================================
// Service Worker: chèn header Authorization (Bearer token) vào
// các request tải video từ Google Drive API (alt=media), để
// dùng OAuth token thay cho API key -> tránh "download quota
// exceeded" áp dụng cho truy cập ẩn danh qua link công khai.
// ============================================================

let accessToken = null;

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SET_TOKEN') {
    accessToken = event.data.token || null;
  }
});

function isDriveMediaRequest(url) {
  return url.indexOf('googleapis.com/drive/v3/files/') !== -1 &&
         url.indexOf('alt=media') !== -1;
}

self.addEventListener('fetch', function (event) {
  const url = event.request.url;

  if (accessToken && isDriveMediaRequest(url)) {
    const headers = new Headers(event.request.headers);
    headers.set('Authorization', 'Bearer ' + accessToken);

    const authedRequest = new Request(url, {
      method: event.request.method,
      headers: headers,
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow'
    });

    event.respondWith(fetch(authedRequest));
  }
  // Các request khác: để trình duyệt xử lý bình thường (không can thiệp)
});
