using System.Text;

namespace MedicalAutoFillTool;

/// <summary>
/// Bảng xem trước dữ liệu vừa dán từ Excel.
///
/// Vì sao cần: bản cũ dán thẳng vào trang medinet, người dùng KHÔNG thấy dữ liệu
/// đã vào chưa, nên khi lỗi thì không biết lỗi ở bước copy hay bước điền.
/// Bảng này cho thấy ngay: mấy dòng, mấy cột, có nhận diện được tiêu đề không,
/// cột nào khớp với trường nào, và cho phép sửa tay một ô trước khi điền.
/// </summary>
public sealed class PastePanel : UserControl
{
    /// <summary>Chỉ nạp tối đa từng này dòng vào lưới (dán 5.000 dòng vẫn điền đủ,
    /// nhưng lưới chỉ hiện phần đầu để không đơ giao diện).</summary>
    private const int DisplayRowCap = 300;

    private readonly ToolStrip _bar = new();
    private readonly DataGridView _grid = new();
    private readonly Panel _footer = new();
    private readonly Label _lblReport = new();
    private readonly LinkLabel _lnkDetail = new();

    private readonly ToolStripButton _btnPaste = new();
    private readonly ToolStripButton _btnFill = new();
    private readonly ToolStripButton _btnFillAll = new();
    private readonly ToolStripButton _btnDryRun = new();
    private readonly ToolStripButton _btnClear = new();
    private readonly ToolStripComboBox _cmbHeader = new();
    private readonly ToolStripLabel _lblInfo = new();

    private ParsedTable? _table;
    private IReadOnlyList<FieldMapping> _fields = Array.Empty<FieldMapping>();
    private int[]? _columnMap;
    private FillReport? _lastReport;

    // ---------------------------------------------------------------- Sự kiện
    public event Action? PasteRequested;
    public event Action<int>? FillRequested;
    public event Action<List<int>>? FillAllRequested;
    public event Action<int>? DryRunRequested;
    public event Action? ClearRequested;
    public event Action<FillReport>? DetailRequested;

    public ParsedTable? Table => _table;
    public bool HasData => _table != null && !_table.IsEmpty;

    /// <summary>Chỉ số dòng (tuyệt đối trong Table.Rows) đang được chọn để điền.</summary>
    public int SelectedDataRowIndex
    {
        get
        {
            if (_table == null || _table.IsEmpty) return 0;
            if (_grid.CurrentRow != null && _grid.CurrentRow.Index >= 0 && _grid.CurrentRow.Index < _table.RowCount)
                return _grid.CurrentRow.Index;
            return _table.FirstDataRow;
        }
    }

    public PastePanel()
    {
        Height = 240;
        MinimumSize = new Size(0, 150);
        BuildUi();
    }

    // ------------------------------------------------------------------- UI
    private void BuildUi()
    {
        // Dựng nội dung các thanh TRƯỚC khi add vào Controls (nếu không panel
        // hiện ra với thanh công cụ rỗng, cao 0px).
        BuildToolbar();
        BuildFooter();

        // THỨ TỰ DOCK của WinForms: control thêm SAU được dock TRƯỚC.
        // Thêm lưới (Fill) trước, rồi footer (Bottom), rồi thanh công cụ (Top)
        // => kết quả từ trên xuống: [thanh nút] [lưới] [dòng báo cáo].
        ConfigureGrid();
        Controls.Add(_grid);
        Controls.Add(_footer);
        Controls.Add(_bar);

        BorderStyle = BorderStyle.FixedSingle;
        BackColor = Color.White;
    }

    private void ConfigureGrid()
    {
        _grid.Dock = DockStyle.Fill;
        _grid.AllowUserToAddRows = false;
        _grid.AllowUserToDeleteRows = false;
        _grid.AllowUserToResizeRows = false;
        _grid.RowHeadersVisible = true;
        _grid.RowHeadersWidth = 42;
        _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _grid.MultiSelect = false;
        _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells;
        _grid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
        _grid.ColumnHeadersHeight = 28;
        _grid.Font = new Font("Segoe UI", 9f);
        _grid.EditMode = DataGridViewEditMode.EditOnKeystrokeOrF2;
        _grid.ClipboardCopyMode = DataGridViewClipboardCopyMode.EnableAlwaysIncludeHeaderText;
        _grid.DefaultCellStyle.WrapMode = DataGridViewTriState.False;
        _grid.BackgroundColor = Color.White;
        _grid.GridColor = Color.FromArgb(225, 228, 234);

        _grid.CellEndEdit += Grid_CellEndEdit;
        _grid.CellDoubleClick += (_, e) =>
        {
            if (e.RowIndex >= 0 && FillRequested != null && _table != null)
                FillRequested(e.RowIndex);
        };
    }

