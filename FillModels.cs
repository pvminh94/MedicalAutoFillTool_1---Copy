using System.Text.Json;
using System.Text.Json.Serialization;

namespace MedicalAutoFillTool;

/// <summary>
/// Các DTO nhận kết quả từ engine JavaScript (window.MAF) gửi về qua
/// chrome.webview.postMessage. Tên thuộc tính khớp camelCase mà engine phát ra.
/// </summary>
public sealed class EngineEnvelope
{
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("payload")] public JsonElement Payload { get; set; }
}

/// <summary>Một trường trong báo cáo điền liệu.</summary>
public sealed class FieldRef
{
    [JsonPropertyName("row")] public int Row { get; set; }
    [JsonPropertyName("label")] public string Label { get; set; } = "";
    [JsonPropertyName("value")] public string? Value { get; set; }
    [JsonPropertyName("raw")] public string? Raw { get; set; }
    [JsonPropertyName("via")] public string? Via { get; set; }
    [JsonPropertyName("reason")] public string? Reason { get; set; }
    [JsonPropertyName("attempts")] public List<string>? Attempts { get; set; }

    public string Describe()
    {
        var s = string.IsNullOrEmpty(Label) ? "(không tên)" : Label;
        if (!string.IsNullOrEmpty(Value)) s += " = " + Value;
        else if (!string.IsNullOrEmpty(Raw)) s += " = " + Raw;
        if (!string.IsNullOrEmpty(Reason)) s += "  [" + Reason + "]";
        return s;
    }
}

/// <summary>Thông tin DOM mà engine đo được lúc điền (để chẩn đoán).</summary>
public sealed class ProbeInfo
{
    [JsonPropertyName("found")] public int Found { get; set; }
    [JsonPropertyName("total")] public int Total { get; set; }
    [JsonPropertyName("labels")] public int Labels { get; set; }
    [JsonPropertyName("inputs")] public int Inputs { get; set; }
}

