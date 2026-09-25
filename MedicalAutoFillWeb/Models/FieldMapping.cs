using System.ComponentModel.DataAnnotations;

namespace MedicalAutoFillWeb.Models;

/// <summary>
/// Ánh xạ MỘT cột Excel -> MỘT trường trên form web.
///
/// Bản cũ chỉ có ExcelIndex + Labels + ControlType, và bridge lại bỏ qua Labels
/// nên việc cấu hình ở đây gần như vô nghĩa. Nay thêm:
///  - HeaderNames : tên cột trong file Excel, để ghép THEO TIÊU ĐỀ thay vì index cứng.
///                  Đây là fix quan trọng nhất: chỉ cần file Excel đổi thứ tự cột
///                  là bản cũ điền sai toàn bộ (số lượng HC ghi vào ô Huyết sắc tố...).
///  - Selector    : neo cứng vào phần tử khi biết trước (tránh nhận diện nhầm).
///  - Required    : đánh dấu trường bắt buộc để báo cáo rõ ràng.
///  - Transform   : chuyển đổi giá trị (vd Excel lưu ngày dạng số 45123 -> dd/mm/yyyy).
/// </summary>
public class FieldMapping
{
    public int Id { get; set; }

    public int FormProfileId { get; set; }
    public FormProfile? FormProfile { get; set; }

    /// <summary>Chỉ số cột trong bảng Excel dán vào (0-based).</summary>
    public int ExcelIndex { get; set; }

    /// <summary>Nhãn nhìn thấy trên trang web, phân cách bằng dấu chấm phẩy.</summary>
    [MaxLength(2000)]
    public string? Labels { get; set; }

    /// <summary>Tên cột trong file Excel, phân cách bằng dấu chấm phẩy.</summary>
    [MaxLength(2000)]
    public string? HeaderNames { get; set; }

    /// <summary>CSS selector neo cứng (tuỳ chọn).</summary>
    [MaxLength(1000)]
    public string? Selector { get; set; }

    /// <summary>Loại điều khiển: auto | text | textarea | number | date | select | checkbox | radio.</summary>
    [MaxLength(50)]
    public string? ControlType { get; set; } = "auto";

    public bool Required { get; set; }

    /// <summary>Chuyển đổi giá trị: excelDate | none (mặc định).</summary>
    [MaxLength(50)]
    public string? Transform { get; set; }
}
