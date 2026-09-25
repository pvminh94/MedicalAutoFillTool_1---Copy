using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MedinetBridge;

// =============================================================================
//  MEDINET BRIDGE — chạy trên MÁY CHỦ, giữ phiên đăng nhập medinet trong WebView2
//  và nhận lệnh điền từ web app (http://127.0.0.1:5119).
//
//  NHỮNG LỖI CỦA BẢN CŨ ĐÃ SỬA:
//   1. BỎ QUA CẤU HÌNH: bản cũ nhận `script` từ web nhưng vứt đi, tự sinh script
//      với bộ nhãn hardcode (makcb, hoten, glucose...) trong khi cấu hình thật là
//      form xét nghiệm (Số lượng HC, Huyết sắc tố...) => paste được mà không điền.
//      Nay dùng chung Shared/maf-engine.js và nhận mapping từ request.
//   2. CHẶN LUỒNG: HttpListener xử lý tuần tự + tcs.Task.Wait(10s) => request thứ 2
//      phải chờ 10 giây. Nay accept loop async + xử lý song song, chỉ tuần tự hoá
//      riêng thao tác điền (vì WebView2 là UI thread).
//   3. WebView2 không có UserDataFolder => chạy từ Program Files/IIS là init fail,
//      và mỗi lần chạy lại phải đăng nhập lại medinet.
//   4. Không CORS => trình duyệt không gọi thẳng bridge được.
//   5. currentScript chỉ giữ 1 lệnh, race condition, chỉ chạy ở NavigationCompleted
//      đầu tiên => lệnh gửi lúc khởi động bị mất. Nay có hàng đợi + retry.
//   6. Không có timeout hợp lý, không báo cáo chi tiết, không log.
// =============================================================================

/// <summary>Cấu hình bridge, đọc từ biến môi trường / tham số dòng lệnh.</summary>
internal static class BridgeConfig
{
    public static int Port { get; private set; } = 5119;
    public static string StartUrl { get; private set; } = "https://quanlyskcd.medinet.org.vn/account/login";
    public static string Token { get; private set; } = "";
    public static string AllowedOrigin { get; private set; } = "*";
    public static int FillTimeoutSeconds { get; private set; } = 45;
    public static string UserDataFolder { get; private set; } = "";

    public static void Load(string[] args)
    {
        Port = IntArg(args, "--port", EnvInt("MAF_BRIDGE_PORT", 5119));
        StartUrl = StrArg(args, "--url", Env("MAF_BRIDGE_URL", StartUrl));
        Token = StrArg(args, "--token", Env("MAF_BRIDGE_TOKEN", ""));
        AllowedOrigin = StrArg(args, "--origin", Env("MAF_BRIDGE_ORIGIN", "*"));
        FillTimeoutSeconds = IntArg(args, "--timeout", EnvInt("MAF_BRIDGE_TIMEOUT", 45));

        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        UserDataFolder = StrArg(args, "--userdata", Env("MAF_BRIDGE_USERDATA",
            Path.Combine(local, "MedinetBridge", "WebView2")));
        try { Directory.CreateDirectory(UserDataFolder); }
        catch
        {
            // Không ghi được (chạy dưới tài khoản bị hạn chế) -> lùi về temp,
            // thà mất phiên đăng nhập còn hơn bridge không khởi động được.
            UserDataFolder = Path.Combine(Path.GetTempPath(), "MedinetBridge-WebView2");
            Directory.CreateDirectory(UserDataFolder);
        }
    }

    private static string Env(string k, string d) => string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(k)) ? d : Environment.GetEnvironmentVariable(k)!;
    private static int EnvInt(string k, int d) => int.TryParse(Environment.GetEnvironmentVariable(k), out var v) ? v : d;

    private static string StrArg(string[] args, string name, string d)
    {
        foreach (var a in args)
            if (a.StartsWith(name + "=", StringComparison.OrdinalIgnoreCase))
                return a.Substring(name.Length + 1);
        return d;
    }

    private static int IntArg(string[] args, string name, int d)
        => int.TryParse(StrArg(args, name, d.ToString()), out var v) ? v : d;
}

