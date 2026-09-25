namespace MedicalAutoFillTool;

/// <summary>Kết quả phân tích một khối dữ liệu copy từ Excel / Google Sheets / CSV.</summary>
public sealed class ParsedTable
{
    public List<string[]> Rows { get; } = new();
    public int RowCount => Rows.Count;
    public int ColCount { get; internal set; }
    public char Delimiter { get; internal set; } = '\t';
    public bool HasQuotes { get; internal set; }

    /// <summary>Chỉ số dòng tiêu đề; -1 nếu dữ liệu không có tiêu đề.</summary>
    public int HeaderRowIndex { get; set; } = -1;
    public bool HasHeader => HeaderRowIndex >= 0;
    public string[]? HeaderRow => HeaderRowIndex >= 0 && HeaderRowIndex < Rows.Count ? Rows[HeaderRowIndex] : null;

    /// <summary>Dòng dữ liệu ĐẦU TIÊN (đã tự nhảy qua dòng tiêu đề).</summary>
    public int FirstDataRow => HeaderRowIndex >= 0 ? HeaderRowIndex + 1 : 0;

    public bool IsEmpty => Rows.Count == 0 || ColCount == 0;

    public string[] Row(int i) => (i >= 0 && i < Rows.Count) ? Rows[i] : Array.Empty<string>();
}

/// <summary>
/// Phân tích dữ liệu dán từ bảng tính — BẢN SAO CỦA MAF.parseTable TRONG Shared/maf-engine.js.
///
/// Bản cũ chỉ làm text.split('\n').map(r =&gt; r.split('\t')) nên VỠ CỘT khi:
///  • một ô Excel chứa xuống dòng (Excel bọc ô đó trong nháy kép)
///  • dữ liệu là CSV dấu chấm phẩy / dấu phẩy
///  • dòng cuối thừa toàn ô rỗng
/// </summary>
public static class TsvParser
{
    public static ParsedTable Parse(string? text, char? forcedDelimiter = null)
    {
        var result = new ParsedTable();
        var src = TextNormalizer.Clean(text);
        if (src.Length == 0) return result;

        var delimiter = forcedDelimiter ?? DetectDelimiter(src);
        result.Delimiter = delimiter;
        result.HasQuotes = src.IndexOf('"') >= 0;

        var raw = (delimiter == '\t' || !result.HasQuotes)
            ? SplitFast(src, delimiter)
            : ParseQuoted(src, delimiter);

        // Chuẩn hoá từng ô, tính số cột lớn nhất.
        int maxCols = 0;
        foreach (var r in raw)
        {
            for (int c = 0; c < r.Length; c++) r[c] = TextNormalizer.Clean(r[c]).Trim();
            if (r.Length > maxCols) maxCols = r.Length;
        }

        // Cắt các dòng rỗng thừa ở cuối (Excel hay copy kèm dòng trống).
        while (raw.Count > 0 && IsEmptyRow(raw[raw.Count - 1])) raw.RemoveAt(raw.Count - 1);

        // Bù cột để bảng chữ nhật (tránh lệch chỉ số cột khi dán vùng không đều).
        foreach (var r in raw)
        {
            if (r.Length < maxCols)
            {
                var padded = new string[maxCols];
                Array.Copy(r, padded, r.Length);
                for (int i = r.Length; i < maxCols; i++) padded[i] = "";
                result.Rows.Add(padded);
            }
            else result.Rows.Add(r);
        }

        result.ColCount = maxCols;
        return result;
    }

    public static char DetectDelimiter(string s)
    {
        var nl = s.IndexOf('\n');
        var firstLine = nl >= 0 ? s.Substring(0, nl) : s;
        if (firstLine.IndexOf('\t') >= 0) return '\t';

        int semi = Count(firstLine, ';');
        int comma = Count(firstLine, ',');
        if (semi >= comma && semi > 0) return ';';   // Excel tiếng Việt hay xuất CSV bằng ';'
        if (comma > 0) return ',';
        return '\t';
    }

    private static int Count(string s, char ch)
    {
        int n = 0;
        for (int i = 0; i < s.Length; i++) if (s[i] == ch) n++;
        return n;
    }

    private static List<string[]> SplitFast(string src, char delimiter)
    {
        var rows = new List<string[]>();
        foreach (var line in src.Split('\n'))
            rows.Add(line.Split(delimiter));
        return rows;
    }

