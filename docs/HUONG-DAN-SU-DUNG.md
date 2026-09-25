# Hướng dẫn sử dụng — QLBS

Tài liệu ngắn gọn theo từng vai trò. Mở giao diện bằng trình duyệt (máy tính, máy tính
bảng, điện thoại đều dùng được), đăng nhập bằng tài khoản được cấp.

---

## 1. Người đề nghị sửa hồ sơ bệnh án (vai trò `NHAP_LIEU`)

**Tạo phiếu**

1. Menu **Hồ sơ bệnh án → Tạo phiếu** (hoặc nút *Tạo phiếu* ở danh sách).
2. Điền thông tin người bệnh (họ tên, năm sinh, giới tính, mã KCB, mã thẻ BHYT,
   ngày vào/ra viện, đối tượng).
3. Ghi **lý do** và **nội dung cần sửa** trong HSBA điện tử; nhập số tiền cần huỷ
   thanh toán (nếu có).
4. Kiểm tra **quy trình ký** hiển thị bên phải (mấy bước, ai ký) rồi bấm
   **Tạo phiếu**. Bật *Ký xác nhận ngay* nếu muốn phiếu chuyển thẳng sang bước duyệt.

**Theo dõi & xử lý**

* Danh sách phiếu có các tab theo bước ký; bật *Chờ tôi xử lý* để chỉ xem việc của mình.
* Phiếu **bị trả lại** hiện màu vàng, kèm lý do. Bấm **Sửa & gửi lại** → sửa nội dung →
  bấm **Gửi lại phiếu** (hệ thống yêu cầu ký lại vì nội dung đã thay đổi).
* Bấm **In bản in** để kết xuất PDF khổ A4 theo mẫu in đang ban hành.

> Lưu ý: khi phiếu đã được ký ở bước tiếp theo thì không sửa được nội dung nữa —
> người duyệt phải trả lại phiếu trước.

## 2. Duyệt – TB.KHTH (vai trò `KHTB`)

1. Menu **Hồ sơ bệnh án**, bật *Chờ tôi xử lý*.
2. Mở phiếu → xem nội dung, nhật ký và các bước ký.
3. Chọn một trong hai:
   * **Duyệt**: bấm *Ký bước này*, có thể ghi ý kiến; phiếu chuyển sang Tài chính.
   * **Trả lại**: bấm *Trả lại*, ghi rõ lý do; phiếu quay về người đề nghị và mọi chữ
     ký cũ bị huỷ (ghi vào nhật ký).
4. Ký nhiều phiếu cùng lúc: chọn các phiếu ở danh sách → **Ký hàng loạt**.

## 3. Tài chính (vai trò `TAI_CHINH`)

1. Mở phiếu đang ở bước *Chờ TC xác nhận hủy thanh toán*.
2. Đối chiếu số tiền và giao dịch BHYT; sau khi đã hủy thanh toán trên phần mềm kế toán,
   bấm **Ký bước này** để xác nhận. Phiếu chuyển sang trạng thái **Hoàn tất**.

## 4. Nhập số liệu báo cáo của khoa (vai trò `TRUONG_KHOA`, `NHAP_BAO_CAO`)

1. Menu **Báo cáo → Nhập số liệu**; chọn **mẫu báo cáo** của khoa.
2. Chọn **kỳ** (ngày / tuần / tháng / quý / năm / khoảng ngày / toàn bộ) rồi bấm *Tải số liệu*.
3. Nhập trực tiếp vào từng ô; các cột **Công thức** tự tính theo cột được tham chiếu.
4. Bấm **Lưu số liệu**. Mọi thay đổi được lưu vết (ai sửa, giá trị cũ → mới) — xem
   *Nhật ký số liệu* trong cùng trang.
5. Có thể dán số liệu từ Excel theo hướng dẫn ở cột *Dán từ Excel* hoặc nhập một lần
   cho cả kỳ bằng tuỳ chọn *Nhập cho cả kỳ*.

## 5. Xem báo cáo & chốt số liệu

**Một khoa** — **Báo cáo**: chọn mẫu, kỳ, bấm *Xem báo cáo*; kết xuất
**Excel / Word / PDF** hoặc **In báo cáo**.

**Toàn viện** — **Báo cáo → Tổng hợp toàn viện**: bảng chỉ tiêu theo từng khoa, kèm
danh sách khoa chưa nhập số liệu trong kỳ.

**Chốt số liệu** (người có quyền `report.snapshot.create`):

1. Chọn đúng mẫu và kỳ cần chốt → bấm **Chốt số liệu kỳ này**.
2. Bản chốt lưu nguyên trạng số liệu tại thời điểm chốt và được đánh dấu *Bản nháp*.
3. Người có quyền duyệt bấm **Duyệt** rồi **Khoá** để chốt chính thức. Số liệu của bản
   chốt **không thay đổi** khi số liệu nhập về sau bị sửa.

### Xem lại và mở khoá bản chốt

