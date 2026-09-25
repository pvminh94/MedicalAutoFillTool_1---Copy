using System.Text;

namespace MedicalAutoFillTool;

public enum LogLevel { Debug = 0, Info = 1, Warn = 2, Error = 3 }

/// <summary>
/// Ghi log ra file + giữ vòng lặp trong bộ nhớ để hiện trên giao diện.
///
/// Rất cần cho ca "nhiều lúc bị lỗi": không có log thì không thể biết lần đó
/// clipboard bị giữ, engine không nhận diện được form, hay ô nhập bị đổi tên.
/// </summary>
public static class AppLogger
{
    private static readonly object Gate = new();
    private static readonly LinkedList<string> Ring = new();
    private const int RingCapacity = 500;

    public static LogLevel MinLevel { get; set; } = LogLevel.Info;
    public static bool Enabled { get; set; } = true;

    public static void Debug(string msg) => Write(LogLevel.Debug, msg);
    public static void Info(string msg) => Write(LogLevel.Info, msg);
    public static void Warn(string msg) => Write(LogLevel.Warn, msg);
    public static void Error(string msg, Exception? ex = null)
        => Write(LogLevel.Error, ex == null ? msg : msg + " | " + ex.GetType().Name + ": " + ex.Message);

    /// <summary>Toàn bộ log đang giữ trong bộ nhớ (mới nhất ở cuối).</summary>
    public static string[] Recent()
    {
        lock (Gate) return Ring.ToArray();
    }

    public static void Clear()
    {
        lock (Gate) Ring.Clear();
    }

    private static void Write(LogLevel level, string msg)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{level,-5}] {msg}";

        lock (Gate)
        {
            Ring.AddLast(line);
            while (Ring.Count > RingCapacity) Ring.RemoveFirst();
        }

        if (!Enabled || level < MinLevel) return;

        try
        {
            Directory.CreateDirectory(AppPaths.LogDirectory);
            File.AppendAllText(AppPaths.LogFileToday, line + Environment.NewLine, Encoding.UTF8);
        }
        catch
        {
            // Không bao giờ để việc ghi log làm hỏng nghiệp vụ chính.
        }
    }

    /// <summary>Xoá log cũ hơn số ngày giữ lại (mặc định 14 ngày) để không phình ổ đĩa.</summary>
    public static void CleanupOldLogs(int keepDays = 14)
    {
        try
        {
            if (!Directory.Exists(AppPaths.LogDirectory)) return;
            var cutoff = DateTime.Now.AddDays(-keepDays);
            foreach (var f in Directory.GetFiles(AppPaths.LogDirectory, "maf-*.log"))
            {
                try
                {
                    if (File.GetLastWriteTime(f) < cutoff) File.Delete(f);
                }
                catch { /* bỏ qua file đang bị khoá */ }
            }
        }
        catch { }
    }
}