    private void Grid_CellEndEdit(object? sender, DataGridViewCellEventArgs e)
    {
        if (_table == null || e.RowIndex < 0 || e.RowIndex >= _table.RowCount) return;
        if (e.ColumnIndex < 0 || e.ColumnIndex >= _table.ColCount) return;
        var cell = _grid.Rows[e.RowIndex].Cells[e.ColumnIndex];
        var text = TextNormalizer.Clean(cell.Value?.ToString() ?? "").Trim();
        _table.Rows[e.RowIndex][e.ColumnIndex] = text;
        UpdateInfo();
    }

    private void BuildToolbar()
    {
        _bar.GripStyle = ToolStripGripStyle.Hidden;
        _bar.Dock = DockStyle.Top;
        _bar.BackColor = Color.FromArgb(245, 246, 249);
        _bar.RenderMode = ToolStripRenderMode.System;
        _bar.AutoSize = false;
        _bar.Height = 30;
        _bar.Items.Clear();

        Setup(_btnPaste, "📋 Dán (Ctrl+Shift+V)", "Đọc clipboard hệ thống và nạp vào bảng này");
        _btnPaste.Click += (_, _) => PasteRequested?.Invoke();

        Setup(_btnFill, "▶ Điền dòng này (Ctrl+Enter)", "Điền dòng đang chọn lên form medinet");
        _btnFill.Font = new Font(_btnFill.Font, FontStyle.Bold);
        _btnFill.Click += (_, _) =>
        {
            if (_table != null && FillRequested != null) FillRequested(SelectedDataRowIndex);
        };

        Setup(_btnFillAll, "⏭ Điền tất cả dòng", "Điền lần lượt từng dòng (hàng đợi)");
        _btnFillAll.Click += (_, _) =>
        {
            if (_table == null || FillAllRequested == null) return;
            var list = new List<int>();
            for (int r = _table.FirstDataRow; r < _table.RowCount; r++) list.Add(r);
            if (list.Count == 0) return;
            FillAllRequested(list);
        };

        Setup(_btnDryRun, "🧪 Kiểm tra mapping (F10)", "Chỉ kiểm tra trường nào tìm thấy ô nhập, KHÔNG ghi dữ liệu");
        _btnDryRun.Click += (_, _) =>
        {
            if (_table != null && DryRunRequested != null) DryRunRequested(SelectedDataRowIndex);
        };

        Setup(_btnClear, "🗑 Xoá", "Xoá dữ liệu trong bảng");
        _btnClear.Click += (_, _) => ClearRequested?.Invoke();

        _cmbHeader.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbHeader.Items.AddRange(new object[] { "Tiêu đề: Tự động", "Tiêu đề: Dòng 1", "Tiêu đề: Không có" });
        _cmbHeader.SelectedIndex = 0;
        _cmbHeader.Width = 150;
        _cmbHeader.ToolTipText = "Khớp cột theo TÊN cột (chống lệch khi copy thiếu/thừa cột)";
        _cmbHeader.SelectedIndexChanged += (_, _) => ApplyHeaderMode();

        _lblInfo.Text = "Chưa có dữ liệu";
        _lblInfo.ForeColor = Color.Gray;

        _bar.Items.Add(_btnPaste);
        _bar.Items.Add(new ToolStripSeparator());
        _bar.Items.Add(_btnFill);
        _bar.Items.Add(_btnFillAll);
        _bar.Items.Add(_btnDryRun);
        _bar.Items.Add(new ToolStripSeparator());
        _bar.Items.Add(_cmbHeader);
        _bar.Items.Add(new ToolStripSeparator());
        _bar.Items.Add(_btnClear);
        _bar.Items.Add(new ToolStripSeparator());
        _bar.Items.Add(_lblInfo);
    }

    private static void Setup(ToolStripButton b, string text, string tooltip)
    {
        b.Text = text;
        b.DisplayStyle = ToolStripItemDisplayStyle.Text;
        b.ToolTipText = tooltip;
        b.Margin = new Padding(3, 1, 3, 1);
    }

