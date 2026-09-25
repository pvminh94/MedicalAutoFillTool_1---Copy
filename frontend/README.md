# QLBS — Giao diện (Next.js 15 + Tailwind CSS 4)

Giao diện tiếng Việt cho hệ thống Quản lý Bệnh viện QLBS: sửa hồ sơ bệnh án điện tử,
báo cáo công tác của khoa, thiết kế bản in và quản trị hệ thống.

## Chạy

```bash
cp .env.local.example .env.local     # trỏ API_PROXY_TARGET về máy chủ NestJS
npm install
npm run dev                          # http://localhost:3000
```

Mọi lời gọi API dùng đường dẫn tương đối `/api/...`; Next.js chuyển tiếp sang backend
(xem `next.config.mjs`) nên không vướng CORS và mở PDF ở tab mới vẫn kèm cookie đăng nhập.

## Cấu trúc

```
src/
├─ app/
│  ├─ layout.tsx            Khung gốc + providers
│  ├─ login/                Đăng nhập
│  └─ (app)/                Khu vực yêu cầu đăng nhập (dùng AppShell)
│     ├─ dashboard/         Bảng điều khiển
│     ├─ ho-so-benh-an/     Danh sách · tạo phiếu · chi tiết & ký số · quy trình ký
│     ├─ bao-cao/           Nhập số liệu · xem báo cáo · tổng hợp toàn viện · mẫu báo cáo
│     ├─ quan-tri/          Khoa phòng · người dùng · vai trò · mẫu in · tiện ích · tác vụ · cấu hình · nhật ký
│     └─ ca-nhan/           Hồ sơ cá nhân · đổi mật khẩu
├─ components/
│  ├─ layout/               Menu dọc, thanh trên cùng, khung ứng dụng
│  ├─ shared/               CrudTable, PageHeader/StatCard, StatusBadge
│  └─ ui/                   Nguyên thuỷ shadcn-style: button, input, card, table, dialog, tabs
├─ lib/                     api.ts (gọi API) · auth.ts (zustand) · utils.ts
└─ types/                   Kiểu dữ liệu dùng chung
```

## Quy ước

- **Không set cứng**: menu, khoa phòng, vai trò/quyền, mẫu báo cáo, mẫu in, tiện ích đều đọc từ API.
- Mục menu tự ẩn theo quyền (`useAuth().can(permission)`).
- Giao diện responsive: mobile (menu ngăn kéo) → máy tính → màn hình lớn.
- Có chế độ sáng/tối và quy tắc in (`.no-print`, `.print-sheet`).
