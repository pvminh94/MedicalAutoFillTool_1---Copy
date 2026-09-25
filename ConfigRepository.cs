using System.Text;
using System.Text.Json;

namespace MedicalAutoFillTool;

/// <summary>
/// Đọc/ghi file cấu hình JSON một cách AN TOÀN:
///  • ghi tạm rồi mới thay thế (đang ghi mà mất điện/crash thì không hỏng file cũ)
///  • luôn giữ 1 bản .bak để khôi phục
///  • file hỏng thì tự phục hồi từ .bak, không bắt người dùng xoá tay
///  • tự nâng cấp cấu hình cũ (thêm HeaderNames) mà không mất mapping đã khai
///  • theo dõi file để áp dụng ngay khi người dùng sửa tay bằng Notepad
/// </summary>
public static class ConfigRepository
{
    private static readonly object Gate = new();
    private static DateTime _lastSelfWrite = DateTime.MinValue;
    private static FileSystemWatcher? _watcher;
    private static System.Timers.Timer? _debounce;

    /// <summary>Đường dẫn file cấu hình đang dùng.</summary>
    public static string ConfigPath => AppPaths.ConfigFile;
    public static string BackupPath => AppPaths.ConfigFile + ".bak";

    /// <summary>Bắn ra khi cấu hình thay đổi từ BÊN NGOÀI (người dùng sửa file tay).</summary>
    public static event Action<AppConfig>? ExternalChange;

    public static AppConfig Load()
    {
        lock (Gate)
        {
            var cfg = TryLoadFile(ConfigPath);
            if (cfg == null)
            {
                AppLogger.Warn("Không đọc được " + ConfigPath + " — thử bản sao lưu .bak");
                cfg = TryLoadFile(BackupPath);
            }
            if (cfg == null)
            {
                var fresh = CreateDefault();
                TrySave(fresh, out _);
                return fresh;
            }

            if (Migrate(cfg))
            {
                AppLogger.Info("Đã nâng cấp cấu hình lên phiên bản " + cfg.ConfigVersion);
                TrySave(cfg, out _);
            }
            return cfg;
        }
    }

    private static AppConfig? TryLoadFile(string path)
    {
        try
        {
            if (!File.Exists(path)) return null;
            var json = File.ReadAllText(path, Encoding.UTF8);
            if (string.IsNullOrWhiteSpace(json)) return null;
            return JsonSerializer.Deserialize<AppConfig>(json, AppJson.Options);
        }
        catch (Exception ex)
        {
            AppLogger.Error("Đọc cấu hình thất bại: " + path, ex);
            return null;
        }
    }

    /// <summary>
    /// Nâng cấp cấu hình cũ lên định dạng mới. Trả về true nếu có thay đổi (cần ghi lại).
    /// </summary>
    private static bool Migrate(AppConfig cfg)
    {
        bool changed = false;

        if (cfg.Options == null) { cfg.Options = new EngineOptions(); changed = true; }

        foreach (var form in cfg.Forms)
        {
            foreach (var f in form.Fields)
            {
                // Bản cũ không có HeaderNames: lấy nhãn làm tên cột để khớp tiêu đề Excel.
                if ((f.HeaderNames == null || f.HeaderNames.Length == 0) && f.Labels.Length > 0)
                {
                    f.HeaderNames = (string[])f.Labels.Clone();
                    changed = true;
                }
                f.HeaderNames ??= Array.Empty<string>();
                if (string.IsNullOrEmpty(f.ControlType)) { f.ControlType = "text"; changed = true; }
                // Bản cũ dùng "auto"? giữ nguyên; chỉ sửa rỗng.
            }
        }

        // Bản cũ chỉ có "tab"/"comma"; nay thêm "auto".
        if (string.IsNullOrEmpty(cfg.PasteMode)) { cfg.PasteMode = "auto"; changed = true; }

        if (cfg.ConfigVersion < 2) { cfg.ConfigVersion = 2; changed = true; }
        return changed;
    }

    public static void Save(AppConfig cfg)
    {
        if (!TrySave(cfg, out var error))
            throw new IOException(error ?? "Không ghi được file cấu hình.");
    }