/// <summary>Báo cáo kết quả một lần điền.</summary>
public sealed class FillReport
{
    [JsonPropertyName("ok")] public int Ok { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
    [JsonPropertyName("hint")] public string? Hint { get; set; }
    [JsonPropertyName("form")] public string? Form { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
    [JsonPropertyName("engineVersion")] public string? EngineVersion { get; set; }
    [JsonPropertyName("timestamp")] public string? Timestamp { get; set; }
    [JsonPropertyName("headerDetected")] public int? HeaderDetected { get; set; }
    [JsonPropertyName("rowsRequested")] public int RowsRequested { get; set; }
    [JsonPropertyName("probe")] public ProbeInfo? Probe { get; set; }
    [JsonPropertyName("filled")] public List<FieldRef> Filled { get; set; } = new();
    [JsonPropertyName("missing")] public List<FieldRef> Missing { get; set; } = new();
    [JsonPropertyName("failed")] public List<FieldRef> Failed { get; set; } = new();
    [JsonPropertyName("emptyRequired")] public List<FieldRef> EmptyRequired { get; set; } = new();

    [JsonIgnore] public DateTime ReceivedAt { get; } = DateTime.Now;
    [JsonIgnore] public bool Success => string.IsNullOrEmpty(Error) && Ok > 0 && Failed.Count == 0;

    /// <summary>Dòng trạng thái ngắn gọn để hiện ở status bar.</summary>
    [JsonIgnore]
    public string Summary
    {
        get
        {
            if (!string.IsNullOrEmpty(Error)) return "❌ " + Error;
            var parts = new List<string>();
            if (Ok > 0) parts.Add(Ok + " OK");
            if (Missing.Count > 0) parts.Add(Missing.Count + " không thấy ô");
            if (Failed.Count > 0) parts.Add(Failed.Count + " ghi lỗi");
            if (EmptyRequired.Count > 0) parts.Add(EmptyRequired.Count + " thiếu dữ liệu");
            return parts.Count == 0 ? "Không có trường nào được điền." : string.Join(", ", parts);
        }
    }

    /// <summary>Báo cáo dạng text để copy/dán vào tin nhắn hỗ trợ hoặc file log.</summary>
    public string ToText()
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("Kết quả điền: " + Summary);
        sb.AppendLine("Form: " + (Form ?? "(không nhận diện)"));
        sb.AppendLine("URL: " + Url);
        sb.AppendLine("Engine: " + EngineVersion + " | Lúc: " + ReceivedAt.ToString("HH:mm:ss"));
        if (Probe != null)
            sb.AppendLine($"DOM: {Probe.Labels} nhãn, {Probe.Inputs} ô nhập, khớp {Probe.Found}/{Probe.Total} trường");
        if (HeaderDetected.HasValue)
            sb.AppendLine("Dòng tiêu đề phát hiện: " + (HeaderDetected.Value >= 0 ? "dòng " + (HeaderDetected.Value + 1) : "không có"));

        if (Missing.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("⚠ KHÔNG TÌM THẤY Ô NHẬP (" + Missing.Count + "):");
            foreach (var m in Missing) sb.AppendLine("   • " + m.Describe());
        }
        if (Failed.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("✖ GHI KHÔNG ĐƯỢC (" + Failed.Count + "):");
            foreach (var f in Failed) sb.AppendLine("   • " + f.Describe());
        }
        if (EmptyRequired.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("○ THIẾU DỮ LIỆU BẮT BUỘC (" + EmptyRequired.Count + "):");
            foreach (var e in EmptyRequired) sb.AppendLine("   • " + e.Label);
        }
        if (Filled.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("✓ ĐÃ ĐIỀN (" + Filled.Count + "):");
            foreach (var f in Filled) sb.AppendLine("   • " + f.Describe() + (string.IsNullOrEmpty(f.Via) ? "" : "  [" + f.Via + "]"));
        }
        return sb.ToString();
    }

    public static FillReport FromJson(string json)
    {
        var report = JsonSerializer.Deserialize<FillReport>(json, JsonOpts.Loose);
        return report ?? new FillReport { Error = "Không đọc được báo cáo từ engine." };
    }

    public static FillReport FromEnvelope(string json)
    {
        var env = JsonSerializer.Deserialize<EngineEnvelope>(json, JsonOpts.Loose);
        if (env == null) return new FillReport { Error = "Thông điệp rỗng từ engine." };
        if (env.Payload.ValueKind != JsonValueKind.Object)
            return new FillReport { Error = "Thông điệp không hợp lệ: " + env.Type };
        var report = env.Payload.Deserialize<FillReport>(JsonOpts.Loose) ?? new FillReport();
        return report;
    }
}

/// <summary>Trạng thái engine báo về lúc trang vừa tải xong.</summary>
public sealed class EngineState
{
    [JsonPropertyName("engineVersion")] public string? EngineVersion { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
    [JsonPropertyName("form")] public string? Form { get; set; }
    [JsonPropertyName("formId")] public string? FormId { get; set; }
    [JsonPropertyName("forms")] public int Forms { get; set; }
    [JsonPropertyName("fields")] public int Fields { get; set; }
    [JsonPropertyName("isWebView2")] public bool IsWebView2 { get; set; }
    [JsonPropertyName("secureContext")] public bool SecureContext { get; set; }
    [JsonPropertyName("hasClipboardApi")] public bool HasClipboardApi { get; set; }
}

/// <summary>Tuỳ chọn JsonSerializer dùng chung (không phân biệt hoa thường, bỏ qua field lạ).</summary>
public static class JsonOpts
{
    public static readonly JsonSerializerOptions Loose = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };
}

/// <summary>
/// Gỡ JSON trả về từ WebView2.ExecuteScriptAsync.
/// LƯU Ý: ExecuteScriptAsync trả về JSON của KẾT QUẢ script. Script của ta lại trả về
/// một CHUỖI (JSON.stringify) nên kết quả là chuỗi JSON đã escape — phải gỡ 2 lớp,
/// nếu không Deserialize sẽ luôn ra null và ta tưởng "engine không phản hồi".
/// </summary>
public static class EngineJson
{
    public static T? Unwrap<T>(string? raw) where T : class
    {
        if (string.IsNullOrWhiteSpace(raw) || raw == "null") return null;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var el = doc.RootElement;
            if (el.ValueKind == JsonValueKind.String)
            {
                var inner = el.GetString();
                if (string.IsNullOrWhiteSpace(inner)) return null;
                return JsonSerializer.Deserialize<T>(inner, JsonOpts.Loose);
            }
            return el.Deserialize<T>(JsonOpts.Loose);
        }
        catch (Exception ex)
        {
            AppLogger.Debug("Không gỡ được JSON từ WebView2: " + ex.Message);
            return null;
        }
    }
}

// ---------------------------------------------------------------------------
// Kết quả "Quét trang" (window.MAF.scan) — dùng trong Cài đặt để dò nhãn/selector
// ---------------------------------------------------------------------------

/// <summary>Một ô nhập tìm được cạnh nhãn.</summary>
public sealed class ScanTarget
{
    [JsonPropertyName("tag")] public string? Tag { get; set; }
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("id")] public string? Id { get; set; }
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("cls")] public string? Cls { get; set; }
    [JsonPropertyName("selector")] public string? Selector { get; set; }

    public string Describe()
    {
        var s = "<" + (Tag ?? "?");
        if (!string.IsNullOrEmpty(Type)) s += " type=" + Type;
        if (!string.IsNullOrEmpty(Id)) s += " id=" + Id;
        if (!string.IsNullOrEmpty(Name)) s += " name=" + Name;
        return s + ">";
    }
}

/// <summary>Một nhãn trên trang kèm ô nhập mà engine suy ra được.</summary>
public sealed class ScanItem
{
    [JsonPropertyName("label")] public string Label { get; set; } = "";
    [JsonPropertyName("tag")] public string? Tag { get; set; }
    [JsonPropertyName("cls")] public string? Cls { get; set; }
    [JsonPropertyName("target")] public ScanTarget? Target { get; set; }
}

/// <summary>Toàn bộ kết quả quét trang.</summary>
public sealed class ScanResult
{
    [JsonPropertyName("count")] public int Count { get; set; }
    [JsonPropertyName("url")] public string? Url { get; set; }
    [JsonPropertyName("items")] public List<ScanItem> Items { get; set; } = new();
    [JsonPropertyName("error")] public string? Error { get; set; }
}
