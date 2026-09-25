# 🏥 Medical Auto Fill Tool

Dán dữ liệu xét nghiệm từ **Excel** vào form trên **medinet.org.vn** — tự điền hàng chục trường trong một lần bấm, thay vì gõ lại từng ô.

> ## ⚡ Bản 2.0 — sửa tận gốc lỗi "lúc copy/paste được, lúc không"
>
> Bản cũ đọc clipboard **bằng JavaScript trong trang web** (`navigator.clipboard.readText()`), chỉ gọi **một lần**, không retry.
> Clipboard của Windows là tài nguyên **dùng chung toàn hệ điều hành**: chỉ cần Excel chưa nhả, Unikey/TeamViewer/RDP hay một trình quản lý clipboard đang giữ nó, lệnh mở clipboard thất bại → app im lặng bỏ qua → **"không dán được"**.
>
> Bản mới đọc clipboard **bằng API native của hệ điều hành** (C#/Electron), **thử lại 5 lần** với khoảng lùi tăng dần, và **luôn hiện bảng xem trước** dữ liệu đã tách được — nên nếu có lỗi thì bạn nhìn thấy ngay lý do, không phải đoán.

---

## 1. Chọn bản nào?

| | **Desktop (WinForms)** ⭐ | Web + Bridge | Electron |
|---|---|---|---|
| Cài đặt | 1 file `.exe`, chạy ngay | 2 tiến trình trên máy chủ | `npm start` / portable exe |
| Ai dùng được | Người dùng trên máy đó | **Cả phòng** qua trình duyệt | Người dùng trên máy đó |
| Cần internet | Chỉ để vào medinet | Chỉ để vào medinet | Chỉ để vào medinet |
| Đọc clipboard | ✅ native + retry | ⚠️ qua ô dán của trình duyệt | ✅ native + retry |
| Khuyên dùng khi | 1–2 người, một máy | Nhiều người, một máy chủ | Đang thử nghiệm |

**⭐ Bản Desktop là bản hoàn thiện nhất** (WebView2 + cấu hình `forms.json` + bảng xem trước + log). Hai bản kia dùng **cùng một engine** nên cho kết quả giống hệt.

---

## 2. Chạy bản Desktop

### Cách nhanh nhất (không cần cài gì)

Chạy `MedicalAutoFillTool.exe` đã publish sẵn. Máy cần **Microsoft Edge WebView2 Runtime** — Windows 10/11 gần như luôn có sẵn; nếu thiếu thì tải tại
<https://developer.microsoft.com/microsoft-edge/webview2/>.

### Tự build

```bat
run-winforms.bat        :: build rồi chạy luôn
publish-winforms.bat    :: xuất ra 1 file .exe duy nhất tại publish\desktop\
```

Cần **.NET 8 SDK**: <https://dotnet.microsoft.com/download/dotnet/8.0>

Mở bằng Visual Studio: `MedicalAutoFillTool.sln` → chọn project `MedicalAutoFillTool` → F5.

### File của bạn nằm ở đâu

| Nội dung | Đường dẫn |
|---|---|
| Cấu hình form | `<thư mục .exe>\config\forms.json` (chế độ portable) hoặc `%LocalAppData%\MedicalAutoFillTool\config\forms.json` |
| Nhật ký | cùng thư mục cha, trong `logs\maf-yyyyMMdd.log` |
| Phiên đăng nhập medinet | `%LocalAppData%\MedicalAutoFillTool\WebView2\` (giữ cookie, lần sau không phải đăng nhập lại) |

App tự chọn thư mục **ghi được**: ưu tiên cạnh file `.exe`, không được thì lùi về `%LocalAppData%`.

---

## 3. Cách dùng (5 bước)

1. **Mở app** → medinet hiện ra → **đăng nhập** như bình thường (app nhớ phiên cho lần sau).
2. Mở form cần điền (ví dụ *Phiếu Cận Lâm Sàng*). App tự nhận diện form theo URL — thanh trạng thái sẽ hiện tên form và số trường.
3. Trong **Excel**: bôi đen cả **dòng tiêu đề** lẫn các dòng số liệu → `Ctrl+C`.
4. Trong app: bấm **📋 Dán** (hoặc `Ctrl+Shift+V`) → bảng xem trước hiện ra, app tự tìm dòng tiêu đề và báo *"khớp 31/33 cột"*.
5. Chọn dòng bệnh nhân → bấm **▶ Điền** (hoặc `Ctrl+Enter`). Xem báo cáo: bao nhiêu trường OK, trường nào không tìm thấy ô, trường nào Excel để trống.

### Thanh công cụ

| Nút | Chức năng |
|---|---|
| 🏠 Trang chủ · ⟳ Tải lại | Điều hướng medinet |
| **📋 Dán** | Đọc clipboard (có retry) và hiện bảng xem trước |
| **▶ Điền** | Điền dòng đang chọn |
| ⏭ Tất cả | Điền lần lượt mọi dòng trong hàng đợi (`F9` = dòng kế tiếp) |
| 🧪 Kiểm tra | **Chạy thử**: cho biết mỗi cột sẽ ghi vào ô nào, **không ghi thật** |
| ☑ Chọn 'Không' | Bấm "Không" cho hàng loạt câu hỏi Có/Không |
| ▤ Bảng dữ liệu | Ẩn/hiện bảng xem trước |
| ⚙ Cài đặt | Cấu hình form, nhãn, tên cột Excel, selector |
| 📜 Log | Nhật ký chi tiết (kèm nút copy để gửi cho người hỗ trợ) |

### Phím tắt

| Phím | Tác dụng |
|---|---|
| `Ctrl+Shift+V` | Đọc clipboard → hiện bảng xem trước |
| `Ctrl+Enter` | Điền dòng đang chọn |
| `F7` | Ẩn/hiện bảng dữ liệu |
| `F9` | Điền dòng kế tiếp trong hàng đợi |
| `F10` | Chạy thử (không ghi) |
| `Ctrl+Shift+S` | Mở Cài đặt |
| `Ctrl+Shift+L` | Xem log |
| `F12` | DevTools (nếu bật trong Cài đặt) |

> **Mẹo quan trọng:** luôn copy **kèm dòng tiêu đề**. Có tiêu đề thì app ghép cột **theo tên**; không có tiêu đề thì phải đoán theo vị trí cột, rất dễ lệch.

---

## 4. Bản Web (1 máy chủ — cả phòng dùng)

```
┌──────────────── MÁY CHỦ ────────────────┐        ┌── Máy người dùng ──┐
│  MedicalAutoFillWeb  (ASP.NET, :5000)   │◄───────│  Chỉ cần trình     │
│  MedinetBridge       (WebView2, :5119)  │  LAN   │  duyệt: copy Excel │
│  CSDL cấu hình: SQLite                  │        │  → Ctrl+V → Gửi    │
└─────────────────────────────────────────┘        └────────────────────┘
```

```bat
run-all.bat        :: chạy cả Web lẫn Bridge (để phát triển/thử)
deploy-iis.bat     :: publish ra IIS + Bridge chạy nền
```

- Máy chủ: <http://localhost:5000> — máy khác trong phòng: `http://<IP-máy-chủ>:5000`
- Trong cửa sổ **MedinetBridge** trên máy chủ: đăng nhập medinet và mở đúng form cần điền.
- Trang web có badge **Bridge** ở góc trên phải: xanh = sẵn sàng, đỏ = Bridge chưa chạy.
- Cấu hình form: menu **Cấu hình form** (lưu trong SQLite, mọi người dùng chung).
- Phím tắt trên trang: `Ctrl+Enter` gửi · `Ctrl+B` chọn "Không" · `Ctrl+R` phân tích lại khớp cột.

**Trang web không cần internet**: bảng dán (`paste-grid.js`), CSS và engine đều tự host — bản cũ tải Handsontable từ CDN, mất mạng là **không có bảng để dán**.

### Bảo mật (nên bật khi mở ra LAN)

Trong `MedicalAutoFillWeb/appsettings.json`:

```json
"Bridge": { "Url": "http://127.0.0.1:5119", "Token": "chuỗi-bí-mật" },
"Web":    { "FillToken": "chuỗi-bí-mật-khác" }
```

`Bridge:Token` cũng đặt cho Bridge qua biến môi trường `MAF_BRIDGE_TOKEN`. Không đặt thì **bất kỳ ai vào được trang web cũng ra lệnh điền được** — bản cũ còn tệ hơn: `/Home/FillMedinet` là cổng mở không kiểm tra gì.

---

## 5. Bản Electron (thử nghiệm)

```bash
cd MedicalAutoFillApp
npm install
npm start
```

- Cửa sổ medinet + cửa sổ **Dán dữ liệu** riêng.
- Đọc clipboard bằng API native của Electron, có retry.
- Phím tắt **chỉ ăn khi cửa sổ app đang focus** (bản cũ đăng ký `globalShortcut` → cướp `Ctrl+B` của Word/trình duyệt trên toàn máy).
- Tự dùng lại `forms.json` của bản Desktop nếu có; nếu không thì nạp `Shared/default-profiles.json`.
- Đóng gói: `npm run build` → `dist/MedicalAutoFill-x.y.z-portable.exe`.

---

## 6. Vì sao bản cũ dán lúc được lúc không

| # | Nguyên nhân trong bản cũ | Hậu quả |
|---|---|---|
| 1 | `navigator.clipboard.readText()` trong trang web — cần **secure context** (HTTPS) và quyền | Trên `http://` API **không tồn tại** → chờ 15s rồi bỏ |
| 2 | Gọi clipboard **đúng một lần**, không retry | Excel/Unikey/RDP đang giữ clipboard → fail → "không dán được" |
| 3 | Bản Web tải **Handsontable từ CDN** | Mất mạng/chặn CDN → `Handsontable is undefined` → **toàn bộ script của trang chết** → không có bảng để dán |
| 4 | `licenseKey: 'non-commercial-and-evaluation'` | Sai giấy phép khi dùng trong bệnh viện |
| 5 | Bridge **vứt bỏ mapping** web gửi lên, tự dùng bộ nhãn hardcode (`makcb`, `hoten`, `glucose`…) | Cấu hình công cốc; dán được nhưng **không điền gì** |
| 6 | Chỉ điền `rows[0]`, theo **chỉ số cột cố định** | Dán 10 bệnh nhân chỉ được 1; Excel đổi thứ tự cột là **sai toàn bộ** |
| 7 | `setValue` chỉ gán `.value` + bắn event | DevExtreme/React là **controlled input** → giá trị bị **trang web ghi đè lại** ngay |
| 8 | `HttpListener` xử lý tuần tự + `Wait(10s)` | Người thứ hai phải chờ 10 giây; lệnh gửi sớm bị **mất trắng** |
| 9 | `EnsureCreated()` mỗi lần khởi động | DB cũ **thiếu cột mới** → `no such column` → app web crash, chỉ còn cách xoá DB (mất cấu hình) |
| 10 | `Views/Home/Forms.cshtml` dùng `Model.UrlContains` (thuộc tính **không tồn tại**) | Project Web **không biên dịch được** |

---

## 7. Kiến trúc mới: MỘT engine cho tất cả

```
                 ┌──────────────────────────────────────┐
                 │      Shared/maf-engine.js  (v2.0)    │  ← logic điền DUY NHẤT
                 │  parseTable · detectHeaderRow        │    48 test jsdom
                 │  resolveColumns · findTarget         │
                 │  setValue (4 tầng + đọc lại kiểm tra)│
                 └──────────────────────────────────────┘
                     ▲            ▲           ▲        ▲
        nhúng vào .exe│    nhúng .exe│   phục vụ qua│    đọc file
                 ┌────┴───┐   ┌──────┴─────┐  ┌─────┴──────┐  ┌────┴─────┐
                 │WinForms│   │MedinetBridge│  │  Web (ASP) │  │ Electron │
                 │WebView2│   │  WebView2   │  │ +SQLite    │  │Chromium  │
                 └────────┘   └─────────────┘  └────────────┘  └──────────┘
```

Bản cũ có **4 bản sao** logic điền (WinForms, Bridge, Web, Electron) — mỗi bản một kiểu, lệch nhau, và không bản nào đủ tốt. Nay:

- **Tìm ô**: băm nhãn → tra O(1), khớp chính xác trước, khớp mờ (bỏ dấu, bỏ đơn vị trong ngoặc) khi không thấy; duyệt cả `iframe`; dùng `for`/`aria-labelledby`/vị trí hình học làm phương án cuối.
- **Ghi giá trị**: 4 tầng — `execCommand('insertText')` → native setter + event → `dxComponent.option()` → click chọn option/radio — rồi **đọc lại** để xác nhận trang web không ghi đè. Không đạt thì báo `value-rejected` thay vì im lặng.
- **Chờ form sẵn sàng**: `waitForReady` thăm dò đến khi đủ số ô nhập, có timeout — không còn bắn lệnh vào trang chưa render xong.
- **Hiệu năng**: 400 trường từ **4878 ms → ~1024 ms** (nhờ index băm thay vì quét toàn DOM cho từng trường).
- **An toàn dữ liệu**: JSON hoá bằng `System.Text.Json` với escaping mặc định, nên tên bệnh nhân chứa `</script>` hay dấu nháy **không thể phá script**.

---

## 8. Cấu hình form

Mở **⚙ Cài đặt** → tab **Forms & Fields**:

| Cột | Ý nghĩa |
|---|---|
| **Cột Excel** | Chỉ số cột (0-based) trong dữ liệu bạn dán |
| **Nhãn web** | Chữ hiển thị cạnh ô nhập trên medinet. Nhiều cách viết thì ngăn bằng `;` |
| **Tên cột Excel** | ⭐ **Quan trọng nhất.** Tên cột trong file Excel thật (`Số lượng HC; SLHC; RBC`). Có cái này thì app ghép **theo tiêu đề**, Excel đảo cột vẫn đúng. Để trống → tự suy ra từ nhãn |
| **Selector CSS** | Neo cứng vào phần tử khi bạn biết trước (nút 🎯 *Lấy selector* sẽ quét trang và điền giúp) |
| **Loại** | `auto` · `text` · `textarea` · `number` · `date` · `select` · `checkbox` · `radio` |
| **Bắt buộc** | Nếu Excel trống ở cột này → báo "thiếu dữ liệu" thay vì bỏ qua im lặng |

Tab **Chẩn đoán** có 2 công cụ dò lỗi:
- **Dán mẫu dữ liệu** → cho biết app nhận diện dòng tiêu đề ở đâu, mỗi cột khớp trường nào.
- **Quét trang medinet** → liệt kê nhãn + selector thật của các ô trên trang; bấm *Dùng selector cho trường đang chọn* để chép thẳng vào cấu hình.

Cấu hình lưu ở `config/forms.json`, có nút **Xuất/Nhập** để mang sang máy khác. Sửa xong không cần khởi động lại app — cấu hình được áp lại ở lần điều hướng kế tiếp.

---

## 9. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Bấm Dán mà bảng trống | Clipboard rỗng / app khác đang giữ | `Ctrl+C` lại trong Excel, bấm Dán lần nữa (app tự thử 5 lần). Xem thông báo lỗi hiện ra |
| "Không đọc được clipboard" | Unikey/TeamViewer/RDP chiếm clipboard | Tắt tạm, hoặc dán vào bảng xem trước bằng `Ctrl+V` |
| Báo cáo: **0 OK, N không thấy ô** | Đang mở sai trang medinet, hoặc nhãn trong cấu hình không khớp | Bấm 🧪 **Kiểm tra**; mở Cài đặt → **Chẩn đoán** → **Quét trang** để lấy nhãn/selector thật |
| Điền xong ô lại **trắng** | Trang web từ chối giá trị (validation) | Báo cáo sẽ hiện `value-rejected`; kiểm tra định dạng (đơn vị, số thập phân) |
| Số liệu **lệch cột** | Không có dòng tiêu đề, hoặc tên cột Excel chưa khai | Copy kèm dòng tiêu đề; khai thêm **Tên cột Excel** |
| App báo "engine không phản hồi" | WebView2 render process chết | App tự tạo lại WebView2; nếu không được thì ⟳ Tải lại |
| Web: badge **Bridge** đỏ | `MedinetBridge.exe` chưa chạy trên máy chủ | Chạy Bridge trên máy chủ, đăng nhập medinet trong đó |
| Web: `no such column: HeaderNames` | DB cũ chưa được nâng cấp | Bản mới tự `ALTER TABLE`; nếu vẫn lỗi, kiểm tra quyền ghi thư mục `Data/` |
| Cần gửi lỗi cho người hỗ trợ | — | `Ctrl+Shift+L` → **📋 Copy log**, hoặc gửi file trong `logs\` |

---

## 10. Dành cho người phát triển

```bash
python3 Tests/check-all.py     # cổng kiểm tra tổng hợp (không cần .NET SDK)
cd Tests && npm install && npm test   # 48 test jsdom cho engine
Tests/check.bat                # chạy cả hai trên Windows
```

`Tests/check-all.py` bắt được 7 nhóm lỗi mà **không cần biên dịch**:

1. C# mất cân bằng ngoặc / chuỗi chưa đóng (lexer hiểu `@"..."`, `$"...{x}..."`, comment)
2. `csproj` tham chiếu file không tồn tại — *lỗi thật đã gặp*: project ở thư mục gốc viết `..\Shared\maf-engine.js` trỏ ra **ngoài repo** → `CS1566`
3. JS sai cú pháp (`node --check`)
4. JSON không parse được
5. `Shared/default-profiles.json` lệch `BuiltinProfiles.cs` (file JSON **được sinh ra** từ C#, không gõ tay hai lần)
6. View `.cshtml` gọi endpoint không có action trong controller
7. Host gọi `MAF.xxx()` mà engine không export

**CI** (`.github/workflows/ci.yml`) chạy các bước trên **và** biên dịch thật cả 3 project .NET trên `ubuntu-latest` — được là nhờ `<EnableWindowsTargeting>true</EnableWindowsTargeting>` (vô hại khi build trên Windows).

### Cấu trúc thư mục

```
Shared/maf-engine.js            ← engine điền form (nguồn sự thật duy nhất)
Shared/default-profiles.json    ← cấu hình mặc định (SINH TỰ ĐỘNG, đừng sửa tay)
Tests/                          ← 48 test jsdom + các script kiểm tra
*.cs (thư mục gốc)              ← bản Desktop WinForms
  Form1.cs                      cửa sổ chính + WebView2 + điều phối
  ClipboardService.cs           đọc clipboard native, retry trên luồng STA
  PastePanel.cs                 bảng xem trước dữ liệu đã dán
  SettingsForm.cs               cấu hình form + tab Chẩn đoán
  TsvParser.cs / TextNormalizer.cs   bản C# của parseTable/norm trong engine
  ConfigRepository.cs           đọc/ghi forms.json, tự migration v1→v2, watch file
MedicalAutoFillWeb/             ← ASP.NET Core MVC + SQLite
MedinetBridge/                  ← WebView2 giữ phiên medinet, HTTP :5119
MedicalAutoFillApp/             ← Electron
```

Quy ước khi sửa: **mọi logic tìm ô / ghi giá trị / tách dữ liệu chỉ nằm trong `Shared/maf-engine.js`**. Bản C# (`TsvParser`, `TextNormalizer`) chỉ để vẽ bảng xem trước trước khi gửi sang trang, và phải giữ cùng quy tắc với engine.

---

## 11. Ghi chú

- Dữ liệu bệnh nhân **không rời khỏi máy bạn**: bản Desktop và Electron điền thẳng trong WebView2; bản Web chỉ đi trong LAN tới Bridge trên máy chủ. Không có telemetry, không gọi dịch vụ bên thứ ba, không CDN.
- Công cụ này **hỗ trợ** nhập liệu, không thay thế việc kiểm tra lại hồ sơ. Luôn đối chiếu báo cáo "đã điền N trường" với form trước khi lưu.
- Tác giả: **pvminh94**
