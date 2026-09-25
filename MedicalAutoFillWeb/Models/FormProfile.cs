using System.ComponentModel.DataAnnotations;

namespace MedicalAutoFillWeb.Models;

/// <summary>
/// Một form trên medinet.org.vn (ví dụ: Phiếu xét nghiệm KSKDK).
/// </summary>
public class FormProfile
{
    public int Id { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = "";

    [MaxLength(300)]
    public string? DisplayName { get; set; }

    /// <summary>URL mẫu của form trên medinet.</summary>
    [MaxLength(2000)]
    public string? Url { get; set; }

    /// <summary>
    /// Chuỗi con dùng nhận diện form trong URL (ví dụ "KSKDK_Phieu_CanLamSang").
    /// Thêm vào để engine tự nhận diện đúng form mà không cần so URL tuyệt đối.
    /// </summary>
    [MaxLength(300)]
    public string? UrlRegex { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    /// <summary>Nhãn các câu hỏi Có/Không cần bấm "Không" hàng loạt (phân cách bằng ;).</summary>
    [MaxLength(2000)]
    public string? NoQuestionLabels { get; set; }

    public List<FieldMapping> Fields { get; set; } = new();
}
