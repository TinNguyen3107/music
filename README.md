# MELODIK

Ứng dụng nghe nhạc độc lập, lấy cảm hứng từ video tham chiếu trong thư mục dự án. Giao diện tiếng Việt, màu kem/hồng/tím, máy phát nhạc vinyl và thư viện ảnh kiểu scrapbook.

## Chạy dự án

Yêu cầu Node.js **22.13 trở lên** (dùng SQLite tích hợp).

```sh
npm --prefix app install
npm run dev
```

- Website: http://localhost:3000
- Quản trị: http://localhost:3000/admin
- API: http://127.0.0.1:4000/api/health

Ở local/demo có sẵn hai tài khoản để kiểm tra: `admin@gmail.com` / `admin123` cho quản trị và `user@gmail.com` / `user123` cho thành viên. Chúng chỉ được tạo trong SQLite local, không được tạo khi triển khai Vercel. Hãy đổi hoặc xoá chúng trước khi mở demo cho người khác. Tài khoản mới cần mật khẩu ít nhất 6 ký tự. Mật khẩu lưu dưới dạng scrypt hash, phiên đăng nhập dùng cookie HttpOnly.

## Chức năng

- Phát/dừng, tua, chuyển bài, tự chuyển khi hết bài, ngẫu nhiên, lặp lại bài, âm lượng, tắt tiếng, phím Space.
- Nhạc tiếp tục khi điều hướng nội bộ. Tải lại trang dừng nhạc để tôn trọng chính sách phát tự động của trình duyệt.
- Playlist theo tâm trạng, tìm kiếm trong playlist, yêu thích trên thiết bị hiện tại.
- Kỷ niệm: lọc theo nhóm, mở ảnh và câu chuyện chi tiết.
- Sổ lưu bút: gửi lời nhắn riêng, quản trị viên xem và xóa. Không gửi email tự động.
- Quản trị: thêm/sửa/xóa bài hát, playlist và kỷ niệm; tải âm thanh và ảnh bìa thật. Muốn xóa playlist cần chuyển hoặc xóa các bài bên trong trước.
- Thành viên: đăng ký/đăng nhập, đăng bài nhạc và ảnh của mình, xem chúng ở Góc cộng đồng và scrapbook; tìm bạn bằng email, gửi/nhận lời mời và chat riêng sau khi hai bên chấp nhận kết bạn.
- Các luồng có trạng thái tải, lỗi, trống, thành công và xác nhận xóa; dialog hỗ trợ bàn phím; bố cục responsive.

Theo yêu cầu tinh giản, chưa làm newsletter, timeline, blog quảng bá hoặc tích hợp mạng xã hội.

## Nhạc và hình ảnh

12 đoạn nhạc nghe thử dài 36–44 giây được tổng hợp bằng mã trong `app/server/seed.mjs`, không tải âm nhạc hay gọi YouTube/Spotify. Đây là đoạn mẫu kiểm thử, không phải thư viện bài hát hoàn chỉnh. Admin có thể xóa hoặc thay file bất kỳ.

Âm thanh tải lên: MP3, WAV, OGG, FLAC, M4A, tối đa 50 MB/file; khả năng giải mã phụ thuộc codec/trình duyệt. Ảnh: JPG, PNG, WebP, tối đa 8 MB/file. Admin chỉ nên đăng nội dung có quyền sử dụng; tự tải file không tự động làm mất nghĩa vụ về bản quyền.

Để giao diện không vỡ, dữ liệu bài hát luôn có bìa mặc định, tiêu đề, nghệ sĩ, thời lượng được kiểm tra và player báo lỗi thay vì làm hỏng trang nếu trình duyệt không phát được file. Tuy vậy, ứng dụng hiện **không chuyển mã** audio/video: Vercel Function không phù hợp để chạy FFmpeg nặng và không nên cố chuyển đổi trong lúc người dùng chờ upload. Chuẩn phát hành nên là MP3 (audio/mpeg) hoặc M4A/AAC; những file lạ/không được hỗ trợ sẽ bị chặn hoặc báo lỗi rõ ràng.

Khi cần hỗ trợ video hay tự động chuẩn hóa mọi file, bước tiếp theo là thêm hàng đợi media riêng: Blob nhận file gốc → worker FFmpeg/Cloudinary/Mux chuyển thành MP3/AAC hoặc HLS → database chỉ công bố URL bản đã xử lý. Hệ thống hiện đã tách Blob và database, nên có thể gắn worker này mà không đổi giao diện hay làm mất dữ liệu. Không tự ý tích hợp dịch vụ chuyển mã khi chưa có tài khoản, ngân sách và chính sách bản quyền của khách hàng.

Ảnh minh họa và artwork được trích từ **video do người dùng cung cấp**, không tải từ thư viện ảnh bên ngoài. Nguồn và vùng trích nằm trong `tools/extract_assets.py`. Có thể thay bằng ảnh gốc của khách hàng từ trang quản trị trước khi phát hành. Logo là chữ hiển thị bằng font. Font Quicksand/Nunito và icon Phosphor được đóng gói cục bộ, không cần kết nối dịch vụ font bên ngoài.

## Kiến trúc production trên Vercel

Khi triển khai, ứng dụng tự chuyển sang kiến trúc phù hợp với serverless:

| Phần | Local demo | Vercel production / preview |
| --- | --- | --- |
| Giao diện | Vite + Express | Vite static (`dist/client`) |
| API | Express tại `127.0.0.1:4000` | Vercel Function `app/api/index.mjs` |
| Dữ liệu nghiệp vụ | SQLite trong `app/data/` | PostgreSQL serverless (khuyến nghị Neon) |
| Nhạc, ảnh do admin tải | `app/data/uploads/` | Vercel Blob, tải thẳng từ trình duyệt |

Nhạc và ảnh **không đi qua Function** ở môi trường Vercel. Token tải chỉ được phát hành sau khi admin đã đăng nhập; Blob giới hạn đúng loại MIME, kích cỡ, đường dẫn ngẫu nhiên; server kiểm tra lại metadata Blob trước khi ghi URL vào database. Điều này vừa tránh giới hạn kích cỡ request của serverless vừa không phụ thuộc ổ đĩa tạm của Vercel.

### Chuẩn bị một lần

1. Đẩy source code lên GitHub/GitLab/Bitbucket và tạo một Project Vercel với **Root Directory: `app`**.
2. Tạo một Neon PostgreSQL database, hoặc một branch/database riêng cho từng môi trường `Production` và `Preview`. Đặt `DATABASE_URL` tương ứng tại Vercel Project Settings.
3. Trong Vercel, tạo và kết nối một Blob store với project. Vercel sẽ cấp quyền truy cập Blob; nếu tổ chức của bạn không dùng OIDC, thêm `BLOB_READ_WRITE_TOKEN` do Vercel Blob cung cấp.
4. Tạo một chuỗi ngẫu nhiên dài cho `ADMIN_BOOTSTRAP_TOKEN`, và đặt `APP_ORIGIN` bằng URL production thực tế, ví dụ `https://music.example.com`. Preview tự nhận URL preview do Vercel cấp; vẫn nên dùng database/Blob riêng để không thử nghiệm trên dữ liệu thật. Không đưa các giá trị này vào Git.
5. Từ máy có `DATABASE_URL` của đúng môi trường, chạy migration một lần trước khi mở website:

```sh
npm --prefix app install
npm run migrate
```

6. Deploy. Lần đầu vào `/admin`, nhập email, mật khẩu và **mã thiết lập** (`ADMIN_BOOTSTRAP_TOKEN`). Sau khi có admin, mã đó không còn tạo thêm tài khoản được; nên đổi hoặc xoá biến này sau khi thiết lập xong.

Vercel tự build bằng `npm run build`; `app/vercel.json` đưa các route `/api/*` về Function và các route giao diện về ứng dụng React. Không cần chạy `npm start` trên Vercel. Chưa có dữ liệu cloud nào được tạo hay deploy trong repository này — các bước trên yêu cầu tài khoản Vercel/Neon của bạn.

### Dữ liệu, backup và chuyển dữ liệu

- Source không bao giờ chứa database, nhạc, ảnh hay bí mật. `.env*`, `app/data/` và `.vercel/` đều đã được bỏ qua trong Git; xem mẫu biến ở [`app/.env.example`](app/.env.example).
- Lưu backup PostgreSQL định kỳ (Neon có lịch sử/backup theo gói) và dùng khả năng liệt kê/export của Blob để sao lưu file. Một bản backup chỉ database sẽ không phục hồi file nhạc/ảnh.
- Bản local hiện hữu vẫn giữ nguyên tại `app/data/`; trước khi xuất bản thật, hãy chép các audio/ảnh có quyền sử dụng sang Blob và tạo lại/sửa các mục từ admin. Cách này tránh tự động đẩy nội dung chưa kiểm tra bản quyền lên cloud.
- Xoá nội dung chỉ gỡ bản ghi khỏi thư viện. Blob/file gốc được giữ để tránh mất dữ liệu ngoài ý muốn; hãy dọn các file mồ côi sau khi đã có backup.

### Vận hành local

- Frontend: React + Vite; backend: Express; dữ liệu: SQLite.
- Dữ liệu bền vững local nằm ở `app/data/melodik.sqlite`; file ở `app/data/uploads/`. Sao lưu toàn bộ `app/data/` khi server đã dừng.
- Đổi thư mục dữ liệu local bằng biến `DATA_DIR` (đường dẫn tuyệt đối). API mặc định nghe tại `127.0.0.1:4000`; `PORT` và `HOST` có thể cấu hình.

Chạy bản build:

```sh
npm run build
npm start
```

Sau đó mở http://127.0.0.1:4000. Express phục vụ cả frontend, API và file nhạc có hỗ trợ HTTP Range để tua bài.

Các tệp Worker/Sites đi kèm starter chỉ dành cho prototype frontend; production của dự án này dùng Vercel Function + PostgreSQL + Blob như trên. Dự án chưa được đưa lên Internet.

## Kiểm tra

```sh
npm test
npm run build
```

Kiểm thử API dùng database riêng trong thư mục tạm: quyền truy cập, setup/login/logout, xác minh loại file, upload, stream Range, sửa/xóa nội dung, lời nhắn riêng và dữ liệu sau khi mở lại database. Không tạo tài khoản hay ghi dữ liệu kiểm thử vào thư viện đang chạy.

Mã ứng dụng ở `app/src/`, máy chủ ở `app/server/`; `reference/` chứa các khung hình phục vụ đối chiếu và không được đưa vào website.