    /// <summary>Parse kiểu RFC4180: ô bọc nháy, nháy thoát bằng "", ô chứa xuống dòng/tab.</summary>
    private static List<string[]> ParseQuoted(string src, char delimiter)
    {
        var rows = new List<string[]>();
        var row = new List<string>();
        var field = new System.Text.StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < src.Length; i++)
        {
            char ch = src[i];
            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (i + 1 < src.Length && src[i + 1] == '"') { field.Append('"'); i++; }
                    else inQuotes = false;
                }
                else field.Append(ch);
            }
            else if (ch == '"' && field.Length == 0) inQuotes = true;
            else if (ch == delimiter) { row.Add(field.ToString()); field.Clear(); }
            else if (ch == '\n')
            {
                row.Add(field.ToString()); field.Clear();
                rows.Add(row.ToArray());
                row.Clear();
            }
            else field.Append(ch);
        }

        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add(row.ToArray());
        }
        return rows;
    }

    private static bool IsEmptyRow(string[] row)
    {
        foreach (var cell in row) if (!string.IsNullOrWhiteSpace(cell)) return false;
        return true;
    }

    /// <summary>
    /// Dò xem dòng nào là tiêu đề, bằng cách so với nhãn/tên cột đã cấu hình.
    /// Trả về chỉ số dòng tiêu đề, hoặc -1 nếu khối dán không có tiêu đề.
    /// </summary>
    public static int DetectHeaderRow(ParsedTable table, IReadOnlyList<FieldMapping> fields)
    {
        if (table.IsEmpty || fields.Count == 0) return -1;

        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var f in fields)
        {
            var names = new List<string>();
            if (f.HeaderNames != null) names.AddRange(f.HeaderNames);
            if (f.Labels != null) names.AddRange(f.Labels);
            foreach (var n in names)
            {
                var a = TextNormalizer.NormSquash(n);
                var b = TextNormalizer.NormSquash(TextNormalizer.NormNoUnits(n));
                if (a.Length > 0) keys.Add(a);
                if (b.Length > 0) keys.Add(b);
            }
        }
        if (keys.Count == 0) return -1;

        int maxScan = Math.Min(2, table.RowCount);   // tiêu đề thường ở dòng 0 hoặc 1
        for (int r = 0; r < maxScan; r++)
        {
            var row = table.Rows[r];
            int hit = 0, considered = 0;
            foreach (var cell in row)
            {
                if (string.IsNullOrWhiteSpace(cell)) continue;
                // Dòng chứa toàn số = dữ liệu, không thể là tiêu đề.
                if (TextNormalizer.IsNumericOnly(cell)) return -1;
                considered++;
                var cs = TextNormalizer.NormSquash(cell);
                var cu = TextNormalizer.NormSquash(TextNormalizer.NormNoUnits(cell));
                if (keys.Contains(cs) || keys.Contains(cu)) hit++;
            }
            if (considered > 0 && hit >= 2 && (double)hit / considered >= 0.5) return r;
        }
        return -1;
    }

    /// <summary>
    /// Ghép mỗi field với chỉ số cột thật trong khối dán.
    /// Ưu tiên khớp TÊN CỘT (để copy thiếu/thừa cột vẫn đúng), rơi về ExcelIndex.
    /// Trả về mảng song song với <paramref name="fields"/>; -1 = không xác định được.
    /// </summary>
    public static int[] ResolveColumns(IReadOnlyList<FieldMapping> fields, string[]? headerRow)
        => ResolveColumns(fields, headerRow, out _);

    /// <summary>
    /// Như trên, nhưng trả thêm SỐ TRƯỜNG KHỚP ĐƯỢC THEO TÊN TIÊU ĐỀ.
    ///
    /// Vì sao cần: hàm này KHÔNG BAO GIỜ trả -1 — không khớp tên thì rơi về vị trí
    /// cột (ExcelIndex). Nên chỉ nhìn mảng kết quả sẽ không phân biệt được "khớp theo
    /// tên tiêu đề" với "đoán theo vị trí", mà đó đúng là điều phải cảnh báo TRƯỚC khi
    /// điền ở chế độ một-chạm (người dùng copy thiếu dòng tiêu đề, hoặc tiêu đề Excel
    /// đã đổi tên so với cấu hình).
    /// </summary>
    public static int[] ResolveColumns(IReadOnlyList<FieldMapping> fields, string[]? headerRow, out int headerMatched)
    {
        headerMatched = 0;
        var cols = new int[fields.Count];
        for (int i = 0; i < cols.Length; i++) cols[i] = fields[i].ExcelIndex;
        if (headerRow == null || headerRow.Length == 0) return cols;

        var header = new (string squash, string noUnits)[headerRow.Length];
        for (int c = 0; c < headerRow.Length; c++)
        {
            header[c] = (TextNormalizer.NormSquash(headerRow[c]),
                         TextNormalizer.NormSquash(TextNormalizer.NormNoUnits(headerRow[c])));
        }

        var used = new bool[headerRow.Length];
        for (int i = 0; i < fields.Count; i++)
        {
            int best = -1, bestScore = 0;
            var names = new List<string>();
            if (fields[i].HeaderNames != null) names.AddRange(fields[i].HeaderNames!);
            if (fields[i].Labels != null) names.AddRange(fields[i].Labels!);

            foreach (var name in names)
            {
                var wantS = TextNormalizer.NormSquash(name);
                var wantU = TextNormalizer.NormSquash(TextNormalizer.NormNoUnits(name));
                if (wantS.Length == 0 && wantU.Length == 0) continue;

                for (int c = 0; c < header.Length; c++)
                {
                    if (used[c]) continue;
                    int score = 0;
                    if (wantS.Length > 0 && header[c].squash == wantS) score = 1000;
                    else if (wantU.Length > 0 && header[c].noUnits == wantU) score = 950;
                    else if (wantS.Length > 0 && header[c].squash.Length > 0 &&
                             (header[c].squash.StartsWith(wantS, StringComparison.Ordinal) ||
                              wantS.StartsWith(header[c].squash, StringComparison.Ordinal))) score = 700;
                    else if (wantU.Length > 0 && header[c].noUnits.Length > 0 &&
                             (header[c].noUnits.StartsWith(wantU, StringComparison.Ordinal) ||
                              wantU.StartsWith(header[c].noUnits, StringComparison.Ordinal))) score = 650;

                    if (score > bestScore) { bestScore = score; best = c; }
                }
            }

            if (best >= 0 && bestScore >= 650) { cols[i] = best; used[best] = true; headerMatched++; }
        }
        return cols;
    }
}
