using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace MedicalAutoFillTool;

/// <summary>
/// Chuẩn hoá chuỗi tiếng Việt — BẢN SAO CỦA CÁC HÀM CÙNG TÊN TRONG Shared/maf-engine.js.
/// Giữ 2 bản giống hệt nhau để: C# dò tiêu đề/dựng bảng xem trước, còn JS điền form,
/// và hai bên hiểu "Huyết sắc tố (g/dL)" theo đúng MỘT cách.
/// </summary>
internal static class TextNormalizer
{
    private static readonly char[] InvisibleChars =
        { '\u00ad', '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '\u2028', '\u2029' };

    /// <summary>Từ nối hay bị lược bỏ khi đặt tên biến/id trong form (hoten, ngaysinh...).</summary>
    private static readonly HashSet<string> Stopwords = new(StringComparer.Ordinal)
    {
        "va", "cua", "cac", "la", "o", "cho", "theo", "hoac", "thi", "ma",
        "de", "cung", "ve", "voi", "trong", "tren", "duoi", "khi", "nguoi"
    };

    /// <summary>
    /// Đơn vị đo hay để trong ngoặc. CHỈ những ngoặc này mới được bỏ khi so khớp:
    /// "ASAT(GOT)" và "ASAT(GPT)" là HAI xét nghiệm khác nhau, bỏ ngoặc mù quáng
    /// sẽ khiến chúng khớp về cùng một nhãn và điền sai kết quả.
    /// </summary>
    private static readonly HashSet<string> UnitWords = new(StringComparer.Ordinal)
    {
        "fl", "pg", "umol", "µmol", "mmol", "mg", "g", "dl", "l", "ml", "ul", "µl",
        "iu", "u", "mmhg", "cm", "mm", "kg", "phut", "giay", "ngay", "thang", "nam",
        "tuoi", "lan", "k", "m", "t", "leu", "ery", "10 9", "10 6", "10 3"
    };

    private static readonly Regex SpaceRun = new(@"\s+", RegexOptions.Compiled);
    private static readonly Regex NumericOnly = new(@"^[\d\s.,:%/+*()-]*$", RegexOptions.Compiled);

    /// <summary>Bỏ ký tự ẩn + NBSP thành space + thống nhất xuống dòng.</summary>
    public static string Clean(string? v)
    {
        if (string.IsNullOrEmpty(v)) return "";
        var s = v;
        foreach (var c in InvisibleChars) s = s.Replace(c.ToString(), "");
        s = s.Replace('\u00a0', ' ').Replace('\u2007', ' ').Replace('\u202f', ' ');
        s = s.Replace("\r\n", "\n").Replace('\r', '\n');
        return s;
    }

    /// <summary>Bỏ dấu, lowercase, ký tự không phải chữ/số thành space, gộp khoảng trắng.</summary>
    public static string Norm(string? v)
    {
        var s = Clean(v).ToLowerInvariant();
        s = s.Replace('đ', 'd').Replace('Đ', 'd');

        var sb = new StringBuilder(s.Length);
        foreach (var ch in s.Normalize(NormalizationForm.FormD))
        {
            if (char.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(ch);
        }

        var t = sb.ToString().Normalize(NormalizationForm.FormC);
        var sb2 = new StringBuilder(t.Length);
        foreach (var ch in t)
        {
            bool keep = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'z');
            sb2.Append(keep ? ch : ' ');
        }
        return SpaceRun.Replace(sb2.ToString(), " ").Trim();
    }

    /// <summary>Norm + bỏ mọi khoảng trắng ("Họ và tên" -&gt; "hovaten").</summary>
    public static string NormSquash(string? v) => Norm(v).Replace(" ", "");

    /// <summary>Norm + bỏ từ nối + bỏ khoảng trắng ("Họ và tên" -&gt; "hoten").</summary>
    public static string NormCompact(string? v)
    {
        var parts = Norm(v).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var keep = new List<string>(parts.Length);
        foreach (var p in parts) if (!Stopwords.Contains(p)) keep.Add(p);
        if (keep.Count == 0) keep.AddRange(parts);
        return string.Concat(keep);
    }

    /// <summary>Loại các ngoặc là ĐƠN VỊ rồi Norm ("Creatinin (umol/L)" -&gt; "creatinin").</summary>
    public static string NormNoUnits(string? v)
    {
        var s = Clean(v).ToLowerInvariant();
        s = Regex.Replace(s, @"\(([^)]{0,24})\)", m => IsUnitLike(m.Groups[1].Value) ? " " : m.Value);
        s = Regex.Replace(s, @"\[[^\]]{0,24}\]", " ");
        return Norm(s);
    }

    public static bool IsUnitLike(string inner)
    {
        var t = Clean(inner).Trim();
        if (t.Length == 0) return true;
        if (t.IndexOf('/') >= 0) return true;         // g/dL, U/L, K/µL, 10^9/L
        if (t == "%" || t == "‰") return true;
        if (Regex.IsMatch(t, @"^[\d.,]+$")) return false;   // "(2)" là số thứ tự
        return UnitWords.Contains(Norm(t));
    }

    /// <summary>Ô chỉ chứa số/dấu câu = dữ liệu trong bảng, không phải nhãn.</summary>
    public static bool IsNumericOnly(string? v)
    {
        var t = Clean(v).Trim();
        return t.Length > 0 && NumericOnly.IsMatch(t);
    }

    /// <summary>
    /// So "mềm": dùng để xác nhận giá trị đã ghi được vào ô hay bị widget hoàn tác.
    /// Chấp nhận khác biệt kiểu 1.500,5 / 1500.5 và khoảng trắng.
    /// </summary>
    public static bool LooseEqual(string? a, string? b)
    {
        var x = Norm(a);
        var y = Norm(b);
        if (x == y) return true;
        if (x.Length == 0 || y.Length == 0) return false;

        var xn = x.Replace(" ", "").Replace(',', '.');
        var yn = y.Replace(" ", "").Replace(',', '.');
        if (xn == yn) return true;

        if (double.TryParse(xn, NumberStyles.Float, CultureInfo.InvariantCulture, out var xf) &&
            double.TryParse(yn, NumberStyles.Float, CultureInfo.InvariantCulture, out var yf))
        {
            return Math.Abs(xf - yf) < 1e-9;
        }
        return false;
    }
}
