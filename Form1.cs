using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MedicalAutoFillTool;

/// <summary>
/// Cửa sổ chính: trình duyệt nhúng WebView2 mở medinet + thanh công cụ + bảng dữ liệu dán.
///
/// NHỮNG THAY ĐỔI LỚN so với bản cũ (đều nhằm vào lỗi "copy paste lúc được lúc không"):
///  1. Đọc clipboard BẰNG C# (ClipboardService, có retry) thay vì trông chờ
///     navigator.clipboard.readText() trong trang — API đó cần HTTPS + quyền,
///     và bị tiến trình khác giữ clipboard là ném lỗi ngay.
///  2. UserDataFolder cố định ở %LocalAppData% — chạy từ Program Files/IIS/ổ mạng
///     vẫn khởi tạo được WebView2 và giữ phiên đăng nhập medinet.
///  3. Tự khôi phục khi tiến trình render của WebView2 chết (ProcessFailed):
///     trước đây trang trắng xoá, phải tắt phần mềm mở lại.
///  4. Tự cho phép các quyền trình duyệt xin (PermissionRequested) — không còn
///     hộp thoại chặn giữa chừng làm mất thao tác dán.
///  5. Bảng xem trước dữ liệu dán: thấy ngay mấy dòng/mấy cột, có tiêu đề không,
///     cột nào khớp trường nào; sửa tay được trước khi điền.
///  6. Khớp cột theo TÊN (header) chứ không theo vị trí cố định.
///  7. Báo cáo chi tiết từng trường: OK / không thấy ô / ghi lỗi / thiếu dữ liệu.
///  8. Ghi log ra file để truy lại đúng lần bị lỗi.
/// </summary>
public partial class Form1 : Form
{
    private WebView2? _webView;
    private ToolStrip _nav = new();
    private ToolStripTextBox _txtAddress = new();
    private ToolStripComboBox _cmbForm = new();
    private StatusStrip _statusStrip = new();
    private ToolStripStatusLabel _lblStatus = new();
    private ToolStripStatusLabel _lblEngine = new();
    private ToolStripProgressBar _progress = new();
    private PastePanel _pastePanel = new();

    private AppConfig _config = new();
    private ParsedTable? _table;
    private string? _engineJs;
    private bool _coreReady;
    private bool _recovering;
    private bool _busy;
    private int _queueTotal;
    private int _queueDone;
    private int _queueOk;

    // ---------------------------------------------------------------- Khởi tạo
    public Form1()
    {
        InitializeComponent();
        LoadConfig();
        SetupLayout();
        _ = InitializeWebViewAsync();
    }

    private void LoadConfig()
    {
        try
        {
            _config = ConfigRepository.Load();
        }
        catch (Exception ex)
        {
            AppLogger.Error("Không đọc được cấu hình, dùng mặc định", ex);
            _config = ConfigRepository.CreateDefault();
        }

        AppLogger.Enabled = _config.LogToFile;
        AppLogger.MinLevel = _config.Options.Debug ? LogLevel.Debug : LogLevel.Info;
        AppLogger.Info($"Cấu hình: {_config.Forms.Count} form, engine {EngineScript.Version}, " +
                       $"thư mục dữ liệu: {AppPaths.DataDirectory} (portable={AppPaths.IsPortableMode})");

        // Người dùng sửa file config bằng Notepad -> áp dụng ngay, không cần khởi động lại.
        ConfigRepository.ExternalChange += cfg =>
        {
            if (IsDisposed) return;
            BeginInvoke(new Action(() =>
            {
                _config = cfg;
                RefreshFormCombo();
                SetStatus("🔁 Cấu hình được cập nhật từ file — áp dụng ngay.");
                _ = ApplyConfigToPageAsync();
            }));
        };
        ConfigRepository.StartWatching();
    }

    private void SetupLayout()
    {
        Text = "Medical Auto Fill Tool";
        WindowState = FormWindowState.Maximized;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 600);

        // WebView2 thêm TRƯỚC (index 0) để dock Fill được xử lý CUỐI, không che các thanh.
        _webView = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(_webView);

        _pastePanel.Dock = DockStyle.Bottom;
        _pastePanel.Height = 240;
        _pastePanel.Visible = false;
        WirePastePanel();
        Controls.Add(_pastePanel);

        BuildStatusStrip();
        Controls.Add(_statusStrip);

