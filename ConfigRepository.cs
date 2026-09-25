using System.Text.Json;

namespace MedicalAutoFillTool;

/// <summary>Đọc/ghi file cấu hình JSON. Tự tạo file mẫu khi chưa tồn tại.</summary>
public static class ConfigRepository
{
    /// <summary>Đường dẫn file cấu hình (nằm trong thư mục config/ cạnh file .exe).</summary>
    public static string ConfigPath =>
        Path.Combine(ExeDirectory, "config", "forms.json");

    /// <summary>
    /// Thư mục chứa file .exe thực tế.
    /// QUAN TRỌNG: với bản đóng gói một file, AppContext.BaseDirectory trỏ tới thư mục giải nén
    /// tạm thời (Temp\.net\), không phải nơi đặt .exe. Vì vậy phải dùng đường dẫn exe thật.
    /// </summary>
    private static string ExeDirectory
    {
        get
        {
            try
            {
                var args = Environment.GetCommandLineArgs();
                if (args.Length > 0 && !string.IsNullOrEmpty(args[0]))
                {
                    var dir = Path.GetDirectoryName(Path.GetFullPath(args[0]));
                    if (!string.IsNullOrEmpty(dir)) return dir;
                }
            }
            catch
            {
                // bỏ qua, dùng fallback
            }
            return AppContext.BaseDirectory;
        }
    }

    public static AppConfig Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                var cfg = JsonSerializer.Deserialize<AppConfig>(json, AppJson.Options);
                if (cfg != null) return cfg;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[Config] Không đọc được cấu hình: " + ex.Message);
        }

        // Chưa có / hỏng -> tạo mẫu mặc định và ghi ra để người dùng sửa.
        var fresh = CreateDefault();
        try { Save(fresh); }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine("[Config] Không ghi được cấu hình: " + ex.Message);
        }
        return fresh;
    }

    public static void Save(AppConfig cfg)
    {
        var dir = Path.GetDirectoryName(ConfigPath)!;
        Directory.CreateDirectory(dir);
        File.WriteAllText(ConfigPath, JsonSerializer.Serialize(cfg, AppJson.Options));
    }

    public static AppConfig CreateDefault()
    {
        var cfg = new AppConfig();
        cfg.Forms.Add(BuiltinProfiles.CanLamSang());
        cfg.Forms.Add(BuiltinProfiles.HoSoChung());
        return cfg;
    }
}