using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace MedicalAutoFillTool
{
    public partial class Form1 : Form
    {
        private WebView2? webView21;
        private StatusStrip? statusStrip1;
        private ToolStripStatusLabel? lblStatus;
        private TextBox? txtAddress;
        private AppConfig _config = new();

        public Form1()
        {
            InitializeComponent();

            // Nạp cấu hình (tự tạo config/forms.json nếu chưa có).
            _config = ConfigRepository.Load();

            SetupLayout();
            _ = InitializeWebViewAsync();
        }

        // ------------------------------------------------------------ Giao diện
        private void SetupLayout()
        {
            this.Text = "Medical Auto Fill Tool";
            this.WindowState = FormWindowState.Maximized;
            this.StartPosition = FormStartPosition.CenterScreen;

            // Trình duyệt nhúng: THÊM TRƯỚC với Dock=Fill.
            // WinForms xếp dock theo z-order NGƯỢC (control thêm SAU được dock TRƯỚC),
            // nên control Fill phải được thêm trước các thanh viền Top/Bottom;
            // nếu thêm sau cùng, WebView2 sẽ chiếm trọn form và bị toolbar/status che mất
            // phần trên và phần dưới của trang web.
            webView21 = new WebView2 { Dock = DockStyle.Fill };
            this.Controls.Add(webView21);

            // Thanh công cụ phía trên
            var top = new Panel { Dock = DockStyle.Top, Height = 42, BackColor = Color.FromArgb(41, 49, 66), Padding = new Padding(4, 4, 4, 4) };
            var tbl = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4 };
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            tbl.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            top.Controls.Add(tbl);

            var btnHome = MakeToolButton("🏠 Trang chủ");
            btnHome.Click += (_, _) => NavigateHome();

            txtAddress = new TextBox
            {
                Dock = DockStyle.Fill,
                BorderStyle = BorderStyle.FixedSingle,
                ForeColor = Color.White,
                BackColor = Color.FromArgb(58, 70, 92),
                Margin = new Padding(4, 0, 4, 0)
            };
            txtAddress.KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    var url = txtAddress.Text.Trim();
                    if (!string.IsNullOrEmpty(url))
                        webView21?.CoreWebView2?.Navigate(url.StartsWith("http") ? url : "https://" + url);
                }
            };

            var btnRefresh = MakeToolButton("⟳ Làm mới");
            btnRefresh.Click += (_, _) => { try { webView21?.Reload(); } catch { } };

            var btnSettings = MakeToolButton("⚙ Cài đặt");
            btnSettings.Click += (_, _) => OpenSettings();

            tbl.Controls.Add(btnHome, 0, 0);
            tbl.Controls.Add(txtAddress, 1, 0);
            tbl.Controls.Add(btnRefresh, 2, 0);
            tbl.Controls.Add(btnSettings, 3, 0);

            this.Controls.Add(top);

            // Thanh trạng thái: thêm SAU WebView2 (Fill) để chỉ chiếm dải đáy, không che nội dung
            statusStrip1 = new StatusStrip();
            lblStatus = new ToolStripStatusLabel { Text = "⏳ Đang khởi động hệ thống..." };
            statusStrip1.Items.Add(lblStatus);
            this.Controls.Add(statusStrip1);
        }

        private Button MakeToolButton(string text)
        {
            var b = new Button
            {
                Text = text,
                AutoSize = true,
                Margin = new Padding(2, 0, 2, 0),
                BackColor = Color.FromArgb(58, 70, 92),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                FlatAppearance = { BorderColor = Color.FromArgb(58, 70, 92) },
                Padding = new Padding(10, 2, 2, 2)
            };
            return b;
        }

        // ------------------------------------------------------------ WebView2
        private async Task InitializeWebViewAsync()
        {
            try
            {
                SetStatus("⏳ Đang chuẩn hóa môi trường Chromium...");

                var cacheFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MedicalAutoFillCache");
                var options = new CoreWebView2EnvironmentOptions();
                var env = await CoreWebView2Environment.CreateAsync(null, cacheFolder, options);

                if (webView21 != null)
                {
                    await webView21.EnsureCoreWebView2Async(env);

                    var core = webView21.CoreWebView2;
                    if (core != null)
                    {
                        core.Settings.IsPasswordAutosaveEnabled = true;
                        core.Settings.AreDevToolsEnabled = true;
                        core.Settings.AreBrowserAcceleratorKeysEnabled = true;
                        core.Settings.IsStatusBarEnabled = true;

                        core.SourceChanged += (_, _) => UpdateAddress();
                        core.NavigationCompleted += (_, _) =>
                        {
                            InjectAutoFill();
                            UpdateAddress();
                            SetStatus("✅ Sẵn sàng!");
                        };

                        core.Navigate(string.IsNullOrEmpty(_config.DefaultUrl)
                            ? "https://quanlyskcd.medinet.org.vn/account/login"
                            : _config.DefaultUrl);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Lỗi khởi tạo: " + ex.Message, "Lỗi", MessageBoxButtons.OK, MessageBoxIcon.Error);
                SetStatus("❌ Lỗi khởi tạo");
            }
        }

        private void NavigateHome()
        {
            if (webView21?.CoreWebView2 == null) return;
            var url = string.IsNullOrEmpty(_config.DefaultUrl)
                ? "https://quanlyskcd.medinet.org.vn/account/login"
                : _config.DefaultUrl;
            webView21.CoreWebView2.Navigate(url);
        }

        private void UpdateAddress()
        {
            if (txtAddress != null && webView21?.CoreWebView2 != null)
                txtAddress.Text = webView21.CoreWebView2.Source;

            // Nhận diện form đang mở theo URL để hiển thị trạng thái
            var url = webView21?.CoreWebView2?.Source ?? "";
            string formName = "";
            foreach (var f in _config.Forms)
                if (!string.IsNullOrEmpty(f.UrlContains) && url.Contains(f.UrlContains)) { formName = f.Name; break; }

            if (formName.Length > 0) SetStatus("🧾 Form nhận diện được: " + formName);
            else if (formName.Length == 0)
                SetStatus("✅ Sẵn sàng!");
        }

        private void SetStatus(string text)
        {
            if (lblStatus != null) lblStatus.Text = text;
        }

        // ------------------------------------------------------------ Tự động điền
        private void InjectAutoFill()
        {
            if (webView21?.CoreWebView2 == null) return;
            var script = AutoFillScriptBuilder.Build(_config);
            _ = webView21.CoreWebView2.ExecuteScriptAsync(script);
        }

        private void OpenSettings()
        {
            using (var dlg = new SettingsForm(_config))
            {
                if (dlg.ShowDialog(this) == DialogResult.OK)
                {
                    // Đảm bảo _config là bản đã lưu (copy sâu từ dialog)
                    var json = System.Text.Json.JsonSerializer.Serialize(dlg.Config, AppJson.Options);
                    _config = System.Text.Json.JsonSerializer.Deserialize<AppConfig>(json, AppJson.Options)!;

                    SetStatus("✅ Đã lưu cấu hình & áp dụng ngay.");
                    InjectAutoFill(); // áp dụng cấu hình mới cho trang hiện tại
                }
            }
        }
    }
}