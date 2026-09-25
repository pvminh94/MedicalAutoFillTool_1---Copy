using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using MedicalAutoFillWeb.Models;

namespace MedicalAutoFillWeb.Services;

/// <summary>
/// Sinh script chạy trong DevTools của medinet.
///
/// Bản cũ TỰ VIẾT LẠI toàn bộ logic tìm ô/ghi giá trị ở đây (lần thứ 3 trong repo,
/// sau WinForms và Bridge). Ba bản sao đó lệch nhau, và bản này thiếu: chờ form sẵn
/// sàng, kiểm tra ghi thành công, iframe, dxComponent... khiến DevTools script
/// "chạy không lỗi" nhưng không điền gì.
///
/// Nay: nhúng Shared/maf-engine.js (đã có test jsdom) + đẩy cấu hình form vào đó.
/// </summary>
public static class ScriptBuilderService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    /// <summary>Script đầy đủ = engine + configure(form). Dán vào DevTools Console.</summary>
    public static string Build(FormProfile? form)
    {
        var sb = new StringBuilder();
        sb.AppendLine("/* ============================================================================");
        sb.AppendLine("   Medical Auto Fill — script DevTools");
        sb.AppendLine("   Dán vào Console của trang medinet rồi Enter.");
        sb.AppendLine("   Sau đó dùng: MAF.fill({rows:[[...]], headerRow:[...]})");
        sb.AppendLine("                MAF.selectAllNo()   MAF.scan()   MAF.state()");
        sb.AppendLine("   ============================================================================ */");

        string engine;
        try
        {
            engine = Controllers.EngineAsset.Load();
        }
        catch (Exception ex)
        {
            sb.AppendLine("/* KHÔNG NẠP ĐƯỢC ENGINE: " + ex.Message.Replace("*/", "") + " */");
            sb.AppendLine("console.error('Medical Auto Fill: thiếu Shared/maf-engine.js');");
            return sb.ToString();
        }

        sb.AppendLine(engine);
        sb.AppendLine();

        if (form != null)
        {
            var config = ToEngineConfig(form);
            sb.AppendLine("MAF.configure(" + JsonSerializer.Serialize(config, JsonOpts) + ");");
            sb.AppendLine("console.log('Medical Auto Fill: đã nạp cấu hình \"" +
                          Escape(form.DisplayName ?? form.Name) + "\" (' + MAF.state().formId + '), engine ' + MAF.VERSION);");
            sb.AppendLine("console.log('Cách dùng: dán dữ liệu rồi gọi  MAF.fill({ rows: [[\"...\"], [\"...\"]], headerRow: [\"Họ và tên\", \"...\"] })');");
        }
        else
        {
            sb.AppendLine("console.warn('Medical Auto Fill: chưa có form nào trong CSDL — engine chạy ở chế độ tự nhận diện theo URL.');");
        }

        return sb.ToString();
    }

    /// <summary>Đổi FormProfile (EF) sang đúng cấu trúc EngineOptions.</summary>
    public static object ToEngineConfig(FormProfile form) => new
    {
        formId = form.Name,
        url = form.Url,
        urlRegex = form.UrlRegex,
        noQuestionLabels = Split(form.NoQuestionLabels),
        fields = form.Fields
            .OrderBy(f => f.ExcelIndex)
            .Select(f => new
            {
                index = f.ExcelIndex,
                labels = Split(f.Labels),
                // Không có HeaderNames thì tự sinh từ nhãn (cùng quy tắc với C#).
                headerNames = Split(f.HeaderNames).Count > 0 ? Split(f.HeaderNames) : null,
                selector = f.Selector,
                controlType = string.IsNullOrWhiteSpace(f.ControlType) ? "auto" : f.ControlType,
                required = f.Required,
                transform = f.Transform
            })
            .ToList()
    };

    /// <summary>URL hiện tại có thuộc form này không (dùng cho badge trạng thái Bridge).</summary>
    public static bool UrlMatches(FormProfile form, string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;

        if (!string.IsNullOrWhiteSpace(form.UrlRegex))
        {
            // Trường này chứa CHUỖI NHẬN DIỆN (không phải regex thật) — so contains
            // trước, chỉ thử regex nếu người dùng cố tình viết regex.
            if (url.Contains(form.UrlRegex, StringComparison.OrdinalIgnoreCase)) return true;
            try
            {
                if (System.Text.RegularExpressions.Regex.IsMatch(url, form.UrlRegex!,
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return true;
            }
            catch { /* không phải regex hợp lệ -> bỏ qua */ }
        }

        if (!string.IsNullOrWhiteSpace(form.Url))
        {
            if (string.Equals(form.Url.TrimEnd('/'), url.TrimEnd('/'), StringComparison.OrdinalIgnoreCase)) return true;

            var marker = Path.GetFileName(form.Url.TrimEnd('/'));
            if (!string.IsNullOrEmpty(marker) && url.Contains(marker, StringComparison.OrdinalIgnoreCase)) return true;
        }

        if (!string.IsNullOrWhiteSpace(form.Name) &&
            url.Contains(form.Name, StringComparison.OrdinalIgnoreCase)) return true;

        return false;
    }

    private static List<string> Split(string? s) =>
        string.IsNullOrWhiteSpace(s)
            ? new List<string>()
            : s.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static string Escape(string s) => s.Replace("'", "\\'");
}
