namespace MedicalAutoFillWeb.Models;

/// <summary>
/// Model cho trang lỗi.
///
/// Bản gốc KHÔNG có class này và cũng không có Views/Shared/Error.cshtml, trong khi
/// Program.cs lại bật `app.UseExceptionHandler("/Home/Error")` — nghĩa là khi app
/// ném lỗi trong production, người dùng nhận về trang 404 trắng thay vì thông báo lỗi.
/// </summary>
public class ErrorViewModel
{
    public string? RequestId { get; set; }

    public bool ShowRequestId => !string.IsNullOrEmpty(RequestId);

    /// <summary>Thông điệp ngắn, an toàn để hiện cho người dùng cuối.</summary>
    public string? Message { get; set; }
}
