using System.Text.Json;
using System.Windows.Forms;

namespace MedicalAutoFillTool
{
    /// <summary>
    /// Giao diện cấu hình trực tiếp: quản lý danh sách form, ánh xạ cột Excel -&gt; nhãn web,
    /// từ khóa "Chọn Không", URL mặc định,... Mọi thay đổi được lưu vào file config/forms.json
    /// và áp dụng ngay lập tức, KHÔNG cần sửa code / rebuild.
    /// </summary>
    public class SettingsForm : Form
    {
        private readonly AppConfig _config; // bản làm việc (copy sâu)

        // Tab 1: quản lý form & trường dữ liệu
        private readonly ListBox _lstForms = new();
        private readonly TextBox _txtName = new();
        private readonly TextBox _txtUrl = new();
        private readonly DataGridView _dgvFields = new();

        // Tab 2: tùy chọn chung
        private readonly TextBox _txtDefaultUrl = new();
        private readonly ComboBox _cmbPasteMode = new();
        private readonly TextBox _txtNoKeywords = new();

        private readonly Button _btnSave = new();
        private readonly Button _btnCancel = new();
        private readonly Button _btnReset = new();
        private readonly Label _lblPath = new();

        private FormProfile? _current;

        /// <summary>Cấu hình sau khi người dùng nhấn Lưu.</summary>
        public AppConfig Config => _config;

        public SettingsForm(AppConfig original)
        {
            Text = "⚙ Cài đặt tiện ích";
            StartPosition = FormStartPosition.CenterParent;
            MinimumSize = new Size(820, 560);
            Size = new Size(880, 620);

            // Copy sâu để bấm Hủy không làm mất cấu hình gốc.
            var json = JsonSerializer.Serialize(original, AppJson.Options);
            _config = JsonSerializer.Deserialize<AppConfig>(json, AppJson.Options)!;

            BuildUi();
            LoadGlobal();
            RefreshFormsList();

            _lstForms.SelectedIndex = _config.Forms.Count > 0 ? 0 : -1;
        }

