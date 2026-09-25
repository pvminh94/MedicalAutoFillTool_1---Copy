using System.Diagnostics;
using System.Runtime.InteropServices;

namespace MedicalAutoFillTool;

/// <summary>Ảnh chụp clipboard tại một thời điểm, kèm thông tin để báo lỗi rõ ràng.</summary>
public sealed class ClipboardSnapshot
{
    /// <summary>Nội dung text (UnicodeText/Text) — dữ liệu bảng copy từ Excel nằm ở đây.</summary>
    public string Text { get; init; } = "";

    /// <summary>Định dạng "Csv" mà Excel đặt riêng lên clipboard (nếu có).</summary>
    public string? Csv { get; init; }

    /// <summary>Định dạng "HTML Format" (chỉ dùng để chẩn đoán).</summary>
    public bool HasHtml { get; init; }

    public int Attempts { get; init; }
    public long ElapsedMs { get; init; }
    public string? Error { get; init; }

    public bool Ok => Error == null && Text.Length > 0;
    public bool HasData => Text.Length > 0;

    /// <summary>Khối dữ liệu nên dùng: ưu tiên text (TSV) vì giữ được tab phân cột.</summary>
    public string BestText => Text.Length > 0 ? Text : (Csv ?? "");

    public static ClipboardSnapshot Empty(string error) => new() { Error = error, Text = "" };
}

/// <summary>
/// Đọc clipboard Windows một cách BỀN BỈ.
///
/// Vì sao đây là chỗ hay lỗi nhất: clipboard là tài nguyên DÙNG CHUNG toàn hệ thống.
/// Khi Excel chưa nhả, hoặc một trình quản lý clipboard / RDP / Unikey đang mở nó,
/// OpenClipboard() thất bại và Clipboard.GetText() ném ExternalException.
/// Bản cũ gọi thẳng một lần => đúng lúc đó là "không copy paste được", bấm lại thì được.
///
/// Cách xử lý: đọc qua IDataObject + retry với backoff, và LUÔN chạy trên luồng STA.
/// </summary>
public static class ClipboardService
{
    private const string FormatCsv = "Csv";
    private const string FormatHtml = "HTML Format";

    /// <summary>Đọc clipboard, tự retry khi bị tiến trình khác giữ.</summary>
    public static ClipboardSnapshot Read(int maxAttempts = 12, int baseDelayMs = 25)
    {
        var sw = Stopwatch.StartNew();

        if (System.Threading.Thread.CurrentThread.GetApartmentState() != System.Threading.ApartmentState.STA)
        {
            // Gọi từ luồng nền là lỗi lập trình; báo rõ thay vì ném khó hiểu.
            return ClipboardSnapshot.Empty("Clipboard chỉ đọc được từ luồng giao diện (STA).");
        }

        string text = "";
        string? csv = null;
        bool hasHtml = false;
        string? lastError = null;
        int attempt = 0;

        for (; attempt < maxAttempts; attempt++)
        {
            try
            {
                var data = System.Windows.Forms.Clipboard.GetDataObject();
                if (data == null)
                {
                    lastError = "Clipboard trống (chưa copy gì).";
                    break;   // clipboard trống thì retry vô ích
                }

                // Đọc tất cả định dạng cần thiết trong MỘT lần mở clipboard.
                if (data.GetDataPresent(DataFormats.UnicodeText, false) || data.GetDataPresent(DataFormats.Text, false))
                {
                    text = System.Windows.Forms.Clipboard.GetText(TextDataFormat.UnicodeText);
                    if (string.IsNullOrEmpty(text)) text = System.Windows.Forms.Clipboard.GetText();
                }
                if (string.IsNullOrEmpty(text) && data.GetDataPresent(DataFormats.StringFormat))
                {
                    text = data.GetData(DataFormats.StringFormat) as string ?? "";
                }
                if (data.GetDataPresent(FormatCsv, false))
                {
                    csv = SafeGetData(data, FormatCsv) as string;
                }
                hasHtml = data.GetDataPresent(FormatHtml, false);
                lastError = null;
                break;   // thành công
            }
            catch (ExternalException ex)
            {
                // 0x800401D0 = CLIPBRD_E_CANT_OPEN: tiến trình khác đang giữ clipboard.
                lastError = "Clipboard đang bị một chương trình khác giữ (0x" +
                            ex.HResult.ToString("X8") + ").";
                System.Threading.Thread.Sleep(baseDelayMs * (attempt + 1));   // backoff tuyến tính
            }
            catch (Exception ex)
            {
                lastError = "Không đọc được clipboard: " + ex.Message;
                System.Threading.Thread.Sleep(baseDelayMs * (attempt + 1));
            }
        }

        sw.Stop();

        if (string.IsNullOrEmpty(text) && string.IsNullOrEmpty(csv))
        {
            return new ClipboardSnapshot
            {
                Text = "",
                Csv = null,
                HasHtml = hasHtml,
                Attempts = attempt + 1,
                ElapsedMs = sw.ElapsedMilliseconds,
                Error = lastError ?? "Trong clipboard không có nội dung chữ. Hãy bôi đen vùng dữ liệu trong Excel rồi bấm Ctrl+C."
            };
        }

        return new ClipboardSnapshot
        {
            Text = TextNormalizer.Clean(text),
            Csv = string.IsNullOrEmpty(csv) ? null : TextNormalizer.Clean(csv),
            HasHtml = hasHtml,
            Attempts = attempt + 1,
            ElapsedMs = sw.ElapsedMilliseconds,
            Error = null
        };
    }

    private static object? SafeGetData(IDataObject data, string format)
    {
        try { return data.GetData(format, false); }
        catch { return null; }
    }

    /// <summary>
    /// Đọc và phân tích luôn thành bảng. Tiện cho nút "Dán &amp; Điền".
    /// </summary>
    public static (ClipboardSnapshot clip, ParsedTable table) ReadTable(IReadOnlyList<FieldMapping> fields, char? delimiter = null)
    {
        var clip = Read();
        if (!clip.HasData) return (clip, new ParsedTable());

        var table = TsvParser.Parse(clip.BestText, delimiter);
        table.HeaderRowIndex = TsvParser.DetectHeaderRow(table, fields);
        return (clip, table);
    }

    /// <summary>Trả lại chuỗi vừa đọc vào clipboard (dùng khi cần copy kết quả báo cáo).</summary>
    public static bool Write(string text)
    {
        for (int i = 0; i < 5; i++)
        {
            try
            {
                System.Windows.Forms.Clipboard.SetText(text ?? "");
                return true;
            }
            catch (ExternalException)
            {
                System.Threading.Thread.Sleep(30 * (i + 1));
            }
            catch
            {
                return false;
            }
        }
        return false;
    }
}
