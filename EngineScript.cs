using System.Reflection;
using System.Text;

namespace MedicalAutoFillTool;

/// <summary>
/// Nạp ENGINE ĐIỀN FORM DÙNG CHUNG (Shared/maf-engine.js) được nhúng thẳng vào file .exe.
///
/// Vì sao cần: trước đây mỗi bản (WinForms / MedinetBridge / Electron) tự giữ một
/// bản JavaScript riêng. Sửa một nơi quên hai nơi => Bridge điền theo bộ mapping
/// hardcode cũ (makcb, hoten, glucose...) trong khi cấu hình thật là form xét nghiệm
/// (Số lượng HC, Huyết sắc tố...) => "paste được mà không điền".
/// Nay chỉ còn MỘT file engine, nhúng vào từng project bằng EmbeddedResource.
/// </summary>
internal static class EngineScript
{
    private const string ResourceName = "maf-engine.js";
    private static string? _cache;

    /// <summary>Phiên bản engine (đồng bộ với biến VERSION trong maf-engine.js).</summary>
    public static string Version => "2.0.0";

    /// <summary>Toàn bộ mã nguồn engine JavaScript.</summary>
    public static string Load()
    {
        if (_cache != null) return _cache;

        var asm = Assembly.GetExecutingAssembly();
        var names = asm.GetManifestResourceNames();

        string? match = null;
        foreach (var n in names)
        {
            if (string.Equals(n, ResourceName, StringComparison.OrdinalIgnoreCase)) { match = n; break; }
        }
        if (match == null)
        {
            foreach (var n in names)
            {
                if (n.EndsWith(ResourceName, StringComparison.OrdinalIgnoreCase)) { match = n; break; }
            }
        }

        if (match == null)
        {
            throw new InvalidOperationException(
                "Không tìm thấy tài nguyên nhúng '" + ResourceName + "'.\r\n" +
                "Kiểm tra MedicalAutoFillTool.csproj phải có:\r\n" +
                "  <EmbeddedResource Include=\"..\\Shared\\maf-engine.js\" ... />");
        }

        using var stream = asm.GetManifestResourceStream(match)
            ?? throw new InvalidOperationException("Không mở được tài nguyên nhúng " + match);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        _cache = reader.ReadToEnd();

        if (_cache.Length < 1000)
            throw new InvalidOperationException("File engine nhúng có vẻ bị hỏng (chỉ " + _cache.Length + " byte).");

        return _cache;
    }

    /// <summary>
    /// Bọc engine + lệnh nạp cấu hình thành 1 đoạn script hoàn chỉnh.
    /// Dùng cho cả AddScriptToExecuteOnDocumentCreatedAsync (chạy ở MỌI lần tải trang)
    /// lẫn ExecuteScriptAsync (áp ngay cho trang đang mở).
    /// </summary>
    public static string BuildBootstrap(AppConfig config)
    {
        var configJson = AppJson.SerializeForScript(config);
        return Load() + "\n;try{window.MAF&&window.MAF.configure(" + configJson + ");}catch(e){console.error('[MAF] configure lỗi',e);}\n";
    }
}
