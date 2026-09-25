namespace MedicalAutoFillTool;

/// <summary>
/// Mọi đường dẫn của ứng dụng, tập trung một chỗ.
///
/// Điểm quan trọng: khi .exe nằm trong thư mục CHỈ ĐỌC (C:\Program Files, thư mục
/// IIS, ổ mạng) thì không thể ghi config/log, và WebView2 cũng KHÔNG khởi tạo được
/// nếu UserDataFolder không ghi được -> ứng dụng "chạy mà không làm gì".
/// Vì vậy phải tự phát hiện và lùi về %LocalAppData%.
/// </summary>
internal static class AppPaths
{
    private static string? _exeDir;
    private static string? _dataDir;

    /// <summary>Thư mục chứa file .exe THẬT (đúng cả khi publish 1 file: AppContext.BaseDirectory
    /// khi đó trỏ tới thư mục giải nén tạm trong Temp\.net\).</summary>
    public static string ExeDirectory
    {
        get
        {
            if (_exeDir != null) return _exeDir;
            try
            {
                var args = Environment.GetCommandLineArgs();
                if (args.Length > 0 && !string.IsNullOrEmpty(args[0]))
                {
                    var dir = Path.GetDirectoryName(Path.GetFullPath(args[0]));
                    if (!string.IsNullOrEmpty(dir)) { _exeDir = dir; return _exeDir; }
                }
            }
            catch { /* dùng fallback */ }
            _exeDir = AppContext.BaseDirectory;
            return _exeDir;
        }
    }

    public static string LocalAppData =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MedicalAutoFillTool");

    /// <summary>Thư mục ghi được: cạnh .exe nếu ghi được, ngược lại %LocalAppData%.</summary>
    public static string DataDirectory
    {
        get
        {
            if (_dataDir != null) return _dataDir;
            var candidates = new[] { ExeDirectory, LocalAppData };
            foreach (var dir in candidates)
            {
                try
                {
                    Directory.CreateDirectory(dir);
                    var probe = Path.Combine(dir, ".maf-write-test");
                    File.WriteAllText(probe, "ok");
                    File.Delete(probe);
                    _dataDir = dir;
                    return _dataDir;
                }
                catch { /* thử chỗ kế tiếp */ }
            }
            _dataDir = Path.GetTempPath();
            return _dataDir;
        }
    }

    /// <summary>
    /// True = "chế độ portable": dữ liệu (config, log) nằm NGAY CẠNH file .exe,
    /// tiện cho USB/chạy không cần cài. False = thư mục exe không ghi được
    /// (thường do để trong Program Files) nên phải dùng %LocalAppData%\MedicalAutoFillTool.
    /// </summary>
    public static bool IsPortableMode => DataDirectory == ExeDirectory;

    public static string ConfigDirectory => Path.Combine(DataDirectory, "config");
    public static string ConfigFile => Path.Combine(ConfigDirectory, "forms.json");
    public static string LogDirectory => Path.Combine(DataDirectory, "logs");

    /// <summary>
    /// Thư mục dữ liệu người dùng của WebView2 (cache, cookie, phiên đăng nhập medinet).
    /// PHẢI nằm ở nơi ghi được và CỐ ĐỊNH, nếu không mỗi lần chạy lại phải đăng nhập lại,
    /// hoặc tệ hơn là WebView2 không khởi tạo được khi chạy từ Program Files/IIS.
    /// </summary>
    public static string WebView2UserDataFolder
    {
        get
        {
            var dir = Path.Combine(LocalAppData, "WebView2");
            try { Directory.CreateDirectory(dir); } catch { dir = Path.Combine(Path.GetTempPath(), "MedicalAutoFillTool-WebView2"); }
            return dir;
        }
    }

    public static string LogFileToday => Path.Combine(LogDirectory, $"maf-{DateTime.Now:yyyyMMdd}.log");
}
