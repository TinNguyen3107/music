# MIUZIG

MIUZIG là website nghe nhạc và không gian cộng đồng nhỏ, xây dựng bằng React, Express và PostgreSQL. Người dùng có thể tạo tài khoản, kết bạn, trò chuyện và chia sẻ nhạc hoặc ảnh; quản trị viên quản lý nội dung và thành viên từ trang `/admin`.

## Công nghệ

- Frontend: React 19 + Vite
- API local: Express 5
- Dữ liệu local: SQLite (Node.js 22)
- Production: Vercel Function + Neon PostgreSQL + Vercel Blob

## Chạy local

Yêu cầu Node.js 22.13 trở lên.

```sh
npm --prefix app install
npm run dev
```

- Website: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`
- Health check: `http://127.0.0.1:4000/api/health`

Local demo tự tạo hai tài khoản thử nghiệm:

- Admin: `admin@gmail.com` / `admin123`
- Thành viên: `user@gmail.com` / `user123`

Các tài khoản này chỉ tồn tại trong SQLite local, không được tạo trên production. Mật khẩu production phải được tạo qua trang setup admin lần đầu hoặc đổi trong trang Hồ sơ admin.

## Chức năng

- Nghe nhạc, chuyển bài, tua, điều chỉnh âm lượng, yêu thích và phát ngẫu nhiên/lặp lại.
- Thư viện ảnh, playlist và nội dung do admin quản lý.
- Thành viên đăng ký/đăng nhập, tạo hồ sơ, đăng bài nhạc/ảnh, kết bạn và trò chuyện riêng.
- Góc nghe nhạc hiển thị nhạc cá nhân và nội dung bạn bè được chấp nhận.
- Trang admin quản lý thành viên, tin nhắn sổ lưu bút, hồ sơ và nội dung.
- Sổ lưu bút là form công khai: người gửi không bắt buộc có tài khoản và email nhập vào không được xác thực danh tính.

## Upload và dữ liệu

- Audio hỗ trợ: MP3, WAV, OGG, FLAC, M4A; tối đa 50 MB.
- Ảnh hỗ trợ: JPG, PNG, WebP; tối đa 8 MB.
- Local lưu dữ liệu tại `app/data/`.
- Production lưu dữ liệu quan hệ trong Neon và file tải lên trong Vercel Blob.

Không đưa `.env*`, `app/data/`, `.vercel/`, database hoặc token Blob vào Git.

## Deploy Vercel

Trong Vercel, đặt **Root Directory** là `app` và tạo các biến môi trường sau:

```text
DATABASE_URL=postgresql://...
APP_ORIGIN=https://your-domain.example
ADMIN_BOOTSTRAP_TOKEN=<one-time-random-token>
BLOB_READ_WRITE_TOKEN=<when OIDC Blob is unavailable>
```

Kết nối một Vercel Blob store với project. Mỗi lần build trên Vercel sẽ chạy migration trước rồi mới build frontend (`npm run migrate && npm run build`), vì vậy schema PostgreSQL được cập nhật cùng lần deploy.

Lần đầu truy cập `/admin`, tạo tài khoản quản trị bằng email, mật khẩu và `ADMIN_BOOTSTRAP_TOKEN`. Sau khi setup xong, hãy đổi hoặc xoá token bootstrap khỏi Vercel Environment Variables.

## Kiểm tra

```sh
npm test
npm run build
```

Test API dùng database tạm riêng và không ghi vào dữ liệu local hay production.

## Cấu trúc chính

```text
app/src/       # React UI
app/server/    # Express, database, migration và seed local
app/api/       # Vercel Function entry point
app/tests/     # API tests
```