    private void BuildFooter()
    {
        _footer.Dock = DockStyle.Bottom;
        _footer.Height = 26;
        _footer.BackColor = Color.FromArgb(250, 250, 252);
        _footer.Padding = new Padding(6, 3, 6, 3);

        _lblReport.AutoSize = false;
        _lblReport.Dock = DockStyle.Fill;
        _lblReport.TextAlign = ContentAlignment.MiddleLeft;
        _lblReport.Text = "";
        _lblReport.ForeColor = Color.DimGray;
        _lblReport.AutoEllipsis = true;

        _lnkDetail.Text = "Xem chi tiết";
        _lnkDetail.Dock = DockStyle.Right;
        _lnkDetail.AutoSize = true;
        _lnkDetail.Visible = false;
        _lnkDetail.LinkClicked += (_, _) =>
        {
            if (_lastReport != null) DetailRequested?.Invoke(_lastReport);
        };

        _footer.Controls.Add(_lblReport);
        _footer.Controls.Add(_lnkDetail);
    }

    // ------------------------------------------------------------- Public API
    /// <summary>Nạp bảng dữ liệu vừa dán/đọc từ clipboard.</summary>
    public void SetTable(ParsedTable? table, IReadOnlyList<FieldMapping> fields)
    {
        _table = table;
        _fields = fields ?? Array.Empty<FieldMapping>();
        _columnMap = null;
        if (_bar.Items.Count == 0) BuildToolbar();
        if (_footer.Controls.Count == 0) BuildFooter();
        ReloadGrid();
        UpdateInfo();
    }

    public void Clear()
    {
        _table = null;
        _columnMap = null;
        _lastReport = null;
        _grid.Rows.Clear();
        _grid.Columns.Clear();
        _lblReport.Text = "";
        _lnkDetail.Visible = false;
        UpdateInfo();
    }

    /// <summary>Xoá dòng báo cáo kết quả (khi dán dữ liệu mới).</summary>
    public void ClearReport()
    {
        _lastReport = null;
        _lblReport.Text = "";
        _lblReport.ForeColor = Color.DimGray;
        _lnkDetail.Visible = false;
        foreach (DataGridViewRow r in _grid.Rows) r.DefaultCellStyle.BackColor = Color.Empty;
    }

    public void SetBusy(bool busy)
    {
        _btnPaste.Enabled = !busy;
        _btnFill.Enabled = !busy;
        _btnFillAll.Enabled = !busy;
        _btnDryRun.Enabled = !busy;
        if (busy) _lblReport.Text = "⏳ Đang điền...";
    }

    /// <summary>Hiện kết quả điền (engine báo về).</summary>
    public void SetReport(FillReport report)
    {
        _lastReport = report;
        if (report == null) return;

        var sb = new StringBuilder();
        sb.Append(report.Summary);
        if (report.Missing.Count > 0)
            sb.Append("  •  Thiếu: ").Append(JoinLabels(report.Missing, 4));
        if (report.Failed.Count > 0)
            sb.Append("  •  Lỗi: ").Append(JoinLabels(report.Failed, 3));

        _lblReport.Text = sb.ToString();
        _lblReport.ForeColor = report.Failed.Count > 0 || report.Error != null
            ? Color.Firebrick
            : (report.Missing.Count > 0 ? Color.DarkOrange : Color.SeaGreen);
        _lnkDetail.Visible = true;

        // Tô màu dòng vừa điền để người dùng biết đã tới đâu trong hàng đợi.
        foreach (var f in report.Filled)
        {
            if (f.Row >= 0 && f.Row < _grid.Rows.Count)
                _grid.Rows[f.Row].DefaultCellStyle.BackColor = Color.FromArgb(232, 245, 233);
        }
        foreach (var f in report.Failed)
        {
            if (f.Row >= 0 && f.Row < _grid.Rows.Count)
                _grid.Rows[f.Row].DefaultCellStyle.BackColor = Color.FromArgb(255, 235, 238);
        }
    }

    private static string JoinLabels(List<FieldRef> list, int max)
    {
        var names = new List<string>();
        for (int i = 0; i < list.Count && i < max; i++) names.Add(list[i].Label);
        var s = string.Join(", ", names);
        return list.Count > max ? s + $" (+{list.Count - max})" : s;
    }

    // ---------------------------------------------------------------- Nội bộ
    private void ApplyHeaderMode()
    {
        if (_table == null || _table.IsEmpty) return;
        switch (_cmbHeader.SelectedIndex)
        {
            case 1: _table.HeaderRowIndex = 0; break;
            case 2: _table.HeaderRowIndex = -1; break;
            default:
                _table.HeaderRowIndex = TsvParser.DetectHeaderRow(_table, _fields);
                break;
        }
        _columnMap = null;
        ReloadGrid();
        UpdateInfo();
    }