        BuildNavBar();
        Controls.Add(_nav);
    }

    private void BuildNavBar()
    {
        _nav = new ToolStrip
        {
            Dock = DockStyle.Top,
            GripStyle = ToolStripGripStyle.Hidden,
            BackColor = Color.FromArgb(41, 49, 66),
            ForeColor = Color.White,
            RenderMode = ToolStripRenderMode.Professional,
            AutoSize = false,
            Height = 40,
            Padding = new Padding(4, 3, 4, 3),
            ImageScalingSize = new Size(18, 18)
        };

        var btnHome = NavButton("🏠 Trang chủ", "Về trang đăng nhập medinet");
        btnHome.Click += (_, _) => NavigateHome();

        var btnReload = NavButton("⟳ Tải lại", "Tải lại trang (F5) — dùng khi form không nhận dữ liệu");
        btnReload.Click += (_, _) => ReloadPage();

        _txtAddress = new ToolStripTextBox
        {
            Spring = true,          // chiếm phần rộng còn lại của thanh
            Width = 300,
            BorderStyle = BorderStyle.FixedSingle,
            ForeColor = Color.White,
            BackColor = Color.FromArgb(58, 70, 92),
            ToolTipText = "Nhập địa chỉ rồi bấm Enter"
        };
        _txtAddress.KeyDown += (_, e) =>
        {
            if (e.KeyCode != Keys.Enter) return;
            e.SuppressKeyPress = true;
            var url = _txtAddress.Text.Trim();
            if (url.Length == 0) return;
            Navigate(url.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? url : "https://" + url);
        };

        _cmbForm = new ToolStripComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = 210,
            ToolTipText = "Form đang áp dụng. Mặc định tự nhận diện theo URL; chọn tay nếu web đổi địa chỉ."
        };
        _cmbForm.SelectedIndexChanged += (_, _) => OnFormSelectionChanged();

        var btnPaste = NavButton("📋 Dán", "Đọc dữ liệu vừa copy từ Excel (Ctrl+Shift+V)");
        btnPaste.Font = new Font(_nav.Font, FontStyle.Bold);
        btnPaste.Click += (_, _) => PasteFromClipboard(showPanel: true, fillImmediately: false);

        var btnFill = NavButton("▶ Điền", "Điền dòng đang chọn lên medinet (Ctrl+Enter)");
        btnFill.ForeColor = Color.FromArgb(180, 255, 200);
        btnFill.Click += (_, _) => FillSelectedRow(dryRun: false);

        var btnFillAll = NavButton("⏭ Tất cả", "Điền lần lượt mọi dòng trong bảng");
        btnFillAll.Click += (_, _) => FillAllRows();

        var btnDry = NavButton("🧪 Kiểm tra", "Chỉ kiểm tra mapping, KHÔNG ghi (F10)");
        btnDry.Click += (_, _) => FillSelectedRow(dryRun: true);

        var btnNo = NavButton("☑ Chọn 'Không'", "Tích hàng loạt các mục 'Không' (Ctrl+B)");
        btnNo.Click += (_, _) => SelectAllNo();

        var btnPanel = NavButton("▤ Bảng dữ liệu", "Ẩn/hiện bảng dữ liệu đã dán (F7)");
        btnPanel.Click += (_, _) => TogglePastePanel();

        var btnSettings = NavButton("⚙ Cài đặt", "Ánh xạ cột Excel với nhãn trên web (Ctrl+Shift+S)");
        btnSettings.Click += (_, _) => OpenSettings();

        var btnLog = NavButton("📜 Log", "Xem nhật ký hoạt động — dùng khi cần báo lỗi (Ctrl+Shift+L)");
        btnLog.Click += (_, _) => ShowLogDialog();

        _nav.Items.Add(btnHome);
        _nav.Items.Add(btnReload);
        _nav.Items.Add(_txtAddress);
        _nav.Items.Add(new ToolStripSeparator());
        _nav.Items.Add(_cmbForm);
        _nav.Items.Add(new ToolStripSeparator());
        _nav.Items.Add(btnPaste);
        _nav.Items.Add(btnFill);
        _nav.Items.Add(btnFillAll);
        _nav.Items.Add(btnDry);
        _nav.Items.Add(btnNo);
        _nav.Items.Add(new ToolStripSeparator());
        _nav.Items.Add(btnPanel);
        _nav.Items.Add(btnSettings);
        _nav.Items.Add(btnLog);

        RefreshFormCombo();
    }

    private ToolStripButton NavButton(string text, string tooltip)
    {
        return new ToolStripButton(text)
        {
            DisplayStyle = ToolStripItemDisplayStyle.Text,
            ForeColor = Color.White,
            ToolTipText = tooltip,
            Margin = new Padding(2, 1, 2, 1),
            Padding = new Padding(4, 2, 4, 2)
        };
    }

    private void BuildStatusStrip()
    {
        _statusStrip = new StatusStrip { SizingGrip = false, BackColor = Color.FromArgb(245, 246, 249) };

        _lblStatus = new ToolStripStatusLabel
        {
            Text = "⏳ Đang khởi động trình duyệt nhúng...",
            Spring = true,
            TextAlign = ContentAlignment.MiddleLeft
        };
        _progress = new ToolStripProgressBar
        {
            Style = ProgressBarStyle.Continuous,
            Visible = false,
            Width = 140,
            Minimum = 0,
            Maximum = 100
        };
        _lblEngine = new ToolStripStatusLabel
        {
            Text = "engine " + EngineScript.Version,
            ForeColor = Color.Gray,
            BorderSides = ToolStripStatusLabelBorderSides.Left
        };

        _statusStrip.Items.Add(_lblStatus);
        _statusStrip.Items.Add(_progress);
        _statusStrip.Items.Add(_lblEngine);
    }

    private void WirePastePanel()
    {
        _pastePanel.PasteRequested += () => PasteFromClipboard(showPanel: true, fillImmediately: false);
        _pastePanel.FillRequested += i => FillRow(i, dryRun: false);
        _pastePanel.FillAllRequested += list => FillQueue(list);
        _pastePanel.DryRunRequested += i => FillRow(i, dryRun: true);
        _pastePanel.ClearRequested += () => { _table = null; _pastePanel.Clear(); SetStatus("Đã xoá dữ liệu trong bảng."); };
        _pastePanel.DetailRequested += ShowReportDialog;
    }

    // ------------------------------------------------------------- WebView2
    private async Task InitializeWebViewAsync()
    {
        if (_webView == null) return;
        try
        {
            SetStatus("⏳ Đang chuẩn hoá môi trường WebView2...");

            // UserDataFolder PHẢI ghi được: bản cũ không truyền tham số này nên khi
            // .exe nằm trong Program Files/IIS, WebView2 không khởi tạo được và
            // cửa sổ cứ trắng (người dùng chỉ thấy "phần mềm không chạy").
            var env = await CoreWebView2Environment.CreateAsync(
                null, AppPaths.WebView2UserDataFolder, new CoreWebView2EnvironmentOptions());

            await _webView.EnsureCoreWebView2Async(env);
            var core = _webView.CoreWebView2;
            if (core == null) throw new InvalidOperationException("Không lấy được CoreWebView2 sau khi khởi tạo.");

            core.Settings.AreDevToolsEnabled = _config.AllowDevTools;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.AreBrowserAcceleratorKeysEnabled = true;
            core.Settings.IsPasswordAutosaveEnabled = true;      // nhớ mật khẩu medinet
            core.Settings.IsGeneralAutofillEnabled = false;      // không để trình duyệt tự điền đè lên engine
            core.Settings.IsStatusBarEnabled = true;
            core.Settings.IsWebMessageEnabled = true;            // bắt buộc để engine báo kết quả về C#
            core.Settings.IsZoomControlEnabled = true;

            // Nạp engine vào MỌI trang (kể cả sau khi điều hướng nội bộ).
            // Chỉ nạp engine, KHÔNG kèm cấu hình: cấu hình được nạp lại ở
            // NavigationCompleted nên đổi mapping xong là có hiệu lực ngay.
            _engineJs ??= EngineScript.Load();
            await core.AddScriptToExecuteOnDocumentCreatedAsync(_engineJs);

            core.NavigationCompleted += Core_NavigationCompleted;
            core.SourceChanged += (_, _) => UpdateAddressBar();
            core.WebMessageReceived += Core_WebMessageReceived;
            core.PermissionRequested += Core_PermissionRequested;
            core.AcceleratorKeyPressed += Core_AcceleratorKeyPressed;
            core.NewWindowRequested += Core_NewWindowRequested;
            core.ProcessFailed += Core_ProcessFailed;
            core.DocumentTitleChanged += (_, _) => UpdateAddressBar();

            // Trang medinet có thể nhúng form trong iframe khác origin: nạp engine
            // vào từng frame ngay khi nó được tạo (cùng origin thì engine tự quét).
            core.FrameCreated += Core_FrameCreated;

            _coreReady = true;
            AppLogger.Info("WebView2 sẵn sàng. UserDataFolder=" + AppPaths.WebView2UserDataFolder);

            if (_config.OpenDevToolsOnStart && _config.AllowDevTools)
            {
                try { core.OpenDevToolsWindow(); } catch { }
            }

            NavigateHome();
        }
        catch (Exception ex)
        {
            _coreReady = false;
            AppLogger.Error("Khởi tạo WebView2 thất bại", ex);
            HandleWebViewInitFailure(ex);
        }
    }

    /// <summary>Báo lỗi khởi tạo bằng tiếng người, kèm cách xử lý (thiếu WebView2 Runtime là ca hay gặp).</summary>
    private void HandleWebViewInitFailure(Exception ex)
    {
        var msg = ex.Message ?? "";
        bool missingRuntime =
            msg.IndexOf("WebView2", StringComparison.OrdinalIgnoreCase) >= 0 ||
            msg.IndexOf("Runtime", StringComparison.OrdinalIgnoreCase) >= 0 ||
            ex.HResult == unchecked((int)0x80070002) ||   // ERROR_FILE_NOT_FOUND
            ex is DllNotFoundException || ex is FileNotFoundException;

        var sb = new StringBuilder();
        sb.AppendLine("Không khởi động được trình duyệt nhúng WebView2.");
        sb.AppendLine();
        if (missingRuntime)
        {
            sb.AppendLine("Nguyên nhân thường gặp: máy chưa cài 'Microsoft Edge WebView2 Runtime'.");
            sb.AppendLine("Cách xử lý: bấm Có để mở trang tải chính thức của Microsoft,");
            sb.AppendLine("tải bản 'Evergreen Standalone Installer' (x64) rồi cài đặt.");
        }
        else
        {
            sb.AppendLine("Chi tiết: " + msg);
        }
        sb.AppendLine();
        sb.AppendLine("Nếu đã cài Runtime mà vẫn lỗi, thử chạy phần mềm bằng quyền Administrator");
        sb.AppendLine("một lần (để tạo thư mục dữ liệu), hoặc xoá thư mục:");
        sb.AppendLine(AppPaths.WebView2UserDataFolder);
        sb.AppendLine();
        sb.AppendLine("Log: " + AppPaths.LogFileToday);

        var result = MessageBox.Show(sb.ToString(), "Lỗi khởi tạo WebView2",
            missingRuntime ? MessageBoxButtons.YesNo : MessageBoxButtons.OK,
            MessageBoxIcon.Error);

        if (result == DialogResult.Yes)
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "https://developer.microsoft.com/microsoft-edge/webview2/",
                    UseShellExecute = true
                });
            }
            catch { }
        }

        SetStatus("❌ WebView2 không khởi động được. Xem chi tiết trong log.");
    }

    /// <summary>
    /// WebView2 chết tiến trình render (hay xảy ra khi máy thiếu RAM / driver đồ hoạ cũ):
    /// trang trắng xoá nhưng phần mềm vẫn "đang chạy". Bản cũ không xử lý nên người dùng
    /// phải tự tắt mở lại. Nay tự dựng lại WebView2 và quay về đúng trang đang xem.
    /// </summary>
    private void Core_ProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        var kind = e.ProcessFailedKind;
        AppLogger.Error("WebView2 ProcessFailed: " + kind);

        if (kind == CoreWebView2ProcessFailedKind.RenderProcessExited ||
            kind == CoreWebView2ProcessFailedKind.BrowserProcessExited ||
            kind == CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
        {
            if (IsDisposed) return;
            BeginInvoke(new Action(async () =>
            {
                try { await RecoverWebViewAsync(); }
                catch (Exception ex) { AppLogger.Error("Khôi phục WebView2 thất bại", ex); }
            }));
        }
        else
        {
            SetStatus("⚠ Một khung trang bị lỗi (" + kind + ") — thử tải lại trang (F5).");
        }
    }

    private async Task RecoverWebViewAsync()
    {
        if (_recovering) return;
        _recovering = true;
        try
        {
            var lastUrl = SafeSource();
            SetStatus("⚠ Trình duyệt nhúng bị treo — đang tự khôi phục...");
            AppLogger.Warn("Đang tự khôi phục WebView2. URL gần nhất: " + lastUrl);

            var old = _webView;
            _webView = null;
            _coreReady = false;

            if (old != null)
            {
                try { old.CoreWebView2?.Dispose(); } catch { }
                try { old.Dispose(); } catch { }
                try { Controls.Remove(old); } catch { }
            }

            _webView = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(_webView);
            Controls.SetChildIndex(_webView, 0);   // Fill phải ở đầu danh sách để không che thanh

            await InitializeWebViewAsync();

            if (!string.IsNullOrEmpty(lastUrl) && lastUrl != _config.DefaultUrl)
                Navigate(lastUrl!);

            SetStatus("✅ Đã khôi phục trình duyệt nhúng.");
            Toast("✅ Đã tự khôi phục trình duyệt nhúng", false);
        }
        finally
        {
            _recovering = false;
        }
    }

    /// <summary>
    /// Tự cho phép quyền mà trang xin (clipboard, tải nhiều file, notification...).
    /// Hộp thoại quyền bật lên giữa lúc dán dữ liệu sẽ làm MẤT thao tác Ctrl+V,
    /// đây là một nguyên nhân "paste không ăn" rất khó đoán.
    /// </summary>
    private void Core_PermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        try
        {
            var origin = e.Uri ?? "";
            AppLogger.Debug("Quyền trang xin: " + e.PermissionKind + " từ " + origin);
            e.State = CoreWebView2PermissionState.Allow;
            e.Handled = true;
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Không xử lý được PermissionRequested: " + ex.Message);
        }
    }

    /// <summary>Cửa sổ bật ra từ trang (medinet hay mở popup) -> mở ngay trong cửa sổ này.</summary>
    private void Core_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        try
        {
            e.Handled = true;
            if (!string.IsNullOrEmpty(e.Uri) && _webView?.CoreWebView2 != null)
                _webView.CoreWebView2.Navigate(e.Uri);
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Không mở được cửa sổ mới: " + ex.Message);
        }
    }

    private void Core_FrameCreated(object? sender, CoreWebView2FrameCreatedEventArgs e)
    {
        try
        {
            var frame = e.Frame;
            if (frame == null || _engineJs == null) return;
            frame.ExecuteScriptAsync(_engineJs).ContinueWith(t =>
            {
                if (t.Exception != null) AppLogger.Debug("Không nạp engine vào frame: " + t.Exception.GetBaseException().Message);
            }, TaskScheduler.Default);
        }
        catch (Exception ex)
        {
            AppLogger.Debug("FrameCreated: " + ex.Message);
        }
    }

    private async void Core_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        var url = SafeSource() ?? "";
        AppLogger.Info("Đã tải trang: " + url + (e.IsSuccess ? "" : " (LỖI: " + e.WebErrorStatus + ")"));

        if (!e.IsSuccess)
        {
            SetStatus("❌ Không tải được trang: " + e.WebErrorStatus + " — kiểm tra mạng/VPN.");
            return;
        }

        await ApplyConfigToPageAsync();

        var form = ResolveActiveForm();
        if (form != null)
        {
            SetStatus($"✅ Sẵn sàng. Form nhận diện được: {form.Name} ({form.Fields.Count} trường). Dán dữ liệu bằng Ctrl+Shift+V.");
            _lblEngine.Text = "engine " + EngineScript.Version + " • " + form.Name;
        }
        else
        {
            SetStatus("✅ Trang đã tải. ⚠ Chưa nhận diện được form nào theo URL này — chọn form tay ở thanh trên, hoặc thêm 'chuỗi URL nhận diện' trong Cài đặt.");
            _lblEngine.Text = "engine " + EngineScript.Version + " • chưa khớp form";
        }

        // Có dữ liệu chờ sẵn (dán trước khi trang tải xong) thì điền tiếp.
        if (_table != null && _pendingFillAfterLoad)
        {
            _pendingFillAfterLoad = false;
            FillSelectedRow(dryRun: false);
        }
    }

    private bool _pendingFillAfterLoad;

    /// <summary>Nạp cấu hình vào engine của trang đang mở và đọc trạng thái về.</summary>
    private async Task ApplyConfigToPageAsync()
    {
        if (!_coreReady || _webView?.CoreWebView2 == null) return;
        try
        {
            await _webView.CoreWebView2.ExecuteScriptAsync(AutoFillScriptBuilder.BuildConfigure(_config));
            var stateJson = await _webView.CoreWebView2.ExecuteScriptAsync(AutoFillScriptBuilder.BuildState());
            ParseEngineState(stateJson);
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Không áp được cấu hình vào trang: " + ex.Message);
        }
    }

    private void ParseEngineState(string? json)
    {
        // Kết quả là chuỗi JSON đã escape 2 lớp -> phải gỡ bằng EngineJson.Unwrap.
        var st = EngineJson.Unwrap<EngineState>(json);
        if (st == null) return;

        if (!string.IsNullOrEmpty(st.EngineVersion) && st.EngineVersion != EngineScript.Version)
            AppLogger.Warn($"Engine trong trang là bản {st.EngineVersion}, khác bản nhúng {EngineScript.Version} — hãy tải lại trang (F5).");
        if (st.Forms == 0)
            AppLogger.Warn("Engine trong trang chưa có form nào — cấu hình chưa được nạp.");
        AppLogger.Debug($"Engine state: form={st.Form ?? "(không)"}, fields={st.Fields}, secure={st.SecureContext}, clipboardApi={st.HasClipboardApi}");
    }

    /// <summary>Chạy script đồng bộ của engine và gỡ JSON kết quả.</summary>
    private async Task<T?> ExecuteJsonAsync<T>(string script) where T : class
    {
        try
        {
            var core = _webView?.CoreWebView2;
            if (core == null) return null;
            var raw = await core.ExecuteScriptAsync(script);
            return EngineJson.Unwrap<T>(raw);
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Không lấy được kết quả từ engine: " + ex.Message);
            return null;
        }
    }

    /// <summary>Công cụ cho hộp thoại Cài đặt mượn: quét trang để lấy selector gợi ý.</summary>
    internal async Task<string?> ScanPageAsync(string? filter)
    {
        if (!_coreReady || _webView?.CoreWebView2 == null) return null;
        return await ExecuteAsyncRaw(AutoFillScriptBuilder.BuildScan(filter));
    }

    private async Task<string?> ExecuteAsyncRaw(string script)
    {
        try
        {
            var core = _webView?.CoreWebView2;
            if (core == null) return null;
            var raw = await core.ExecuteScriptAsync(script);
            // Gỡ 1 lớp escape để trả về JSON thuần cho nơi gọi tự phân tích.
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "null" : raw);
            return doc.RootElement.ValueKind == JsonValueKind.String ? doc.RootElement.GetString() : raw;
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Quét trang thất bại: " + ex.Message);
            return null;
        }
    }

    /// <summary>Nhận mọi thông điệp engine gửi về (kết quả điền, trạng thái, chọn Không).</summary>
    private void Core_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try { raw = e.TryGetWebMessageAsString(); }
        catch
        {
            // Engine post object thay vì string -> lấy JSON thô.
            raw = e.WebMessageAsJson ?? "";
        }
        if (string.IsNullOrWhiteSpace(raw)) return;

        try
        {
            var env = JsonSerializer.Deserialize<EngineEnvelope>(raw, JsonOpts.Loose);
            if (env == null) return;

            switch (env.Type)
            {
                case "maf:result":
                    var report = FillReport.FromEnvelope(raw);
                    OnFillReport(report);
                    break;

                case "maf:ready":
                    AppLogger.Debug("Engine sẵn sàng trong trang.");
                    break;

                case "maf:select-no":
                    var clicked = env.Payload.TryGetProperty("clicked", out var c) ? c.GetInt32() : 0;
                    SetStatus(clicked > 0 ? $"☑ Đã chọn 'Không' cho {clicked} mục." : "⚠ Không tìm thấy mục 'Không' nào để chọn.");
                    Toast(clicked > 0 ? $"☑ Đã chọn 'Không' cho {clicked} mục" : "⚠ Không thấy mục 'Không' nào", clicked == 0);
                    AppLogger.Info("selectAllNo: " + clicked + " mục");
                    break;

                default:
                    AppLogger.Debug("Thông điệp lạ từ engine: " + env.Type);
                    break;
            }
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Không đọc được thông điệp engine: " + ex.Message);
        }
    }

    // ------------------------------------------------------- Phím tắt trong trang
    private void Core_AcceleratorKeyPressed(object? sender, CoreWebView2AcceleratorKeyPressedEventArgs e)
    {
        if (e.KeyEventKind != CoreWebView2KeyEventKind.KeyDown) return;
        var mods = Control.ModifierKeys;
        bool ctrl = (mods & Keys.Control) == Keys.Control;
        bool shift = (mods & Keys.Shift) == Keys.Shift;
        var vk = (Keys)e.VirtualKey;

        // Ctrl+Shift+V : dán từ clipboard hệ thống (đường CHÍNH, luôn chạy)
        if (ctrl && shift && vk == Keys.V)
        {
            e.Handled = true;
            PasteFromClipboard(showPanel: true, fillImmediately: _config.FillImmediatelyAfterPaste);
            return;
        }

        // Ctrl+V thường: chỉ giành quyền nếu người dùng BẬT tùy chọn này.
        // Mặc định KHÔNG chặn, để còn dán chữ bình thường vào ô của medinet.
        if (ctrl && !shift && vk == Keys.V && _config.HijackPlainCtrlV)
        {
            e.Handled = true;
            PasteFromClipboard(showPanel: true, fillImmediately: _config.FillImmediatelyAfterPaste);
            return;
        }

        // Ctrl+Enter : điền dòng đang chọn
        if (ctrl && vk == Keys.Enter)
        {
            e.Handled = true;
            FillSelectedRow(dryRun: false);
            return;
        }

        // Ctrl+B : chọn "Không" hàng loạt
        if (ctrl && vk == Keys.B && _config.Options.EnableSelectNoHotkey)
        {
            e.Handled = true;
            SelectAllNo();
            return;
        }

        switch (vk)
        {
            case Keys.F5:
                e.Handled = true;
                ReloadPage();
                return;
            case Keys.F7:
                e.Handled = true;
                TogglePastePanel();
                return;
            case Keys.F9:
                e.Handled = true;
                FillNextInQueue();
                return;
            case Keys.F10:
                e.Handled = true;
                FillSelectedRow(dryRun: true);
                return;
            case Keys.F12:
                if (_config.AllowDevTools)
                {
                    e.Handled = true;
                    try { _webView?.CoreWebView2?.OpenDevToolsWindow(); } catch { }
                }
                return;
        }
    }

    /// <summary>Phím tắt khi tiêu điểm nằm trên form (không phải trong trang web).</summary>
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.Control | Keys.Shift | Keys.V:
                PasteFromClipboard(showPanel: true, fillImmediately: _config.FillImmediatelyAfterPaste);
                return true;
            case Keys.Control | Keys.Enter:
                FillSelectedRow(dryRun: false);
                return true;
            case Keys.F7:
                TogglePastePanel();
                return true;
            case Keys.F9:
                FillNextInQueue();
                return true;
            case Keys.F10:
                FillSelectedRow(dryRun: true);
                return true;
            case Keys.Control | Keys.Shift | Keys.S:
                OpenSettings();
                return true;
            case Keys.Control | Keys.Shift | Keys.L:
                ShowLogDialog();
                return true;
            case Keys.F12:
                if (_config.AllowDevTools) { try { _webView?.CoreWebView2?.OpenDevToolsWindow(); } catch { } return true; }
                break;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    // ------------------------------------------------------- Nghiệp vụ chính
    /// <summary>
    /// ĐỌC CLIPBOARD BẰNG C# rồi mới đẩy sang trang.
    /// Đây là điểm khác biệt quan trọng nhất so với bản cũ: không phụ thuộc
    /// navigator.clipboard (cần HTTPS + quyền), có retry khi clipboard bị giữ,
    /// và người dùng thấy ngay kết quả trong bảng.
    /// </summary>
    private void PasteFromClipboard(bool showPanel, bool fillImmediately)
    {
        var fields = ActiveFields();
        if (fields.Count == 0)
        {
            WarnNoMapping();
            return;
        }

        var (clip, table) = ClipboardService.ReadTable(fields, DelimiterFromConfig());

        if (!clip.Ok)
        {
            var detail = clip.Error ?? "Không đọc được clipboard.";
            SetStatus("❌ " + detail);
            Toast("❌ " + detail, true);
            AppLogger.Warn("Đọc clipboard thất bại sau " + clip.Attempts + " lần thử: " + detail);
            MessageBox.Show(
                detail + "\r\n\r\nĐã thử " + clip.Attempts + " lần trong " + clip.ElapsedMs + " ms.\r\n" +
                "Gợi ý:\r\n" +
                "• Bôi đen vùng dữ liệu trong Excel rồi bấm Ctrl+C lại.\r\n" +
                "• Nếu đang dùng phần mềm clipboard/Unikey, thử tắt tạm.\r\n" +
                "• Chi tiết trong log: " + AppPaths.LogFileToday,
                "Không đọc được clipboard", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (table.IsEmpty)
        {
            SetStatus("⚠ Clipboard có nội dung nhưng không phải dữ liệu bảng.");
            Toast("⚠ Không phải dữ liệu bảng từ Excel", true);
            return;
        }

        _table = table;
        AppLogger.Info($"Dán: {table.RowCount} dòng × {table.ColCount} cột, phân cách '{ShowDelim(table.Delimiter)}', " +
                       $"tiêu đề={(table.HasHeader ? "dòng " + (table.HeaderRowIndex + 1) : "không")}, " +
                       $"đọc clipboard hết {clip.ElapsedMs}ms/{clip.Attempts} lần thử");

        if (showPanel) ShowPastePanel(true);
        _pastePanel.SetTable(table, fields);
        _pastePanel.ClearReport();

        var form = ResolveActiveForm();
        SetStatus($"📋 Đã dán {table.RowCount - (table.HasHeader ? 1 : 0)} dòng dữ liệu" +
                  (form != null ? $" cho form '{form.Name}'" : "") +
                  ". Bấm ▶ Điền (Ctrl+Enter) hoặc ▶ Điền tất cả.");

        if (fillImmediately) FillSelectedRow(dryRun: false);
    }

    private static string ShowDelim(char d) => d switch { '\t' => "TAB", ';' => ";", ',' => ",", _ => d.ToString() };

    private char? DelimiterFromConfig()
    {
        return (_config.PasteMode ?? "auto").ToLowerInvariant() switch
        {
            "tab" => '\t',
            "comma" => ',',
            "semicolon" or "semi" => ';',
            _ => null       // auto: tự phát hiện
        };
    }

    /// <summary>Danh sách trường đang áp dụng (theo form chọn tay hoặc tự nhận diện theo URL).</summary>
    private List<FieldMapping> ActiveFields()
    {
        var form = SelectedForm() ?? ResolveActiveForm();
        if (form != null) return form.Fields;
        // Chỉ có đúng 1 form thì dùng luôn, đừng bắt người dùng chọn.
        if (_config.Forms.Count == 1) return _config.Forms[0].Fields;
        return new List<FieldMapping>();
    }

    /// <summary>Form người dùng chọn tay ở thanh công cụ ("Tự nhận diện" = null).</summary>
    private FormProfile? SelectedForm()
    {
        if (_cmbForm.SelectedIndex <= 0) return null;
        var i = _cmbForm.SelectedIndex - 1;
        return i < _config.Forms.Count ? _config.Forms[i] : null;
    }

    private FormProfile? ResolveActiveForm()
    {
        var url = SafeSource() ?? "";
        if (url.Length == 0) return null;

        FormProfile? best = null;
        int bestLen = -1;
        foreach (var f in _config.Forms)
        {
            if (!string.IsNullOrEmpty(f.UrlContains) &&
                url.IndexOf(f.UrlContains, StringComparison.OrdinalIgnoreCase) >= 0 &&
                f.UrlContains.Length > bestLen)
            {
                best = f;
                bestLen = f.UrlContains.Length;
            }
        }
        return best;
    }

    private void RefreshFormCombo()
    {
        var keep = _cmbForm.SelectedIndex;
        _cmbForm.Items.Clear();
        _cmbForm.Items.Add("🔎 Tự nhận diện theo URL");
        foreach (var f in _config.Forms) _cmbForm.Items.Add(f.Name);
        _cmbForm.SelectedIndex = keep >= 0 && keep < _cmbForm.Items.Count ? keep : 0;
    }

    private void OnFormSelectionChanged()
    {
        if (_table != null) _pastePanel.SetTable(_table, ActiveFields());
        var f = SelectedForm();
        SetStatus(f != null
            ? $"Đang dùng form '{f.Name}' ({f.Fields.Count} trường) — bỏ qua nhận diện theo URL."
            : "Đang tự nhận diện form theo URL.");
    }

    private void FillSelectedRow(bool dryRun)
    {
        if (_table == null || _table.IsEmpty)
        {
            SetStatus("⚠ Chưa có dữ liệu. Copy trong Excel rồi bấm 📋 Dán (Ctrl+Shift+V).");
            Toast("⚠ Chưa có dữ liệu — bấm 📋 Dán", true);
            return;
        }
        FillRow(_pastePanel.SelectedDataRowIndex, dryRun);
    }

    private void FillRow(int rowIndex, bool dryRun)
    {
        if (_busy) { SetStatus("⏳ Đang điền, chờ chút..."); return; }
        if (_table == null || _table.IsEmpty) return;

        var fields = ActiveFields();
        if (fields.Count == 0) { WarnNoMapping(); return; }

        if (!_coreReady || _webView?.CoreWebView2 == null)
        {
            SetStatus("❌ Trang chưa sẵn sàng. Chờ medinet tải xong hoặc bấm ⟳ Tải lại.");
            Toast("❌ Trang chưa sẵn sàng", true);
            return;
        }

        if (rowIndex < 0 || rowIndex >= _table.RowCount)
        {
            SetStatus("⚠ Dòng chọn không hợp lệ.");
            return;
        }

        var payload = new FillPayload
        {
            Rows = _table.Rows,
            HeaderRow = _table.HeaderRow,
            RowIndex = rowIndex,
            Fields = fields,
            FormId = (SelectedForm() ?? ResolveActiveForm())?.Name,
            DryRun = dryRun,
            ReadyTimeoutMs = _config.Options.ReadyTimeoutMs
        };

        _busy = true;
        _queueTotal = 1; _queueDone = 0; _queueOk = 0;
        _pastePanel.SetBusy(true);
        _progress.Visible = true;
        _progress.Value = 0;
        SetStatus(dryRun ? "🧪 Đang kiểm tra mapping (không ghi dữ liệu)..." : $"▶ Đang điền dòng {rowIndex + 1}...");
        AppLogger.Info((dryRun ? "DryRun" : "Fill") + $" dòng {rowIndex + 1}, {fields.Count} trường");

        _ = ExecuteAsync(AutoFillScriptBuilder.BuildFill(payload));
    }

    private void FillAllRows()
    {
        if (_table == null || _table.IsEmpty) { SetStatus("⚠ Chưa có dữ liệu."); return; }
        if (!_config.EnableRowQueue)
        {
            SetStatus("⚠ Điền hàng loạt đang tắt trong cấu hình.");
            return;
        }
        var list = new List<int>();
        for (int r = _table.FirstDataRow; r < _table.RowCount; r++) list.Add(r);
        if (list.Count == 0) { SetStatus("⚠ Không có dòng dữ liệu nào (chỉ có dòng tiêu đề?)."); return; }
        FillQueue(list);
    }

    /// <summary>
    /// Điền lần lượt từng dòng. KHÔNG gửi hết một lượt: mỗi bệnh nhân thường phải
    /// mở/lưu một phiếu riêng, nên điền xong dòng nào phần mềm dừng lại dòng đó
    /// để người dùng kiểm tra rồi bấm F9 sang dòng kế.
    /// </summary>
    private void FillQueue(List<int> rowIndexes)
    {
        if (rowIndexes == null || rowIndexes.Count == 0) return;
        _queue = rowIndexes;
        _queuePos = 0;
        _queueTotal = rowIndexes.Count;
        _queueDone = 0;
        _queueOk = 0;
        FillRow(rowIndexes[0], dryRun: false);
    }

    private List<int> _queue = new();
    private int _queuePos;

    private void FillNextInQueue()
    {
        if (_queue.Count == 0)
        {
            // Không có hàng đợi: F9 đơn giản là điền dòng kế tiếp trong bảng.
            if (_table == null || _table.IsEmpty) { SetStatus("⚠ Chưa có dữ liệu."); return; }
            var next = Math.Min(_pastePanel.SelectedDataRowIndex + 1, _table.RowCount - 1);
            FillRow(next, dryRun: false);
            return;
        }
        if (_busy) { SetStatus("⏳ Đang điền dòng hiện tại..."); return; }
        _queuePos++;
        if (_queuePos >= _queue.Count)
        {
            SetStatus($"✅ Hoàn tất hàng đợi: {_queueOk}/{_queueTotal} dòng điền thành công.");
            Toast($"✅ Xong {_queueOk}/{_queueTotal} dòng", _queueOk < _queueTotal);
            _queue.Clear();
            _queuePos = 0;
            return;
        }
        FillRow(_queue[_queuePos], dryRun: false);
    }

    private void SelectAllNo()
    {
        if (!_coreReady || _webView?.CoreWebView2 == null)
        {
            SetStatus("❌ Trang chưa sẵn sàng.");
            return;
        }
        SetStatus("☑ Đang chọn 'Không' hàng loạt...");
        _ = ExecuteAsync(AutoFillScriptBuilder.BuildSelectNo(_config.SelectNoKeywords));
    }

    private async Task ExecuteAsync(string script)
    {
        try
        {
            var core = _webView?.CoreWebView2;
            if (core == null) return;
            await core.ExecuteScriptAsync(script);
        }
        catch (Exception ex)
        {
            AppLogger.Error("ExecuteScript thất bại", ex);
            SetStatus("❌ Không gửi được lệnh sang trang: " + ex.Message);
            Toast("❌ Trang có thể đã bị tải lại — bấm ⟳ rồi thử lại", true);
            FinishFillUi();
        }
    }

    private void OnFillReport(FillReport report)
    {
        AppLogger.Info("Kết quả điền: " + report.Summary);
        if (report.Missing.Count > 0)
            AppLogger.Warn("Không thấy ô nhập: " + string.Join(" | ", report.Missing.ConvertAll(m => m.Label)));
        if (report.Failed.Count > 0)
            AppLogger.Warn("Ghi thất bại: " + string.Join(" | ", report.Failed.ConvertAll(f => f.Label + "(" + f.Reason + ")")));

        FinishFillUi();

        if (report.Error != null)
        {
            SetStatus("❌ " + (report.Message ?? report.Error));
            Toast("❌ " + (report.Message ?? report.Error), true);
            if (report.Error == "no-fields") WarnNoMapping();
            return;
        }

        _pastePanel.SetReport(report);
        _queueDone++;
        if (report.Ok > 0 && report.Failed.Count == 0) _queueOk++;

        var icon = report.Failed.Count > 0 ? "⚠" : (report.Missing.Count > 0 ? "🟡" : "✅");
        SetStatus($"{icon} {report.Summary}");
        Toast($"{icon} {report.Summary}", report.Failed.Count > 0);

        if (_progress.Visible && _queueTotal > 0)
            _progress.Value = Math.Min(100, (int)(100.0 * _queueDone / _queueTotal));

        // Còn dòng trong hàng đợi thì nhắc người dùng bấm F9.
        if (_queue.Count > 0 && _queuePos < _queue.Count - 1)
            SetStatus($"{icon} {report.Summary}  •  Bấm F9 để điền dòng kế tiếp ({_queuePos + 2}/{_queueTotal}).");
    }

    private void FinishFillUi()
    {
        _busy = false;
        _pastePanel.SetBusy(false);
        _progress.Visible = false;
    }

    private void WarnNoMapping()
    {
        var url = SafeSource() ?? "(chưa tải trang)";
        var sb = new StringBuilder();
        sb.AppendLine("Không xác định được bộ ánh xạ (mapping) cho trang đang mở.");
        sb.AppendLine();
        sb.AppendLine("URL hiện tại: " + url);
        sb.AppendLine();
        if (_config.Forms.Count == 0)
        {
            sb.AppendLine("File cấu hình chưa có form nào. Bấm ⚙ Cài đặt để 'Khôi phục mặc định' rồi Lưu.");
        }
        else
        {
            sb.AppendLine("Các form đã khai báo:");
            foreach (var f in _config.Forms)
                sb.AppendLine($"  • {f.Name}  —  URL chứa: '{(string.IsNullOrEmpty(f.UrlContains) ? "(trống)" : f.UrlContains)}'");
            sb.AppendLine();
            sb.AppendLine("Cách xử lý (chọn 1):");
            sb.AppendLine("  1. Chọn form ở ô dropdown trên thanh công cụ (bỏ qua nhận diện URL).");
            sb.AppendLine("  2. Vào ⚙ Cài đặt, sửa 'URL chứa' cho khớp với địa chỉ trang medinet đang mở.");
        }

        SetStatus("⚠ Chưa khớp form nào với URL này — xem hướng dẫn.");
        Toast("⚠ Chưa nhận diện được form", true);
        AppLogger.Warn("Không khớp form cho URL: " + url);
        MessageBox.Show(sb.ToString(), "Chưa nhận diện được form", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }

    // ------------------------------------------------------------- Điều hướng
    private void NavigateHome()
    {
        var url = string.IsNullOrWhiteSpace(_config.DefaultUrl)
            ? "https://quanlyskcd.medinet.org.vn/account/login"
            : _config.DefaultUrl.Trim();
        Navigate(url);
    }

    private void Navigate(string url)
    {
        try
        {
            if (_webView?.CoreWebView2 != null)
            {
                _webView.CoreWebView2.Navigate(url);
                AppLogger.Info("Điều hướng: " + url);
            }
            else
            {
                // WebView2 chưa sẵn sàng: đặt Source để nó tự điều hướng khi init xong.
                if (_webView != null) _webView.Source = new Uri(url.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? url : "https://" + url);
                _pendingFillAfterLoad = _table != null;
            }
        }
        catch (Exception ex)
        {
            AppLogger.Error("Điều hướng thất bại: " + url, ex);
            SetStatus("❌ Không mở được " + url + ": " + ex.Message);
        }
    }

    private void ReloadPage()
    {
        try
        {
            if (_webView?.CoreWebView2 != null) _webView.CoreWebView2.Reload();
            else _webView?.Reload();
            SetStatus("⟳ Đang tải lại trang...");
        }
        catch (Exception ex)
        {
            AppLogger.Warn("Tải lại trang thất bại: " + ex.Message);
        }
    }

    private string? SafeSource()
    {
        try { return _webView?.CoreWebView2?.Source; }
        catch { return null; }
    }

    private void UpdateAddressBar()
    {
        if (IsDisposed) return;
        var src = SafeSource();
        if (src != null && _txtAddress.Text != src) _txtAddress.Text = src;
    }

    // ------------------------------------------------------------- Giao diện phụ
    private void ShowPastePanel(bool show)
    {
        _pastePanel.EnsureBuilt();
        _pastePanel.Visible = show;
        if (show) _pastePanel.BringToFront();
    }

    private void TogglePastePanel()
    {
        ShowPastePanel(!_pastePanel.Visible);
    }

    private void SetStatus(string text)
    {
        if (IsDisposed) return;
        try { _lblStatus.Text = text; } catch { }
    }

    /// <summary>Thông báo nổi ở góc phải, tự mất — để người dùng không phải nhìn thanh trạng thái.</summary>
    private void Toast(string message, bool isError)
    {
        if (IsDisposed) return;
        try
        {
            var lbl = new Label
            {
                Text = message,
                AutoSize = false,
                Size = new Size(420, 40),
                TextAlign = ContentAlignment.MiddleLeft,
                BackColor = isError ? Color.FromArgb(211, 47, 47) : Color.FromArgb(46, 125, 50),
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Padding = new Padding(10, 0, 10, 0)
            };
            lbl.Location = new Point(ClientSize.Width - lbl.Width - 16, 52);
            lbl.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            Controls.Add(lbl);
            lbl.BringToFront();

            var timer = new System.Windows.Forms.Timer { Interval = 4200 };
            timer.Tick += (_, _) =>
            {
                timer.Stop();
                timer.Dispose();
                try { Controls.Remove(lbl); lbl.Dispose(); } catch { }
            };
            timer.Start();
        }
        catch { /* toast chỉ là phụ, không được làm hỏng nghiệp vụ */ }
    }

    private void ShowReportDialog(FillReport report)
    {
        using var dlg = new Form
        {
            Text = "Kết quả điền dữ liệu",
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(760, 560),
            MinimizeBox = false,
            MaximizeBox = true
        };
        var txt = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Font = new Font("Consolas", 9.5f),
            Text = report.ToText()
        };
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 44, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) };
        var btnCopy = new Button { Text = "📋 Copy báo cáo", AutoSize = true };
        var btnClose = new Button { Text = "Đóng", AutoSize = true, DialogResult = DialogResult.OK };
        btnCopy.Click += (_, _) =>
        {
            if (ClipboardService.Write(txt.Text)) SetStatus("Đã copy báo cáo vào clipboard.");
        };
        bottom.Controls.Add(btnClose);
        bottom.Controls.Add(btnCopy);
        dlg.Controls.Add(txt);
        dlg.Controls.Add(bottom);
        dlg.AcceptButton = btnClose;
        dlg.ShowDialog(this);
    }

    private void ShowLogDialog()
    {
        using var dlg = new Form
        {
            Text = "Nhật ký hoạt động — " + AppPaths.LogFileToday,
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(900, 560)
        };
        var txt = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Font = new Font("Consolas", 9f),
            Text = string.Join(Environment.NewLine, AppLogger.Recent())
        };
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 44, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) };
        var btnCopy = new Button { Text = "📋 Copy log", AutoSize = true };
        var btnOpenFolder = new Button { Text = "📂 Mở thư mục log", AutoSize = true };
        var btnClose = new Button { Text = "Đóng", AutoSize = true, DialogResult = DialogResult.OK };
        btnCopy.Click += (_, _) => { if (ClipboardService.Write(txt.Text)) SetStatus("Đã copy log."); };
        btnOpenFolder.Click += (_, _) =>
        {
            try
            {
                Directory.CreateDirectory(AppPaths.LogDirectory);
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = AppPaths.LogDirectory,
                    UseShellExecute = true
                });
            }
            catch (Exception ex) { MessageBox.Show("Không mở được thư mục log: " + ex.Message); }
        };
        bottom.Controls.Add(btnClose);
        bottom.Controls.Add(btnOpenFolder);
        bottom.Controls.Add(btnCopy);
        dlg.Controls.Add(txt);
        dlg.Controls.Add(bottom);
        dlg.ShowDialog(this);
    }

    private void OpenSettings()
    {
        // Truyền hàm quét trang để tab "Chẩn đoán" lấy được selector thật từ medinet.
        using var dlg = new SettingsForm(_config, ScanPageAsync);
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        // Lấy bản cấu hình đã lưu từ dialog (copy sâu để không dính reference).
        _config = AppJson.DeepClone(dlg.Config);
        AppLogger.Info("Đã lưu cấu hình mới từ giao diện Cài đặt.");

        RefreshFormCombo();
        if (_table != null) _pastePanel.SetTable(_table, ActiveFields());
        _ = ApplyConfigToPageAsync();
        SetStatus("✅ Đã lưu cấu hình và áp dụng ngay cho trang đang mở.");
        Toast("✅ Đã lưu cấu hình", false);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        try { ConfigRepository.StopWatching(); } catch { }
        try { _webView?.CoreWebView2?.Dispose(); } catch { }
        try { _webView?.Dispose(); } catch { }
        AppLogger.Info("==== Đóng phần mềm ====");
        base.OnFormClosed(e);
    }
}
