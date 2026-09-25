using System.Text.Json;
using System.Text.Json.Serialization;

namespace MedicalAutoFillTool;

/// <summary>Ánh xạ giữa 1 cột dữ liệu (Excel) và 1 trường nhập trên web.</summary>
public class FieldMapping
{
    /// <summary>Chỉ số cột trong bảng tính / clipboard (bắt đầu từ 0).</summary>
    public int ExcelIndex { get; set; }

    /// <summary>
    /// Một hoặc nhiều nhãn (label) khả dĩ trên web để tìm ô nhập.
    /// Phần mềm thử từng nhãn; nếu có nhiều nhãn thì cho phép web đổi tên mà vẫn hoạt động.
    /// </summary>
    public string[] Labels { get; set; } = Array.Empty<string>();

    /// <summary>Loại điều khiển: "text" (mặc định), "textarea".</summary>
    public string ControlType { get; set; } = "text";
}

/// <summary>Một "form" (mẫu biểu) trên web, được nhận diện qua chuỗi URL.</summary>
public class FormProfile
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "Form mới";
    /// <summary>Nếu URL trang đang mở chứa chuỗi này thì form này được coi là active.</summary>
    public string UrlContains { get; set; } = "";
    public List<FieldMapping> Fields { get; set; } = new();
}

/// <summary>Toàn bộ cấu hình của tiện ích, được đọc ghi dưới dạng JSON.</summary>
public class AppConfig
{
    public string DefaultUrl { get; set; } = "https://quanlyskcd.medinet.org.vn/account/login";

    /// <summary>"tab" hoặc "comma" - cách tách các cột khi dán dữ liệu từ Excel.</summary>
    public string PasteMode { get; set; } = "tab";

    /// <summary>Các từ tương ứng với "Chọn Không" khi bấm Ctrl+B (tự động chọn radio).</summary>
    public List<string> SelectNoKeywords { get; set; } = new()
    {
        "không", "hầu như không", "không nhớ rõ", "không có", "bình thường", "không rõ"
    };

    public List<FormProfile> Forms { get; set; } = new();
}

/// <summary>Dùng chung cho việc đọc/ghi JSON và sinh script (đồng bộ tên thuộc tính camelCase).</summary>
public static class AppJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };
}