/// <summary>Một trường mapping (web app gửi xuống từ CSDL của nó).</summary>
internal sealed class FieldDto
{
    [JsonPropertyName("excelIndex")] public int ExcelIndex { get; set; }
    [JsonPropertyName("labels")] public List<string> Labels { get; set; } = new();
    [JsonPropertyName("headerNames")] public List<string>? HeaderNames { get; set; }
    [JsonPropertyName("selector")] public string? Selector { get; set; }
    [JsonPropertyName("controlType")] public string? ControlType { get; set; }
    [JsonPropertyName("required")] public bool Required { get; set; }
    [JsonPropertyName("transform")] public string? Transform { get; set; }
}

/// <summary>
/// Lệnh điền. Chấp nhận cả định dạng MỚI (rows/fields) và định dạng CŨ (data/script)
/// để web app bản cũ chưa nâng cấp vẫn gọi được.
/// </summary>
internal sealed class FillRequest
{
    [JsonPropertyName("rows")] public List<List<string>>? Rows { get; set; }
    [JsonPropertyName("data")] public List<List<string>>? Data { get; set; }          // tương thích ngược
    [JsonPropertyName("headers")] public List<string>? Headers { get; set; }          // tương thích ngược
    [JsonPropertyName("headerRow")] public List<string>? HeaderRow { get; set; }
    [JsonPropertyName("fields")] public List<FieldDto>? Fields { get; set; }
    [JsonPropertyName("rowIndexes")] public List<int>? RowIndexes { get; set; }
    [JsonPropertyName("rowIndex")] public int? RowIndex { get; set; }
    [JsonPropertyName("dryRun")] public bool DryRun { get; set; }
    [JsonPropertyName("formName")] public string? FormName { get; set; }
    [JsonPropertyName("script")] public string? Script { get; set; }                  // bản cũ gửi, nay bỏ qua

    public List<List<string>> EffectiveRows => Rows ?? Data ?? new List<List<string>>();

    /// <summary>Dòng tiêu đề: ưu tiên headerRow, kế đến headers (bản cũ gửi tên cột).</summary>
    public List<string>? EffectiveHeader =>
        (HeaderRow != null && HeaderRow.Count > 0) ? HeaderRow
        : (Headers != null && Headers.Count > 0 && !Headers[0].StartsWith("Column")) ? Headers
        : null;
}

internal static class Program
{
    private static WebView2? _webView;
    private static Form _mainForm = null!;
    private static NotifyIcon? _tray;
    private static HttpListener? _listener;
    private static bool _coreReady;
    private static string _currentUrl = "";

    /// <summary>Engine JS dùng chung — nhúng vào assembly, KHÔNG chép tay logic điền.</summary>
    private static string _engineJs = "";

    /// <summary>Đang chờ kết quả điền từ engine (mỗi lần chỉ 1 lệnh).</summary>
    private static TaskCompletionSource<string>? _pending;
    private static readonly SemaphoreSlim FillGate = new(1, 1);