    private string ColumnTitle(int col)
    {
        var header = _table != null && _table.HasHeader ? _table.HeaderRow : null;
        var title = header != null && col < header.Length && !string.IsNullOrWhiteSpace(header[col])
            ? header[col]!
            : "Cột " + (col + 1);

        // Ghi chú trường nào khớp với mapping -> người dùng thấy ngay cột có đúng không.
        var map = GetColumnMap();
        if (map != null && map.Length > 0)
        {
            for (int i = 0; i < map.Length; i++)
            {
                if (map[i] == col) return $"{title}  ▸ {_fields[i].DisplayName}";
            }
        }
        if (title.Length > 34) title = title.Substring(0, 33) + "…";
        return title;
    }

    private int[]? GetColumnMap()
    {
        if (_columnMap != null) return _columnMap;
        if (_table == null || _fields.Count == 0) return null;
        _columnMap = TsvParser.ResolveColumns(_fields, _table.HeaderRow);
        return _columnMap;
    }

    private void ReloadGrid()
    {
        _grid.SuspendLayout();
        try
        {
            _grid.Rows.Clear();
            _grid.Columns.Clear();
            if (_table == null || _table.IsEmpty) return;

            int cols = _table.ColCount;
            for (int c = 0; c < cols; c++)
                _grid.Columns.Add("col" + c, ColumnTitle(c));

            int display = Math.Min(_table.RowCount, DisplayRowCap);
            for (int r = 0; r < display; r++)
            {
                var row = _table.Rows[r];
                var values = new object[cols];
                for (int c = 0; c < cols; c++) values[c] = c < row.Length ? row[c] : "";
                int idx = _grid.Rows.Add(values);

                if (_table.HasHeader && r == _table.HeaderRowIndex)
                {
                    _grid.Rows[idx].DefaultCellStyle.BackColor = Color.FromArgb(227, 235, 250);
                    _grid.Rows[idx].DefaultCellStyle.Font = new Font(_grid.Font, FontStyle.Italic);
                    _grid.Rows[idx].ReadOnly = false;
                }
            }

            // Chọn sẵn dòng dữ liệu đầu tiên để Ctrl+Enter là điền được luôn.
            int sel = Math.Min(Math.Max(_table.FirstDataRow, 0), Math.Max(0, _grid.Rows.Count - 1));
            if (_grid.Rows.Count > 0)
            {
                _grid.ClearSelection();
                _grid.Rows[sel].Selected = true;
                _grid.CurrentCell = _grid.Rows[sel].Cells[Math.Min(0, cols - 1)];
            }
        }
        finally
        {
            _grid.ResumeLayout();
        }
    }

    private void UpdateInfo()
    {
        if (_table == null || _table.IsEmpty)
        {
            _lblInfo.Text = "Chưa có dữ liệu — copy trong Excel rồi bấm 📋 Dán";
            _lblInfo.ForeColor = Color.Gray;
            _btnFill.Enabled = false;
            _btnFillAll.Enabled = false;
            _btnDryRun.Enabled = false;
            return;
        }

        int dataRows = _table.RowCount - (_table.HasHeader ? 1 : 0);
        var sb = new StringBuilder();
        sb.Append(dataRows).Append(" dòng × ").Append(_table.ColCount).Append(" cột");
        sb.Append(_table.HasHeader
            ? "  •  tiêu đề: dòng " + (_table.HeaderRowIndex + 1)
            : "  •  không có tiêu đề (dùng vị trí cột)");
        if (_table.RowCount > DisplayRowCap)
            sb.Append("  •  lưới chỉ hiện ").Append(DisplayRowCap).Append(" dòng đầu");

        var map = GetColumnMap();
        if (map != null)
        {
            int matched = 0;
            foreach (var c in map) if (c >= 0) matched++;
            sb.Append("  •  khớp ").Append(matched).Append('/').Append(_fields.Count).Append(" cột");
        }

        _lblInfo.Text = sb.ToString();
        _lblInfo.ForeColor = Color.FromArgb(40, 60, 110);
        _btnFill.Enabled = true;
        _btnFillAll.Enabled = dataRows > 1;
        _btnDryRun.Enabled = true;
    }

    /// <summary>Đảm bảo thanh công cụ/footer đã được dựng (gọi trước khi hiện panel).</summary>
    public void EnsureBuilt()
    {
        if (_bar.Items.Count == 0) BuildToolbar();
        if (_footer.Controls.Count == 0) BuildFooter();
    }
}
