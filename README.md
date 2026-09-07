# Dethi Drive TV — bản Quét Folder (đơn giản hơn)

Không cần file JSON, không cần extension chỉnh sửa Drive nữa. Web sẽ tự
quét 1 folder Google Drive mỗi lần mở lên và hiện sẵn mọi video trong đó.

## Cách hoạt động

- Bạn upload video (và phụ đề .srt nếu có) trực tiếp vào 1 folder trên
  Google Drive, bằng bất kỳ cách nào (kéo-thả, app Drive, extension cũ...).
- Mở trang web → web tự liệt kê toàn bộ video trong folder đó → bấm chọn
  là xem.
- Nếu có file `.srt` cùng tên với video (ví dụ `Bai1.mp4` + `Bai1.srt`),
  phụ đề sẽ tự động gắn vào khi phát.

## Thiết lập (chỉ làm 1 lần)

### Bước 1 — Chuẩn bị folder Drive

1. Tạo (hoặc dùng) 1 folder trên Google Drive để chứa toàn bộ video.
2. Bấm chuột phải → **Chia sẻ** → **Chia sẻ** → đổi thành
   **"Bất kỳ ai có đường liên kết"** và quyền **"Người xem"**
   (không cần "Người chỉnh sửa" — quyền xem là đủ và an toàn hơn).
3. Copy link folder, dạng:
   `https://drive.google.com/drive/folders/XXXXXXXXXXXXXXXXXXXX`

### Bước 2 — Tạo Google API Key (một lần duy nhất, miễn phí)

1. Vào https://console.cloud.google.com/ → tạo 1 project mới (hoặc dùng
   project có sẵn).
2. Vào **APIs & Services → Library** → tìm **Google Drive API** → bấm
   **Enable**.
3. Vào **APIs & Services → Credentials** → **Create Credentials** →
   **API key**. Copy key vừa tạo (dạng `AIzaSy...`).
4. (Khuyến nghị) Bấm vào key vừa tạo → mục **API restrictions** → chọn
   **Restrict key** → tick **Google Drive API** → Save. Việc này giúp
   key chỉ dùng được cho Drive, an toàn hơn nếu lỡ lộ ra ngoài.

### Bước 3 — Điền cấu hình vào web

Mở file `app.js`, sửa 2 dòng đầu:

```js
const DEFAULT_API_KEY = 'AIzaSy...';           // key ở Bước 2
const DEFAULT_FOLDER_LINK = 'https://drive.google.com/drive/folders/XXXX'; // link ở Bước 1
```

Lưu lại, đưa 3 file (`index.html`, `style.css`, `app.js`) lên GitHub
Pages (hoặc bất kỳ hosting tĩnh nào). Xong — từ giờ mở trang lên là có
video ngay, không cần nhập gì cả.

> Nếu không muốn sửa `app.js` (ví dụ dùng chung code cho nhiều folder
> khác nhau), có thể để 2 dòng đó trống — trang sẽ hỏi bạn nhập API Key
> và link folder ngay lần mở đầu tiên, sau đó tự nhớ (lưu trong trình
> duyệt), không hỏi lại nữa. Bấm phím **M** bất cứ lúc nào để đổi lại.

## Từ giờ về sau

Mỗi lần bạn thêm video mới vào đúng folder đó (bằng bất kỳ cách nào),
chỉ cần mở lại trang hoặc bấm **"↻ Tải lại danh sách"** là thấy ngay —
không cần đụng gì đến code hay GitHub nữa.

## Vì sao vẫn cần API Key?

Google bắt buộc mọi truy vấn vào Drive API phải xác thực bằng API Key
hoặc đăng nhập (OAuth). API Key là lựa chọn nhẹ nhất — tạo 1 lần, không
hết hạn, người xem không cần đăng nhập gì cả.

## Thêm tài khoản Drive dự phòng (dùng khi 1 tài khoản bị lỗi quota)

Sửa file **`accounts.json`** ngay trong repo (bấm biểu tượng bút chì ✎
trên trang GitHub để sửa trực tiếp trên web, không cần cài gì) theo
mẫu:

```json
[
  { "apiKey": "AIzaSy...tài khoản 2...", "folderLink": "https://drive.google.com/drive/folders/...tài khoản 2..." }
]
```

Commit lại là xong — **mọi máy/TV mở trang đều tự thấy ngay** từ lần
tải trang kế tiếp, không cần sửa `app.js`, không cần cấu hình lại
từng máy. Có thể thêm nhiều tài khoản, mỗi tài khoản 1 dòng
`{ "apiKey": ..., "folderLink": ... }`, cách nhau bằng dấu phẩy.

(Ngoài ra, trong màn hình Cài đặt ⚙️ của web cũng có nút "+ Thêm tài
khoản dự phòng" — cách đó tiện để thử nhanh nhưng chỉ lưu riêng trên
máy/trình duyệt đang dùng, không chia sẻ sang máy khác như
`accounts.json`.)

## TV đời cũ không đăng nhập được Google?

Nếu TV chặn hẳn màn hình đăng nhập Google (lỗi "disallowed_useragent"),
xem thư mục `server/` — đó là một server nhỏ chạy tại nhà (Windows),
tự đăng nhập thay bạn bằng "service account", giúp TV xem video mà
không cần đăng nhập và không bao giờ dính lỗi "download quota
exceeded". Xem `server/README.md` để cài đặt.

## Giới hạn cần biết

- Folder phải để chia sẻ công khai dạng "Bất kỳ ai có link" thì API Key
  mới đọc được — Drive không cho quét folder riêng tư nếu không đăng
  nhập.
- Video rất lớn (vài GB) có thể phát chậm tùy tốc độ mạng, vì phát trực
  tiếp qua Google Drive.
- Phụ đề chỉ tự ghép khi tên file trùng phần đầu với video (khác đuôi
  mở rộng).

## Bản nâng cấp giao diện (mới)

Giao diện đã được làm lại đầy đủ hơn:

- **Trình phát tuỳ chỉnh**: thanh tua đi/lùi kéo được, nút lùi/tiến 10s,
  chỉnh âm lượng, tắt/bật tiếng, đổi tốc độ phát (0.5x → 2x), bật/tắt
  phụ đề, toàn màn hình. Có thể dùng chuột/chạm hoặc phím tắt:
  - Space / K: Phát - Tạm dừng
  - ← / J: Lùi 10 giây — → / L: Tiến 10 giây
  - ↑ / ↓: Tăng - giảm âm lượng
  - F: Toàn màn hình — M: Tắt/bật tiếng — C: Bật/tắt phụ đề
  - Esc / Backspace: Quay lại danh sách
- **Ghi nhớ vị trí xem**: xem dở video nào, lần sau mở lại tự phát
  tiếp đúng chỗ đó (lưu trong trình duyệt).
- **Quản lý video** (chỉ hiển thị trên trang này, không đổi gì trên
  Drive thật):
  - **Yêu thích**: đánh dấu video hay xem, lọc riêng ở tab "★ Yêu thích".
  - **Sửa tên hiển thị**: đổi tên hiện trên thẻ video mà không cần đổi
    tên file thật trên Drive.
  - **Ẩn video**: video không muốn hiện trong danh sách chính, chuyển
    qua tab "🙈 Đã ẩn", có thể khôi phục lại bất cứ lúc nào.
  - **Sắp xếp**: theo tên, mới thêm gần đây, hoặc yêu thích trước.
- Muốn xoá/tải video thật sự thì vẫn thao tác trực tiếp trên Google
  Drive (hoặc qua extension) — trang web chỉ đọc, không có quyền ghi.
