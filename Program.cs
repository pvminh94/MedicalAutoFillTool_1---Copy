using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace MedicalAutoFillTool;

internal static class Program
{
    private const string MutexName = "MedicalAutoFillTool_SingleInstance_Mutex";

    private static Mutex? _mutex;
    private static bool _ownsMutex;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    private const int SW_RESTORE = 9;

    [STAThread]
    static void Main()
    {
        // Chỉ cho MỘT bản chạy (2 bản cùng điền sẽ ghi đè nhau trên medinet).
        _mutex = new Mutex(true, MutexName, out _ownsMutex);

        if (!_ownsMutex)
        {
            // Bản cũ chỉ hiện thông báo rồi thoát, người dùng tưởng phần mềm "bị đơ".
            // Nay đưa cửa sổ đang chạy lên trước để họ làm việc tiếp ngay.
            if (!ActivateExistingInstance())
            {
                MessageBox.Show(
                    "Phần mềm đang chạy ở nền (xem thanh taskbar).\r\n" +
                    "Đã thử đưa cửa sổ lên trước cho bạn.",
                    "Medical Auto Fill", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            _mutex.Dispose();
            return;
        }

        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => ReportFatal("Lỗi giao diện", e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => ReportFatal("Lỗi hệ thống", e.ExceptionObject as Exception);

        ApplicationConfiguration.Initialize();

        try
        {
            AppLogger.CleanupOldLogs();
            AppLogger.Info("==== Khởi động Medical Auto Fill ====");
            Application.Run(new Form1());
        }
        finally
        {
            ConfigRepository.StopWatching();
            // CHỈ release khi mình thực sự sở hữu mutex; bản cũ gọi vô điều kiện
            // nên ném ApplicationException lúc thoát ở nhánh "đã chạy sẵn".
            if (_ownsMutex)
            {
                try { _mutex?.ReleaseMutex(); } catch { }
            }
            _mutex?.Dispose();
        }
    }

    private static bool ActivateExistingInstance()
    {
        try
        {
            var me = Process.GetCurrentProcess();
            foreach (var p in Process.GetProcessesByName(me.ProcessName))
            {
                if (p.Id == me.Id) continue;
                var hWnd = p.MainWindowHandle;
                if (hWnd == IntPtr.Zero) continue;
                if (IsIconic(hWnd)) ShowWindow(hWnd, SW_RESTORE);
                ShowWindow(hWnd, SW_RESTORE);
                SetForegroundWindow(hWnd);
                return true;
            }
        }
        catch { }
        return false;
    }

    private static void ReportFatal(string title, Exception? ex)
    {
        AppLogger.Error(title, ex);
        MessageBox.Show(
            title + ":\r\n\r\n" + (ex?.Message ?? "(không rõ)") +
            "\r\n\r\nChi tiết đã ghi vào log:\r\n" + AppPaths.LogFileToday,
            "Medical Auto Fill", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
