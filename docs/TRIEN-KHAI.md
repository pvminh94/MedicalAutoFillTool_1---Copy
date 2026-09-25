# Triển khai — QLBS

Tài liệu này hướng dẫn đưa hệ thống lên máy chủ thật (VPS/ máy chủ bệnh viện) bằng
Docker Compose, cách sao lưu và nâng cấp.

## 1. Yêu cầu

| Thành phần | Tối thiểu | Khuyến nghị |
|---|---|---|
| Máy chủ | 2 vCPU, 4 GB RAM, 40 GB đĩa | 4 vCPU, 8 GB RAM, SSD 100 GB |
| Hệ điều hành | Linux x86_64 (Ubuntu 22.04/24.04) | Ubuntu 24.04 LTS |
| Phần mềm | Docker Engine 24+, Docker Compose v2 | bản mới nhất |
| Mạng | Cổng 80/443 mở nếu dùng tên miền và HTTPS | chứng chỉ Let's Encrypt |

## 2. Cài đặt

```bash
# 1) Lấy mã nguồn
git clone <địa-chỉ-kho> /opt/qlbs && cd /opt/qlbs

# 2) Tạo tệp cấu hình và ĐỔI MẬT KHẨU
cp .env.example .env
nano .env      # POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_PASSWORD

# 3) Dựng và chạy (lần đầu sẽ biên dịch, mất vài phút)
docker compose up -d --build

# 4) Theo dõi
docker compose ps
docker compose logs -f api
```

Khi container `api` khởi động, nó tự chạy **migration + dữ liệu nền** (idempotent —
chạy lại nhiều lần vẫn an toàn) rồi mới mở cổng 4000.

| Dịch vụ | Địa chỉ mặc định | Ghi chú |
|---|---|---|
| Giao diện | `http://<máy-chủ>:3000` | đổi cổng bằng `WEB_PORT` trong `.env` |
| API | `http://<máy-chủ>:4000/api` | đổi cổng bằng `API_PORT` |
| Swagger | `http://<máy-chủ>:4000/api/docs` | tắt bằng `SWAGGER_ENABLED=false` khi chạy thật |
| PostgreSQL | trong mạng `qlbs-network` | **không** mở ra ngoài |
| Redis | trong mạng `qlbs-network` | **không** mở ra ngoài |

Đăng nhập lần đầu bằng tài khoản trong `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

## 3. Dùng sau proxy và tên miền (HTTPS)

Ví dụ Nginx đặt trước hệ thống:

```nginx
server {
  listen 443 ssl http2;
  server_name qlbs.benhvien.vn;

  ssl_certificate     /etc/letsencrypt/live/qlbs.benhvien.vn/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/qlbs.benhvien.vn/privkey.pem;

  client_max_body_size 50m;          # cho phép tải tệp đính kèm

  location / {
    proxy_pass http://127.0.0.1:3000;      # web (Next.js tự chuyển tiếp /api sang api)
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Sau khi có tên miền, cập nhật `CORS_ORIGINS` trong `.env` (ví dụ
`CORS_ORIGINS=https://qlbs.benhvien.vn`) rồi `docker compose up -d`.

> Giao diện gọi API qua đường dẫn tương đối `/api/...` nên **không cần** cấu hình
> địa chỉ API trong mã nguồn frontend; Next.js chuyển tiếp sang container `api`.

## 4. Sao lưu & phục hồi

**Sao lưu CSDL**

```bash
docker compose exec -T postgres pg_dump -U qlbs -d qlbs -Fc > backup-$(date +%F).dump
```

**Phục hồi**

```bash
docker compose exec -T postgres pg_restore -U qlbs -d qlbs --clean --if-exists < backup-2026-09-25.dump
```

**Sao lưu tệp tải lên** — thư mục `UPLOAD_HOST_DIR` (mặc định `./data/uploads`).

Hệ thống cũng có sẵn tiện ích **Sao lưu** trong *Quản trị → Cấu hình* (quyền
`backup.create`, `backup.restore`) để tạo và khôi phục bản sao lưu ngay trên giao diện.

Nên đặt lịch sao lưu tự động (ví dụ cron hằng ngày 0h) và giữ tối thiểu 7 bản gần nhất.

## 5. Nâng cấp phiên bản

```bash
cd /opt/qlbs
git pull
docker compose build
docker compose up -d          # api tự chạy migration khi khởi động
docker compose logs -f api    # theo dõi tới khi thấy "Nest application successfully started"
```

Trước khi nâng cấp nên sao lưu CSDL. Nếu bản mới có thay đổi cấu trúc, migration sẽ tự
áp dụng; trường hợp cần quay lại phiên bản cũ: `git checkout <tag>` rồi
`docker compose up -d --build` và phục hồi bản sao lưu tương ứng.

## 6. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `api` khởi động rồi thoát, log báo lỗi CSDL | kiểm tra `POSTGRES_PASSWORD` trong `.env` khớp với dịch vụ `postgres`; `docker compose logs postgres` |
| Giao diện báo "Không kết nối được máy chủ" | `docker compose ps` xem `api` còn chạy không; kiểm tra `API_PROXY_TARGET` của dịch vụ `web` |
| Đăng nhập báo sai tài khoản | tài khoản quản trị chỉ được tạo ở lần chạy `db:seed` đầu tiên; tạo lại bằng `docker compose exec api npx tsx scripts/create-admin.ts` |
| Bản in PDF thiếu dấu tiếng Việt | ảnh `api` đã cài `ttf-dejavu`; nếu thay font riêng, thêm tệp font vào `backend/assets/fonts` rồi dựng lại ảnh |
| Hết dung lượng đĩa | dọn `data/backups`, giảm `STORAGE_RETENTION_DAYS` (mặc định 30 ngày) |
| Tác vụ định kỳ không chạy | kiểm tra `QUEUE_DRIVER`/`QUEUE_AUTO_SCHEDULE`, xem *Quản trị → Tác vụ* và log `job_runs` |

## 7. Chạy thử nhanh khi chưa có Docker (môi trường phát triển)

```bash
cd backend
npm install
npm run dev:postgres     # PostgreSQL nhúng (PGlite) ở cổng 55432, dữ liệu trong .data/pgdata
# .env: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres
#       CACHE_DRIVER=memory  QUEUE_DRIVER=inline  QUEUE_AUTO_SCHEDULE=false
npm run db:migrate && npm run db:seed
npm run dev              # API ở cổng 4000
```

Cửa sổ khác:

```bash
cd frontend && npm install && npm run dev    # giao diện ở cổng 3000
```

Bộ dữ liệu mẫu để xem giao diện (chỉ dùng cho môi trường thử):

```bash
cd backend && npm run db:demo      # tạo người dùng theo vai trò + phiếu ở mọi trạng thái + số liệu báo cáo
```