* Danh sách bản chốt nằm ngay dưới nút **Chốt số liệu kỳ này** ở **Báo cáo**.
* Bấm **Xem** để mở lại đúng số liệu tại thời điểm chốt (bảng thu gọn, tô màu trạng thái).
* Bấm **Mở khoá** để đưa bản chốt về *Đã duyệt* và cho phép nhập tiếp. Việc mở khoá cần
  quyền `report.snapshot.lock` (hoặc quản trị tối cao) và luôn được ghi vào nhật ký hệ
  thống với thao tác `UNLOCK`. Khi bản chốt còn *Đã khoá*, ô nhập số liệu của kỳ đó bị
  chặn kèm cảnh báo màu vàng — tránh sửa nhầm số đã báo cáo.

## 6. Trưởng khoa / Ban giám đốc

* **Bảng điều khiển**: số phiếu theo trạng thái, số phiếu bị trả lại, tình hình nhập
  số liệu của các khoa, tác vụ sắp chạy và nhật ký gần nhất — phạm vi dữ liệu theo
  vai trò được gán.
* Duyệt số liệu: theo dõi bảng *Tổng hợp toàn viện* để biết khoa nào chưa nhập.

## 7. Quản trị hệ thống (vai trò `ADMIN`)

| Việc | Đường dẫn |
|---|---|
| Người dùng: thêm, sửa, gán vai trò, đặt lại mật khẩu, khoá tài khoản | **Quản trị → Người dùng** |
| Vai trò & quyền: tạo vai trò, tích chọn từng quyền, đặt phạm vi dữ liệu | **Quản trị → Vai trò** |
| Cây khoa phòng: thêm/sửa/xoá nhiều cấp, bật nhập báo cáo, gán mẫu báo cáo | **Quản trị → Khoa phòng** |
| Quy trình ký phiếu HSBA: số bước, loại người ký, cho trả lại, bắt buộc ý kiến | **Hồ sơ bệnh án → Quy trình ký** |
| Mẫu báo cáo: mục, nhóm, dòng, cột nhập/công thức, chỉ tiêu tổng hợp | **Báo cáo → Mẫu báo cáo** |
| Mẫu in: khổ giấy, lề, font, ảnh, chữ ký, phiên bản đang ban hành | **Quản trị → Mẫu in** |
| Tiện ích (menu): thêm/sửa/xoá, sắp xếp, đặt vị trí, giới hạn theo quyền | **Quản trị → Tiện ích** |
| Tác vụ định kỳ: cron, chạy tay, xem lịch sử chạy | **Quản trị → Tác vụ** |
| Cấu hình: thông tin bệnh viện, tuỳ chọn hệ thống, khôi phục mặc định | **Quản trị → Cấu hình** |
| Nhật ký toàn hệ thống (lọc theo người dùng, phân hệ, thao tác, thời gian) | **Quản trị → Nhật ký** |

## 8. Câu hỏi thường gặp

**Tôi không thấy menu nào?** Menu được cấp theo quyền — liên hệ quản trị để được gán
vai trò phù hợp. Menu **Tiện ích** hiển thị theo cấu hình *Quản trị → Tiện ích*.

**Tìm phiếu nhanh thế nào?** Ô tìm kiếm nhận cả chữ có dấu và không dấu (`hồng ánh`,
`hong anh`), tìm được theo số phiếu, mã KCB, mã thẻ BHYT, tên người bệnh, khoa.
Bấm **Bộ lọc nâng cao** để lọc theo khoa, mức ưu tiên, đối tượng, khoảng số tiền,
phiếu đã bị trả lại và chọn kiểu sắp xếp.

**Lọc sâu theo từng trường thế nào?** Trong bảng *Bộ lọc nâng cao* còn có mục **Bộ lọc
nâng cao** (dạng điều kiện): chọn *trường* → *điều kiện* (bằng, khác, chứa, từ … trở lên,
thuộc danh sách, rỗng/có giá trị…) → *giá trị*, rồi bấm **Áp dụng**. Danh sách trường,
kiểu dữ liệu và danh mục giá trị do hệ thống tự cung cấp (API `/api/meta/filters`), nên
mọi màn hình đều có cùng cách lọc. Bấm **Lưu bộ lọc** để đặt tên và dùng lại bộ điều kiện
này về sau. Các màn *Người dùng*, *Tiện ích*, *Mẫu in*, *Nhật ký* cũng có thanh lọc này.

**Thiết kế bản in ở đâu?** Vào **Quản trị → Mẫu in**, bấm **Thiết kế** ở một mẫu: màn
thiết kế cho phép kéo thả từng phần tử theo milimét, chỉnh khổ giấy/lề/lưới, font và kiểu
chữ, khung viền – nền, bảng động (thêm cột, nguồn dữ liệu, dòng tổng), nhiều trang, chữ
mờ, đánh số trang và liên kết dữ liệu cho từng ô; bấm **Xem trước PDF** để kiểm tra ngay.
Nút **Thiết kế trống** tạo bố cục mới; tab **JSON** cho phép xem/sao lưu/nạp thiết kế.

**Bản in bị lệch/thiếu chữ?** Kiểm tra *Quản trị → Mẫu in*: khổ giấy, lề và font
(Tinos/Times hỗ trợ đầy đủ tiếng Việt). Bản in được kết xuất theo đúng mẫu đang ban hành.

**Quên mật khẩu?** Liên hệ quản trị để *Đặt lại mật khẩu*; lần đăng nhập kế tiếp hệ
thống có thể yêu cầu đổi mật khẩu.