    /// <summary>Lệnh điền đến trước khi WebView2 sẵn sàng -> giữ lại để chạy khi tải xong.</summary>
    private static readonly Queue<(FillRequest req, TaskCompletionSource<string> tcs)> _startupQueue = new();

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    [STAThread]
    static void Main(string[] args)
    {
        BridgeConfig.Load(args);

        Log("=== Medical Auto Fill — Medinet Bridge ===");
        Log($"Engine dùng chung: {EngineInfo.Version}");
        Log($"UserDataFolder : {BridgeConfig.UserDataFolder}");
        Log($"Trang mở đầu  : {BridgeConfig.StartUrl}");
        if (string.IsNullOrEmpty(BridgeConfig.Token))
            Log("⚠ Chưa đặt token (MAF_BRIDGE_TOKEN). Bridge chỉ nghe 127.0.0.1 nên vẫn an toàn tương đối,");
        if (string.IsNullOrEmpty(BridgeConfig.Token))
            Log("  nhưng bất kỳ tiến trình nào trên máy chủ này cũng ra lệnh điền được.");

        try
        {
            _engineJs = EngineInfo.LoadEngine();
        }
        catch (Exception ex)
        {
            Log("❌ KHÔNG NẠP ĐƯỢC ENGINE: " + ex.Message);
            Log("   Bridge sẽ không điền được. Kiểm tra EmbeddedResource trong MedinetBridge.csproj.");
        }

        // HTTP chạy nền, không chặn luồng UI.
        _ = Task.Run(RunHttpServerAsync);

        ApplicationConfiguration.Initialize();

        _mainForm = new Form
        {
            Text = "Medical Auto Fill Bridge",
            Width = 1280,
            Height = 860,
            WindowState = FormWindowState.Minimized,
            ShowInTaskbar = true,
            FormBorderStyle = FormBorderStyle.Sizable,
            StartPosition = FormStartPosition.CenterScreen
        };

        _webView = new WebView2 { Dock = DockStyle.Fill };
        _mainForm.Controls.Add(_webView);

        BuildTrayIcon();
        _mainForm.Load += async (_, _) => await InitWebViewAsync();
        _mainForm.FormClosed += (_, _) => { try { _tray?.Dispose(); } catch { } };

        Application.Run(_mainForm);
    }

    // ---------------------------------------------------------------- WebView2
    private static async Task InitWebViewAsync()
    {
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, BridgeConfig.UserDataFolder, new CoreWebView2EnvironmentOptions());
            await _webView!.EnsureCoreWebView2Async(env);
            var core = _webView.CoreWebView2;

            core.Settings.AreDevToolsEnabled = true;              // cần để dò mapping khi có sự cố
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.AreBrowserAcceleratorKeysEnabled = true;
            core.Settings.IsPasswordAutosaveEnabled = true;       // nhớ mật khẩu medinet
            core.Settings.IsWebMessageEnabled = true;             // bắt buộc để nhận kết quả điền
            core.Settings.IsGeneralAutofillEnabled = false;

            if (!string.IsNullOrEmpty(_engineJs))
                await core.AddScriptToExecuteOnDocumentCreatedAsync(_engineJs);

            core.WebMessageReceived += Core_WebMessageReceived;
            core.NavigationCompleted += Core_NavigationCompleted;
            core.SourceChanged += (_, _) => { _currentUrl = Safe(core.Source); };
            core.PermissionRequested += (_, e) => { e.State = CoreWebView2PermissionState.Allow; e.Handled = true; };
            core.ProcessFailed += Core_ProcessFailed;

            _coreReady = true;
            _currentUrl = Safe(core.Source);
            Log("WebView2 sẵn sàng.");