        // ---------------------------------------------------------------- UI
        private void BuildUi()
        {
            // THỨ TỰ DOCK (quan trọng):
            // WinForms xếp dock theo z-order NGƯỢC — control thêm SAU được dock TRƯỚC.
            // Vì vậy phải thêm control Fill (tabs) TRƯỚC, rồi mới thêm thanh nút Bottom.
            // Nếu làm ngược lại, tabs sẽ chiếm TOÀN BỘ chiều cao form và bị thanh nút đè lên
            // => các dòng cuối của lưới bị che khuất.

            // Content chiếm phần còn lại -> thêm TRƯỚC
            var tabs = new TabControl { Dock = DockStyle.Fill };
            tabs.TabPages.Add(BuildTabForms());
            tabs.TabPages.Add(BuildTabGeneral());
            Controls.Add(tabs);

            var bottom = new TableLayoutPanel { Dock = DockStyle.Bottom, Height = 52, ColumnCount = 4, Padding = new Padding(10, 8, 10, 8) };
            bottom.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f)); // đường cấu hình (Fill)
            bottom.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));      // Khôi phục
            bottom.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));      // Hủy
            bottom.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));      // Lưu

            _lblPath.Text = "Cấu hình: " + ConfigRepository.ConfigPath;
            _lblPath.ForeColor = Color.Gray;

            _btnReset.Text = "Khôi phục mặc định";
            _btnReset.AutoSize = true;
            _btnReset.Margin = new Padding(4, 2, 4, 2);
            _btnReset.Click += (_, _) => ResetToDefault();

            _btnCancel.Text = "Hủy";
            _btnCancel.AutoSize = true;
            _btnCancel.Margin = new Padding(4, 2, 4, 2);
            _btnCancel.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

            _btnSave.Text = "💾 Lưu cấu hình";
            _btnSave.AutoSize = true;
            _btnSave.Margin = new Padding(6, 2, 2, 2);
            _btnSave.BackColor = Color.FromArgb(0, 140, 60);
            _btnSave.ForeColor = Color.White;
            _btnSave.Click += (_, _) => SaveAndClose();

            bottom.Controls.Add(_lblPath, 0, 0);
            bottom.Controls.Add(_btnReset, 1, 0);
            bottom.Controls.Add(_btnCancel, 2, 0);
            bottom.Controls.Add(_btnSave, 3, 0);
            // Thanh nút thêm SAU CÙNG -> nằm dưới đáy form, không đè lên lưới
            Controls.Add(bottom);
        }

        private TabPage BuildTabForms()
        {
            var page = new TabPage("Form & Trường dữ liệu");

            // Cột trái: danh sách các form
            var left = new Panel { Dock = DockStyle.Left, Width = 230, Padding = new Padding(8) };
            var leftLbl = new Label { Text = "Danh sách các form:", Dock = DockStyle.Top, Height = 20, AutoSize = false };

            var leftBtns = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 34 };
            var btnAddForm = new Button { Text = "+ Thêm", AutoSize = true };
            var btnRemoveForm = new Button { Text = "− Xóa", AutoSize = true };
            btnAddForm.Click += (_, _) => AddForm();
            btnRemoveForm.Click += (_, _) => RemoveForm();
            leftBtns.Controls.Add(btnAddForm);
            leftBtns.Controls.Add(btnRemoveForm);

            _lstForms.Dock = DockStyle.Fill;
            _lstForms.SelectedIndexChanged += (_, _) => LoadSelected();

            // THỨ TỰ DOCK: Fill (ListBox) thêm TRƯỚC, các thanh Top/Bottom thêm SAU
            // để ListBox chỉ chiếm phần giữa, không bị nhãn/nút đè lên các mục cuối.
            left.Controls.Add(_lstForms);
            left.Controls.Add(leftLbl);
            left.Controls.Add(leftBtns);

            // Cột phải: chi tiết form + bảng trường
            var right = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(8) };
            right.RowStyles.Add(new RowStyle(SizeType.Absolute, 34)); // Tên form
            right.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); // URL chứa
            right.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); // bảng trường

            var rowName = new Panel { Dock = DockStyle.Fill };
            rowName.Controls.Add(new Label { Text = "Tên form:", Location = new Point(0, 4), Size = new Size(90, 20) });
            _txtName.Location = new Point(95, 3); _txtName.Width = 380; _txtName.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            rowName.Controls.Add(_txtName);

            var rowUrl = new Panel { Dock = DockStyle.Fill };
            rowUrl.Controls.Add(new Label { Text = "URL chứa:", Location = new Point(0, 4), Size = new Size(90, 20) });
            _txtUrl.Location = new Point(95, 3); _txtUrl.Width = 380; _txtUrl.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            rowUrl.Controls.Add(_txtUrl);

            var gridPanel = BuildGridPanel();
            right.Controls.Add(rowName, 0, 0);
            right.Controls.Add(rowUrl, 0, 1);
            right.Controls.Add(gridPanel, 0, 2);

            page.Controls.Add(right);
            page.Controls.Add(left);
            return page;
        }

        private Panel BuildGridPanel()
        {
            var p = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 4, 0, 0) };

            var head = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 34 };
            head.Controls.Add(new Label { Text = "Ánh xạ cột dữ liệu → trường trên web:", AutoSize = true, Margin = new Padding(0, 8, 8, 0) });
            var btnAdd = new Button { Text = "+ Thêm trường", AutoSize = true, Margin = new Padding(4, 4, 4, 0) };
            var btnDel = new Button { Text = "− Xóa trường", AutoSize = true, Margin = new Padding(4, 4, 4, 0) };
            btnAdd.Click += (_, _) => AddFieldRow();
            btnDel.Click += (_, _) => RemoveFieldRows();
            head.Controls.Add(btnAdd);
            head.Controls.Add(btnDel);

            _dgvFields.Dock = DockStyle.Fill;
            _dgvFields.AllowUserToAddRows = false;
            _dgvFields.AllowUserToDeleteRows = false;
            _dgvFields.RowHeadersVisible = false;
            _dgvFields.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            _dgvFields.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            _dgvFields.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.AllCells;

            var colIndex = new DataGridViewTextBoxColumn { HeaderText = "Cột Excel", FillWeight = 15 };
            var colLabel = new DataGridViewTextBoxColumn { HeaderText = "Nhãn web (cách nhau bằng ';')", FillWeight = 70 };
            var colType = new DataGridViewComboBoxColumn { HeaderText = "Loại", FillWeight = 15 };
            colType.Items.AddRange("text", "textarea");
            _dgvFields.Columns.AddRange(colIndex, colLabel, colType);

            // THỨ TỰ DOCK: thêm lưới (Fill) TRƯỚC, rồi mới tới thanh head (Top).
            // Nếu thêm head trước, lưới sẽ bị dock Fill chiếm trọn panel và chui xuống
            // dưới thanh head => mất dòng đầu + dòng cuối bị che.
            p.Controls.Add(_dgvFields);
            p.Controls.Add(head);
            return p;
        }

        private TabPage BuildTabGeneral()
        {
            var page = new TabPage("Tùy chọn chung");

            var tbl = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(12) };
            tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));
            tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));
            tbl.RowStyles.Add(new RowStyle(SizeType.Absolute, 140));
            tbl.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            var r1 = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 6, 0, 6) };
            r1.Controls.Add(new Label { Text = "URL đăng nhập mặc định:", Location = new Point(0, 8), Size = new Size(210, 20) });
            _txtDefaultUrl.Location = new Point(215, 4);
            _txtDefaultUrl.Width = 560;
            _txtDefaultUrl.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            r1.Controls.Add(_txtDefaultUrl);

            var r2 = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 6, 0, 6) };
            r2.Controls.Add(new Label { Text = "Kiểu dán dữ liệu:", Location = new Point(0, 8), Size = new Size(210, 20) });
            _cmbPasteMode.Location = new Point(215, 4);
            _cmbPasteMode.Width = 240;
            _cmbPasteMode.DropDownStyle = ComboBoxStyle.DropDownList;
            _cmbPasteMode.Items.AddRange(new object[] { "tab (cột ngăn bằng Tab)", "comma (cột ngăn bằng dấu phẩy)" });
            r2.Controls.Add(_cmbPasteMode);

            var r3 = new Panel { Dock = DockStyle.Fill, Padding = new Padding(0, 6, 0, 6) };
            r3.Controls.Add(new Label { Text = "Từ khóa 'Chọn Không' khi bấm Ctrl+B (mỗi từ cách nhau bằng ';'):", Location = new Point(0, 0), Size = new Size(620, 20) });
            _txtNoKeywords.Location = new Point(0, 24);
            _txtNoKeywords.Width = 780; _txtNoKeywords.Height = 90;
            _txtNoKeywords.Multiline = true;
            _txtNoKeywords.AcceptsReturn = true;
            _txtNoKeywords.ScrollBars = ScrollBars.Vertical;
            _txtNoKeywords.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            r3.Controls.Add(_txtNoKeywords);

            tbl.Controls.Add(r1, 0, 0);
            tbl.Controls.Add(r2, 0, 1);
            tbl.Controls.Add(r3, 0, 2);

            var hint = new Label
            {
                Dock = DockStyle.Fill,
                Text = "💡 Mẹo:\r\n" +
                       "• Nếu web đổi tên nhãn, vào tab \"Form & Trường dữ liệu\" thêm nhãn mới (hoặc thêm cột Excel mới) rồi bấm Lưu - không cần sửa code.\r\n" +
                       "• Phần mềm tự nhận diện form đang mở theo chuỗi trong URL (cột \"URL chứa\").\r\n" +
                       "• Sau khi Lưu, trang hiện tại sẽ áp dụng cấu hình mới ngay lập tức.",
                ForeColor = Color.DimGray
            };
            tbl.Controls.Add(hint, 0, 3);

            page.Controls.Add(tbl);
            return page;
        }

        private void LoadGlobal()
        {
            _txtDefaultUrl.Text = _config.DefaultUrl;
            _cmbPasteMode.SelectedIndex = string.Equals(_config.PasteMode, "comma", StringComparison.OrdinalIgnoreCase) ? 1 : 0;
            _txtNoKeywords.Text = string.Join(";", _config.SelectNoKeywords);
        }

        private void SaveGlobal()
        {
            _config.DefaultUrl = _txtDefaultUrl.Text.Trim();
            _config.PasteMode = _cmbPasteMode.SelectedIndex == 1 ? "comma" : "tab";
            _config.SelectNoKeywords = _txtNoKeywords.Text
                .Split(new[] { ';', ',', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim()).Where(s => s.Length > 0).ToList();
        }

        private void RefreshFormsList()
        {
            _lstForms.Items.Clear();
            foreach (var f in _config.Forms) _lstForms.Items.Add(string.IsNullOrWhiteSpace(f.Name) ? "(chưa đặt tên)" : f.Name);
        }

        private void LoadSelected()
        {
            CommitCurrent();
            if (_lstForms.SelectedIndex < 0 || _lstForms.SelectedIndex >= _config.Forms.Count)
            {
                _current = null;
                _txtName.Text = ""; _txtUrl.Text = ""; _dgvFields.Rows.Clear();
                return;
            }
            _current = _config.Forms[_lstForms.SelectedIndex];
            _txtName.Text = _current.Name;
            _txtUrl.Text = _current.UrlContains;
            ReloadGrid();
        }

        private void ReloadGrid()
        {
            _dgvFields.Rows.Clear();
            if (_current == null) return;
            foreach (var f in _current.Fields)
            {
                int r = _dgvFields.Rows.Add(f.ExcelIndex, string.Join(";", f.Labels), f.ControlType);
                _dgvFields.Rows[r].Tag = f;
            }
        }

        private void CommitCurrent()
        {
            if (_current == null) return;
            _current.Name = _txtName.Text.Trim();
            _current.UrlContains = _txtUrl.Text.Trim();
            _current.Fields = GridToFields();
        }

        private List<FieldMapping> GridToFields()
        {
            var list = new List<FieldMapping>();
            foreach (DataGridViewRow row in _dgvFields.Rows)
            {
                if (row.IsNewRow) continue;
                var idxObj = row.Cells[0].Value?.ToString();
                int idx = int.TryParse(idxObj, out int n) ? n : row.Index;
                string labelsStr = row.Cells[1].Value?.ToString() ?? "";
                string? type = row.Cells[2].Value?.ToString();
                var labels = labelsStr.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                if (labels.Length == 0) continue;
                list.Add(new FieldMapping { ExcelIndex = idx, Labels = labels, ControlType = string.IsNullOrEmpty(type) ? "text" : type });
            }
            return list;
        }

        private void AddForm()
        {
            CommitCurrent();
            var f = new FormProfile { Name = "Form mới " + (_config.Forms.Count + 1) };
            _config.Forms.Add(f);
            RefreshFormsList();
            _lstForms.SelectedIndex = _config.Forms.Count - 1;
        }

        private void RemoveForm()
        {
            int i = _lstForms.SelectedIndex;
            if (i < 0 || i >= _config.Forms.Count) return;
            _config.Forms.RemoveAt(i);
            RefreshFormsList();
            _lstForms.SelectedIndex = _config.Forms.Count > 0 ? Math.Min(i, _config.Forms.Count - 1) : -1;
        }

        private void AddFieldRow()
        {
            if (_current == null && _config.Forms.Count == 0) AddForm();
            int idx = _dgvFields.Rows.Count;
            _dgvFields.Rows.Add(idx, "", "text");
            // Ensure the newly added row is visible
            if (_dgvFields.RowCount > 0)
                _dgvFields.FirstDisplayedScrollingRowIndex = _dgvFields.RowCount - 1;
        }

        private void RemoveFieldRows()
        {
            foreach (DataGridViewRow row in _dgvFields.SelectedRows) _dgvFields.Rows.Remove(row);
        }

        private void ResetToDefault()
        {
            if (MessageBox.Show("Khôi phục toàn bộ cấu hình về mặc định? Các thay đổi hiện tại sẽ bị ghi đè.",
                "Xác nhận", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

            var json = JsonSerializer.Serialize(ConfigRepository.CreateDefault(), AppJson.Options);
            var fresh = JsonSerializer.Deserialize<AppConfig>(json, AppJson.Options)!;
            _config.DefaultUrl = fresh.DefaultUrl;
            _config.PasteMode = fresh.PasteMode;
            _config.SelectNoKeywords = fresh.SelectNoKeywords;
            _config.Forms = fresh.Forms;
            LoadGlobal();
            RefreshFormsList();
            _lstForms.SelectedIndex = _config.Forms.Count > 0 ? 0 : -1;
        }

        private void SaveAndClose()
        {
            CommitCurrent();
            SaveGlobal();
            try
            {
                ConfigRepository.Save(_config);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Không ghi được file cấu hình:\r\n" + ex.Message, "Lỗi",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            DialogResult = DialogResult.OK;
            Close();
        }
    }
}