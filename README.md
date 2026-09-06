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

Mở file `app.js`, sửa mảng `DEFAULT_ACCOUNTS` ở đầu file:

```js
const DEFAULT_ACCOUNTS = [
  {
    label: 'minhvukgh1979',
    apiKey: 'AIzaSy...',        // key ở Bước 2
    folderLink: 'https://drive.google.com/drive/folders/XXXX' // link ở Bước 1
  }
];
```

Lưu lại, đưa 3 file (`index.html`, `style.css`, `app.js`) lên GitHub
Pages (hoặc bất kỳ hosting tĩnh nào). Xong — từ giờ mở trang lên là có
video ngay, không cần nhập gì cả.

> Nếu không muốn sửa `app.js`, có thể để `DEFAULT_ACCOUNTS = []` — trang
> sẽ hỏi bạn nhập tài khoản ngay lần mở đầu tiên (qua màn hình Cấu
> hình), sau đó tự nhớ (lưu trong trình duyệt), không hỏi lại nữa. Bấm
> phím **M** bất cứ lúc nào để mở lại màn hình Cấu hình.

## Dùng nhiều tài khoản Google Drive (để tránh giới hạn/quota)

Nếu bạn upload CÙNG một bộ phim (cùng tên file) lên 2 (hoặc nhiều)
tài khoản Google Drive khác nhau, web có thể tự quét cả 2 rồi gộp lại
thành 1 danh sách — khi 1 tài khoản bị Google giới hạn (quota tải
xuống), web tự động chuyển sang phát bản ở tài khoản kia, không cần
bạn làm gì thêm.

**Lưu ý quan trọng:** để tính năng dự phòng có tác dụng, tài khoản thứ
2 cần một **folder THẬT SỰ khác** (chứa 1 bản copy phim, tốt nhất là
thuộc chính Drive của tài khoản đó) — không phải cùng 1 folder ID với
tài khoản 1. Nếu 2 "tài khoản" trỏ vào đúng 1 folder thì gộp lại cũng
không giúp tránh giới hạn, vì Google tính quota theo từng FILE cụ thể.

Các bước thêm tài khoản thứ 2 (ví dụ `minhvukgh1977`):

1. Đăng nhập Google Drive bằng tài khoản `minhvukgh1977`, tạo 1 folder
   mới, rồi upload vào đó các video (khuyến khích trùng tên file với
   bản ở tài khoản 1, để web nhận ra là cùng 1 phim và gộp lại).
2. Chia sẻ folder này giống Bước 1 ở trên: chuột phải → Chia sẻ →
   "Bất kỳ ai có đường liên kết" → quyền "Người xem". Copy link folder.
3. API Key ở Bước 2 dùng chung được cho mọi tài khoản (vì API Key là
   của 1 project Google Cloud, không gắn với tài khoản Drive nào) —
   không bắt buộc phải tạo Key riêng, dùng lại Key cũ cũng được.
4. Mở web → bấm **⚙️ (Cấu hình)** hoặc phím **M** → bấm **"+ Thêm tài
   khoản"** → điền tên gợi nhớ (vd. `minhvukgh1977`), API Key (bước 3),
   và link folder (bước 2) → **Lưu cấu hình**.
5. Web tự quét lại cả 2 tài khoản. Phim nào trùng tên sẽ hiện 1 thẻ
   duy nhất kèm nhãn "2 nguồn" — khi phát mà tài khoản đầu bị lỗi/giới
   hạn, web tự thử tài khoản còn lại.

Có thể thêm nhiều hơn 2 tài khoản theo cách tương tự nếu cần.

## Từ giờ về sau

Mỗi lần bạn thêm video mới vào đúng folder đó (bằng bất kỳ cách nào),
chỉ cần mở lại trang hoặc bấm **"↻ Tải lại danh sách"** là thấy ngay —
không cần đụng gì đến code hay GitHub nữa.

## Vì sao vẫn cần API Key?

Google bắt buộc mọi truy vấn vào Drive API phải xác thực bằng API Key
hoặc đăng nhập (OAuth). API Key là lựa chọn nhẹ nhất — tạo 1 lần, không
hết hạn, người xem không cần đăng nhập gì cả.

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
