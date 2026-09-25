# 🏥 Medical Auto Fill Tool

Công cụ hỗ trợ paste dữ liệu xét nghiệm từ Excel vào medinet.org.vn.

## Kiến trúc: 1 máy chủ - Cả phòng dùng

Chỉ cần **cài đặt 1 lần trên 1 máy chủ**, các máy khác trong phòng/khoa chỉ cần mở trình duyệt.

```
┌────────────────────┐     LAN nội bộ     ┌─────────────────────┐
│  MÁY CHỦ (Server)   │                   │  Máy người dùng 1   │
│                     │◄─────────────────│  (Chỉ trình duyệt)   │
│  - Web ASP.NET      │                   │  Copy Excel →       │
│  - MedinetBridge    │◄─────────────────│  Ctrl+V vào web     │
│    (WebView2)       │                   │  → Xong!            │
│                     │                   │                     │
│  Cài 1 lần, chạy    │◄─────────────────│  Máy người dùng N   │
│  mãi mãi            │                   │  (Chỉ trình duyệt)   │
└────────────────────┘                    └─────────────────────┘
```

## Cách dùng

### Trên máy chủ (cài 1 lần)

**Cách 1: Chạy nhanh (dev)**
```
run-all.bat
```
- Mở trình duyệt: http://localhost:5000

**Cách 2: IIS Production**
```
deploy-iis.bat
```
- Copy thư mục `publish\medicalautofillweb` vào IIS
- Chạy `publish\medinetbridge\MedinetBridge.exe` trên máy chủ

### Trên máy người dùng (không cài gì)

1. Mở trình duyệt → link: `http://[địa-chỉ-máy-chủ]:5000` hoặc URL IIS
2. Copy dữ liệu từ Excel (Ctrl+C)
3. Paste vào bảng trên web (Ctrl+V)
4. Nhấn **"Gửi lên Medinet"** (hoặc Ctrl+Enter)
5. ✅ Xong! Medinet tự động được fill

**Phím tắt:**
- `Ctrl+Enter` = Gửi dữ liệu lên Medinet
- `Ctrl+B` = Chọn "Không" hàng loạt (bên medinet)

### Cấu hình ẩn
- Click 🏥 logo **5 lần** → Mở bảng quản lý form
- Đổi form mặc định, thêm/sửa/xóa mapping

## Build (tự build)

```
dotnet build MedicalAutoFillWeb\MedicalAutoFillWeb.csproj
dotnet build MedinetBridge\MedinetBridge.csproj
```

## GitHub
https://github.com/pvminh94/MedicalAutoFillTool