            core.Navigate(BridgeConfig.StartUrl);
        }
        catch (Exception ex)
        {
            _coreReady = false;
            Log("❌ Khởi tạo WebView2 thất bại: " + ex.Message);
            Log("   Nếu máy chưa có 'Microsoft Edge WebView2 Runtime':");
            Log("   https://developer.microsoft.com/microsoft-edge/webview2/");
            MessageBox.Show(
                "Không khởi động được WebView2.\r\n\r\n" + ex.Message +
                "\r\n\r\nNguyên nhân thường gặp: máy chưa cài 'Microsoft Edge WebView2 Runtime'.\r\n" +
                "Tải tại: https://developer.microsoft.com/microsoft-edge/webview2/\r\n\r\n" +
                "Bridge vẫn đang nghe cổng " + BridgeConfig.Port + " và sẽ báo lỗi rõ ràng cho web app.",
                "Medinet Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void Core_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        _currentUrl = Safe(_webView?.CoreWebView2?.Source);
        Log("Đã tải: " + _currentUrl + (e.IsSuccess ? "" : " (LỖI " + e.WebErrorStatus + ")"));

        // Chạy các lệnh điền đã xếp hàng lúc bridge mới khởi động.
        // Bản cũ chỉ giữ ĐÚNG 1 lệnh và chỉ chạy ở lần NavigationCompleted đầu tiên,
        // nên lệnh gửi sớm bị mất trắng.
        if (_startupQueue.Count == 0) return;
        var pending = _startupQueue.ToList();
        _startupQueue.Clear();
        _ = Task.Run(async () =>
        {
            foreach (var (req, tcs) in pending)
            {
                try { await ExecuteFillAsync(req, tcs); }
                catch (Exception ex) { tcs.TrySetResult(FailJson("Lỗi khi điền lệnh chờ: " + ex.Message)); }
            }
        });
    }

    private static void Core_ProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        Log("⚠ WebView2 ProcessFailed: " + e.ProcessFailedKind);
        if (e.ProcessFailedKind is CoreWebView2ProcessFailedKind.RenderProcessExited
            or CoreWebView2ProcessFailedKind.BrowserProcessExited
            or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
        {
            _coreReady = false;
            _mainForm.BeginInvoke(new Action(async () =>
            {
                try
                {
                    var old = _webView;
                    _webView = null;
                    // CoreWebView2 không có Dispose(); Dispose control là đủ.
                    try { old?.Dispose(); } catch { }
                    _webView = new WebView2 { Dock = DockStyle.Fill };
                    _mainForm.Controls.Add(_webView);
                    await InitWebViewAsync();
                    Log("✅ Đã tự khôi phục WebView2.");
                }
                catch (Exception ex) { Log("❌ Khôi phục WebView2 thất bại: " + ex.Message); }
            }));
        }
    }

    private static void Core_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try { raw = e.TryGetWebMessageAsString(); }
        catch { raw = e.WebMessageAsJson ?? ""; }
        if (string.IsNullOrWhiteSpace(raw)) return;

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : "";
            if (type != "maf:result") return;
            if (!root.TryGetProperty("payload", out var payload)) return;

            var payloadJson = payload.GetRawText();
            var tcs = _pending;
            if (tcs != null) { _pending = null; tcs.TrySetResult(payloadJson); }
            else Log("Kết quả điền về nhưng không có lệnh nào đang chờ (timeout trước đó?): " + Short(payloadJson));
        }
        catch (Exception ex)
        {
            Log("Không đọc được thông điệp engine: " + ex.Message);
        }
    }

    // ---------------------------------------------------------------- HTTP
    private static async Task RunHttpServerAsync()
    {
        try
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://127.0.0.1:{BridgeConfig.Port}/");
            _listener.Start();
            Log($"HTTP đang nghe tại http://127.0.0.1:{BridgeConfig.Port}/");

            while (true)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync(); }
                catch (Exception ex) { Log("GetContext lỗi: " + ex.Message); await Task.Delay(500); continue; }

                // Xử lý song song: accept loop KHÔNG BAO GIỜ bị chặn bởi 1 lệnh điền chậm.
                _ = Task.Run(() => HandleAsync(ctx));
            }
        }
        catch (HttpListenerException ex)
        {
            Log($"❌ Không mở được cổng {BridgeConfig.Port}: {ex.Message}");
            Log("   Có thể bridge đang chạy sẵn một bản khác, hoặc cần quyền admin cho HttpListener.");
        }
        catch (Exception ex)
        {
            Log("❌ HTTP server chết: " + ex.Message);
        }
    }

    private static async Task HandleAsync(HttpListenerContext ctx)
    {
        var req = ctx.Request;
        var resp = ctx.Response;
        var path = (req.Url?.AbsolutePath ?? "/").TrimEnd('/');
        if (path.Length == 0) path = "/";

        try
        {
            AddCors(resp);

            // Preflight
            if (string.Equals(req.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
            {
                resp.StatusCode = 204;
                return;
            }

            if (!CheckToken(req))
            {
                await WriteJsonAsync(resp, 401, new { success = false, message = "Sai hoặc thiếu token (header X-MAF-Token)." });
                return;
            }

            switch (path)
            {
                case "/":
                case "/status":
                    await WriteJsonAsync(resp, 200, StatusObject());
                    break;

                case "/health":
                    await WriteJsonAsync(resp, 200, new { status = _coreReady ? "ok" : "degraded", webView2 = _coreReady });
                    break;

                case "/fill" when req.HttpMethod == "POST":
                    await HandleFillAsync(req, resp);
                    break;

                case "/selectno" when req.HttpMethod == "POST":
                    await RunScriptAndWaitAsync(BuildSelectNo(), resp, "select-no");
                    break;

                case "/scan":
                    await HandleScanAsync(req, resp);
                    break;

                case "/reload" when req.HttpMethod == "POST":
                    await OnUiAsync(async () => { _webView?.CoreWebView2?.Reload(); await Task.CompletedTask; });
                    await WriteJsonAsync(resp, 200, new { success = true, message = "Đã yêu cầu tải lại trang medinet." });
                    break;

                default:
                    await WriteJsonAsync(resp, 404, new { success = false, message = "Không có endpoint " + path });
                    break;
            }
        }
        catch (Exception ex)
        {
            Log($"Lỗi xử lý {req.HttpMethod} {path}: {ex.Message}");
            try { await WriteJsonAsync(resp, 500, new { success = false, message = "Bridge lỗi: " + ex.Message }); }
            catch { }
        }
        finally
        {
            try { resp.OutputStream.Close(); } catch { }
        }
    }

    private static object StatusObject() => new
    {
        status = _coreReady ? "running" : "webview2-not-ready",
        bridge = "MedinetBridge",
        engine = EngineInfo.Version,
        url = _currentUrl,
        timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
        queuedFills = _startupQueue.Count,
        message = _coreReady ? "Bridge sẵn sàng nhận lệnh điền." : "WebView2 chưa sẵn sàng — lệnh điền sẽ được xếp hàng và chạy khi trang tải xong."
    };

    private static async Task HandleFillAsync(HttpListenerRequest req, HttpListenerResponse resp)
    {
        var body = await ReadBodyAsync(req);
        FillRequest? fillReq;
        try
        {
            fillReq = JsonSerializer.Deserialize<FillRequest>(body, Json);
        }
        catch (Exception ex)
        {
            await WriteJsonAsync(resp, 400, new { success = false, message = "JSON không hợp lệ: " + ex.Message });
            return;
        }

        if (fillReq == null || fillReq.EffectiveRows.Count == 0)
        {
            await WriteJsonAsync(resp, 400, new { success = false, message = "Không có dữ liệu (rows/data rỗng)." });
            return;
        }

        Log($"Nhận lệnh điền: {fillReq.EffectiveRows.Count} dòng" +
            (fillReq.Fields != null ? $", {fillReq.Fields.Count} trường mapping" : ", KHÔNG kèm mapping") +
            (fillReq.DryRun ? " [DRY-RUN]" : ""));

        if (fillReq.Fields == null || fillReq.Fields.Count == 0)
            Log("⚠ Request không có 'fields': engine sẽ tự nhận diện form theo URL. " +
                "Nếu web app của bạn là bản cũ, hãy nâng cấp để gửi mapping từ CSDL.");

        var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);

        if (!_coreReady || _webView?.CoreWebView2 == null)
        {
            // Xếp hàng thay vì trả lỗi: người dùng dán ngay sau khi khởi động bridge là chuyện thường.
            _startupQueue.Enqueue((fillReq, tcs));
            Log("WebView2 chưa sẵn sàng — đã xếp hàng (" + _startupQueue.Count + " lệnh chờ).");
            var done = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(BridgeConfig.FillTimeoutSeconds)));
            if (done != tcs.Task)
            {
                Dequeue(fillReq);
                await WriteJsonAsync(resp, 200, new
                {
                    success = false,
                    queued = true,
                    message = "Medinet trong bridge chưa tải xong. Hãy đăng nhập medinet trong cửa sổ Bridge rồi gửi lại."
                });
                return;
            }
            await WriteJsonAsync(resp, 200, Wrap(tcs.Task.Result, true));
            return;
        }

        await ExecuteFillAsync(fillReq, tcs);
        var result = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(BridgeConfig.FillTimeoutSeconds)));
        if (result != tcs.Task)
        {
            Log("⏱ Hết thời gian chờ kết quả điền (" + BridgeConfig.FillTimeoutSeconds + "s).");
            await WriteJsonAsync(resp, 200, new
            {
                success = false,
                timeout = true,
                message = $"Bridge đã gửi lệnh nhưng không nhận được báo cáo trong {BridgeConfig.FillTimeoutSeconds}s. " +
                          "Có thể form medinet chưa mở hoặc trang đang tải. Hãy mở đúng form cần điền rồi thử lại."
            });
            return;
        }

        var payload = tcs.Task.Result;
        bool ok = IsSuccess(payload);
        await WriteJsonAsync(resp, 200, Wrap(payload, ok));
    }

    private static object Wrap(string payloadJson, bool ok)
    {
        // Ghép báo cáo chi tiết của engine vào phản hồi để web app hiện cho người dùng.
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            var root = doc.RootElement.Clone();
            var message = root.TryGetProperty("message", out var m) ? m.GetString() : (ok ? "Đã gửi lệnh điền." : "Điền không thành công.");
            return new { success = ok, message, report = root };
        }
        catch
        {
            return new { success = ok, message = ok ? "Đã gửi lệnh điền." : "Điền không thành công." };
        }
    }

    private static bool IsSuccess(string payloadJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            var root = doc.RootElement;
            if (root.TryGetProperty("error", out var err) && err.ValueKind != JsonValueKind.Null && !string.IsNullOrEmpty(err.GetString()))
                return false;
            if (root.TryGetProperty("dryRun", out _)) return true;
            var okCount = root.TryGetProperty("ok", out var ok) ? ok.GetInt32() : 0;
            var failed = root.TryGetProperty("failed", out var f) && f.ValueKind == JsonValueKind.Array ? f.GetArrayLength() : 0;
            return okCount > 0 && failed == 0;
        }
        catch { return false; }
    }

    /// <summary>Thực sự gửi lệnh điền sang WebView2 và chờ engine báo về.</summary>
    private static async Task ExecuteFillAsync(FillRequest req, TaskCompletionSource<string> tcs)
    {
        await FillGate.WaitAsync();
        try
        {
            if (_webView?.CoreWebView2 == null)
            {
                tcs.TrySetResult(FailJson("WebView2 chưa sẵn sàng."));
                return;
            }

            _pending = tcs;
            var script = BuildFillScript(req);
            await OnUiAsync(async () => { await _webView.CoreWebView2.ExecuteScriptAsync(script); });
        }
        catch (Exception ex)
        {
            _pending = null;
            tcs.TrySetResult(FailJson("Không gửi được lệnh sang trang: " + ex.Message));
        }
        finally
        {
            FillGate.Release();
        }
    }

    private static void Dequeue(FillRequest req)
    {
        var items = _startupQueue.ToList();
        _startupQueue.Clear();
        foreach (var it in items) if (!ReferenceEquals(it.req, req)) _startupQueue.Enqueue(it);
    }

    private static async Task RunScriptAndWaitAsync(string script, HttpListenerResponse resp, string expectType)
    {
        if (_webView?.CoreWebView2 == null)
        {
            await WriteJsonAsync(resp, 200, new { success = false, message = "WebView2 chưa sẵn sàng." });
            return;
        }
        try
        {
            await OnUiAsync(async () => { await _webView.CoreWebView2.ExecuteScriptAsync(script); });
            await WriteJsonAsync(resp, 200, new { success = true, message = "Đã gửi lệnh " + expectType + "." });
        }
        catch (Exception ex)
        {
            await WriteJsonAsync(resp, 200, new { success = false, message = ex.Message });
        }
    }

    private static async Task HandleScanAsync(HttpListenerRequest req, HttpListenerResponse resp)
    {
        if (_webView?.CoreWebView2 == null)
        {
            await WriteJsonAsync(resp, 200, new { success = false, message = "WebView2 chưa sẵn sàng." });
            return;
        }
        var filter = req.QueryString["filter"];
        var arg = string.IsNullOrEmpty(filter) ? "{}" : JsonSerializer.Serialize(new { filter });
        var script = "(function(){ try { return window.MAF ? JSON.stringify(window.MAF.scan(" + arg + ")) : '{\"error\":\"engine chua nap\"}'; } catch(e){ return '{\"error\":\"scan fail\"}'; } })()";

        try
        {
            string raw = "";
            await OnUiAsync(async () => { raw = await _webView.CoreWebView2.ExecuteScriptAsync(script); });

            // ExecuteScriptAsync trả về JSON của kết quả; script trả về chuỗi => phải gỡ 1 lớp.
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "null" : raw);
            var inner = doc.RootElement.ValueKind == JsonValueKind.String ? doc.RootElement.GetString() : raw;
            resp.ContentType = "application/json; charset=utf-8";
            var buf = Encoding.UTF8.GetBytes(inner ?? "{}");
            resp.ContentLength64 = buf.Length;
            await resp.OutputStream.WriteAsync(buf);
        }
        catch (Exception ex)
        {
            await WriteJsonAsync(resp, 200, new { success = false, message = "Quét trang thất bại: " + ex.Message });
        }
    }

    // ---------------------------------------------------------------- Sinh script
    /// <summary>
    /// Dựng lệnh gọi engine. CHỈ là lớp bọc: mọi logic tìm ô/ghi giá trị nằm trong
    /// Shared/maf-engine.js (đã có 48 test jsdom). Bản cũ tự sinh cả bộ logic ở đây
    /// nên lệch hoàn toàn với cấu hình trên web.
    /// </summary>
    private static string BuildFillScript(FillRequest req)
    {
        var payload = new
        {
            rows = req.EffectiveRows,
            headerRow = req.EffectiveHeader,
            rowIndex = req.RowIndex,
            rowIndexes = req.RowIndexes,
            fields = req.Fields,
            formId = req.FormName,
            dryRun = req.DryRun
        };
        return Invoke("fill", JsonSerializer.Serialize(payload, Json));
    }

    private static string BuildSelectNo() => Invoke("selectAllNo", "{}");

    private static string Invoke(string fn, string payloadJson)
    {
        return "(function(){ try {" +
               "  if(!window.MAF){ Post({error:'engine-not-loaded',message:'Engine chưa được nạp vào trang. Hãy tải lại trang medinet trong Bridge.'}); return; }" +
               "  var r = window.MAF." + fn + "(" + payloadJson + ");" +
               "  if(r && r.then){ r.catch(function(err){ Post({error:String(err&&err.message||err),message:'Lỗi: '+String(err&&err.message||err)}); }); }" +
               "} catch(e){ Post({error:String(e&&e.message||e),message:'Lỗi khi gọi engine: '+String(e&&e.message||e)}); }" +
               " function Post(p){ try{ if(window.chrome&&chrome.webview){ chrome.webview.postMessage(JSON.stringify({type:'maf:result',payload:p})); } }catch(_){} } })();";
    }

    private static string FailJson(string message)
        => JsonSerializer.Serialize(new { error = "bridge", message }, Json);

    // ---------------------------------------------------------------- Tiện ích
    private static void AddCors(HttpListenerResponse resp)
    {
        resp.Headers["Access-Control-Allow-Origin"] = BridgeConfig.AllowedOrigin;
        resp.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        resp.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-MAF-Token";
        resp.Headers["Access-Control-Max-Age"] = "86400";
    }

    private static bool CheckToken(HttpListenerRequest req)
    {
        if (string.IsNullOrEmpty(BridgeConfig.Token)) return true;
        var got = req.Headers["X-MAF-Token"] ?? req.QueryString["token"] ?? "";
        return string.Equals(got, BridgeConfig.Token, StringComparison.Ordinal);
    }

    private static async Task<string> ReadBodyAsync(HttpListenerRequest req)
    {
        var enc = req.ContentEncoding ?? Encoding.UTF8;
        using var reader = new StreamReader(req.InputStream, enc);
        // Giới hạn 32MB: đủ cho vài chục nghìn dòng xét nghiệm, chặn payload vô lý.
        const int max = 32 * 1024 * 1024;
        var sb = new StringBuilder();
        var buf = new char[8192];
        int read;
        while ((read = await reader.ReadAsync(buf, 0, buf.Length)) > 0)
        {
            sb.Append(buf, 0, read);
            if (sb.Length > max) throw new InvalidOperationException("Dữ liệu gửi lên quá lớn (>32MB).");
        }
        return sb.ToString();
    }

    private static async Task WriteJsonAsync(HttpListenerResponse resp, int status, object obj)
    {
        resp.StatusCode = status;
        resp.ContentType = "application/json; charset=utf-8";
        var buf = JsonSerializer.SerializeToUtf8Bytes(obj, Json);
        resp.ContentLength64 = buf.Length;
        await resp.OutputStream.WriteAsync(buf);
    }

    /// <summary>Chạy một tác vụ trên luồng UI của WebView2 và chờ xong (không block).</summary>
    private static Task OnUiAsync(Func<Task> action)
    {
        var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            _mainForm.BeginInvoke(new Action(async () =>
            {
                try { await action(); tcs.TrySetResult(true); }
                catch (Exception ex) { tcs.TrySetException(ex); }
            }));
        }
        catch (Exception ex)
        {
            tcs.TrySetException(ex);
        }
        return tcs.Task;
    }

    private static string Safe(string? s) => s ?? "";
    private static string Short(string s) => s.Length <= 200 ? s : s.Substring(0, 200) + "...";

    private static void Log(string msg)
    {
        var line = $"{DateTime.Now:HH:mm:ss} {msg}";
        Console.WriteLine(line);
        try
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MedinetBridge");
            Directory.CreateDirectory(dir);
            File.AppendAllText(Path.Combine(dir, $"bridge-{DateTime.Now:yyyyMMdd}.log"), line + Environment.NewLine, Encoding.UTF8);
        }
        catch { }
    }

    private static void BuildTrayIcon()
    {
        try
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Hiện cửa sổ Bridge", null, (_, _) => ShowWindow());
            menu.Items.Add("Mở lại trang medinet", null, (_, _) =>
            {
                try { _webView?.CoreWebView2?.Navigate(BridgeConfig.StartUrl); } catch { }
                ShowWindow();
            });
            menu.Items.Add("Trạng thái", null, (_, _) =>
            {
                MessageBox.Show(
                    $"WebView2 : {(_coreReady ? "sẵn sàng" : "CHƯA sẵn sàng")}\r\n" +
                    $"Trang    : {_currentUrl}\r\n" +
                    $"HTTP     : http://127.0.0.1:{BridgeConfig.Port}/\r\n" +
                    $"Engine   : {EngineInfo.Version}\r\n" +
                    $"Lệnh chờ : {_startupQueue.Count}",
                    "Trạng thái Bridge", MessageBoxButtons.OK, MessageBoxIcon.Information);
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Thoát", null, (_, _) => Application.Exit());

            _tray = new NotifyIcon
            {
                Icon = System.Drawing.SystemIcons.Application,
                Text = "Medinet Bridge — cổng " + BridgeConfig.Port,
                Visible = true,
                ContextMenuStrip = menu
            };
            _tray.DoubleClick += (_, _) => ShowWindow();
        }
        catch (Exception ex)
        {
            Log("Không tạo được icon khay hệ thống: " + ex.Message);
        }
    }

    private static void ShowWindow()
    {
        try
        {
            _mainForm.WindowState = FormWindowState.Normal;
            _mainForm.Show();
            _mainForm.BringToFront();
            _mainForm.Activate();
        }
        catch { }
    }
}

/// <summary>Nạp engine JS nhúng (cùng file Shared/maf-engine.js với bản WinForms).</summary>
internal static class EngineInfo
{
    private const string ResourceName = "maf-engine.js";
    public static string Version => "2.0.0";

    public static string LoadEngine()
    {
        var asm = System.Reflection.Assembly.GetExecutingAssembly();
        string? match = null;
        foreach (var n in asm.GetManifestResourceNames())
        {
            if (string.Equals(n, ResourceName, StringComparison.OrdinalIgnoreCase) ||
                n.EndsWith(ResourceName, StringComparison.OrdinalIgnoreCase)) { match = n; break; }
        }
        if (match == null)
            throw new InvalidOperationException("Không tìm thấy tài nguyên nhúng '" + ResourceName + "' trong MedinetBridge.");

        using var stream = asm.GetManifestResourceStream(match)!;
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