    /// <summary>Ghi an toàn; trả về false kèm thông điệp lỗi thay vì ném (để UI tự quyết).</summary>
    public static bool TrySave(AppConfig cfg, out string? error)
    {
        error = null;
        lock (Gate)
        {
            try
            {
                Directory.CreateDirectory(AppPaths.ConfigDirectory);
                var json = JsonSerializer.Serialize(cfg, AppJson.Options);
                var tmp = ConfigPath + ".tmp";
                // UTF8 không BOM: một số công cụ đọc JSON khó chịu với BOM.
                File.WriteAllText(tmp, json, new UTF8Encoding(false));

                if (File.Exists(ConfigPath))
                {
                    try { File.Copy(ConfigPath, BackupPath, true); } catch { /* không chết vì backup */ }
                    try
                    {
                        File.Replace(tmp, ConfigPath, null);
                    }
                    catch
                    {
                        // File.Replace thất bại (khác volume / bị khoá) -> xoá rồi move.
                        File.Delete(ConfigPath);
                        File.Move(tmp, ConfigPath);
                    }
                }
                else
                {
                    File.Move(tmp, ConfigPath);
                }

                _lastSelfWrite = DateTime.Now;
                AppLogger.Info("Đã lưu cấu hình: " + ConfigPath + " (" + cfg.Forms.Count + " form)");
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                AppLogger.Error("Lưu cấu hình thất bại", ex);
                return false;
            }
        }
    }

    public static AppConfig CreateDefault()
    {
        var cfg = new AppConfig();
        cfg.Forms.Add(BuiltinProfiles.CanLamSang());
        cfg.Forms.Add(BuiltinProfiles.HoSoChung());
        cfg.ConfigVersion = 2;
        return cfg;
    }

    /// <summary>
    /// Theo dõi file cấu hình để áp dụng ngay khi người dùng sửa tay.
    /// Bỏ qua thay đổi do chính phần mềm ghi ra (tránh vòng lặp).
    /// </summary>
    public static void StartWatching()
    {
        if (_watcher != null) return;
        try
        {
            Directory.CreateDirectory(AppPaths.ConfigDirectory);
            _watcher = new FileSystemWatcher(AppPaths.ConfigDirectory, Path.GetFileName(ConfigPath))
            {
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.CreationTime,
                EnableRaisingEvents = true
            };

            _debounce = new System.Timers.Timer(500) { AutoReset = false };
            _debounce.Elapsed += (_, _) =>
            {
                if ((DateTime.Now - _lastSelfWrite).TotalMilliseconds < 1200) return;
                var cfg = TryLoadFile(ConfigPath);
                if (cfg == null) return;
                Migrate(cfg);
                AppLogger.Info("Phát hiện cấu hình được sửa từ bên ngoài — áp dụng lại.");
                try { ExternalChange?.Invoke(cfg); } catch (Exception ex) { AppLogger.Error("Áp dụng cấu hình mới thất bại", ex); }
            };

            FileSystemEventHandler onChanged = (_, _) =>
            {
                try { _debounce?.Stop(); _debounce?.Start(); } catch { }
            };
            _watcher.Changed += onChanged;
            _watcher.Created += onChanged;
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Không theo dõi được file cấu hình: " + ex.Message);
        }
    }

    public static void StopWatching()
    {
        try
        {
            if (_watcher != null) { _watcher.EnableRaisingEvents = false; _watcher.Dispose(); _watcher = null; }
            _debounce?.Dispose();
            _debounce = null;
        }
        catch { }
    }

    /// <summary>Xuất cấu hình ra file do người dùng chọn (dùng trong Cài đặt).</summary>
    public static bool Export(AppConfig cfg, string path, out string? error)
    {
        error = null;
        try
        {
            File.WriteAllText(path, JsonSerializer.Serialize(cfg, AppJson.Options), new UTF8Encoding(false));
            return true;
        }
        catch (Exception ex) { error = ex.Message; return false; }
    }

    /// <summary>Nhập cấu hình từ file. Trả về null nếu file không đọc được.</summary>
    public static AppConfig? Import(string path, out string? error)
    {
        error = null;
        try
        {
            var cfg = JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(path, Encoding.UTF8), AppJson.Options);
            if (cfg == null) { error = "File không chứa cấu hình hợp lệ."; return null; }
            Migrate(cfg);
            return cfg;
        }
        catch (Exception ex) { error = ex.Message; return null; }
    }
}
