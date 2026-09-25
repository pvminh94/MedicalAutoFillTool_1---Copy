using System.Text.Json.Serialization;

namespace MedicalAutoFillTool;

/// <summary>Dữ liệu gửi cho engine JavaScript để điền một hoặc nhiều dòng.</summary>
public sealed class FillPayload
{
    /// <summary>Toàn bộ các dòng đã dán (mảng 2 chiều, đã chuẩn hoá).</summary>
    public List<string[]> Rows { get; set; } = new();

    /// <summary>Dòng tiêu đề (nếu phát hiện được) — engine dùng để khớp cột theo TÊN.</summary>
    public string[]? HeaderRow { get; set; }

    /// <summary>Chỉ số dòng cần điền (tuyệt đối trong <see cref="Rows"/>).</summary>
    public int? RowIndex { get; set; }

    /// <summary>Nhiều dòng cần điền liên tiếp (hàng đợi).</summary>
    public List<int>? RowIndexes { get; set; }

    /// <summary>Mapping dùng cho lần điền này. C# gửi rõ để engine KHÔNG phải tự đoán theo URL.</summary>
    public List<FieldMapping>? Fields { get; set; }

    /// <summary>Tên form (chỉ để hiển thị trong báo cáo).</summary>
    public string? FormId { get; set; }

    /// <summary>true = chỉ kiểm tra mapping, KHÔNG ghi dữ liệu.</summary>
    public bool DryRun { get; set; }

    /// <summary>Thời gian chờ form render (ms), ghi đè cấu hình nếu cần.</summary>
    public int? ReadyTimeoutMs { get; set; }
}

/// <summary>
/// Sinh các đoạn JavaScript gửi sang WebView2.
///
/// THAY ĐỔI QUAN TRỌNG: file này KHÔNG còn chứa logic điền form nữa — nó chỉ bọc
/// Shared/maf-engine.js (một nguồn duy nhất, đã có 48 test jsdom). Trước đây logic
/// bị chép tay vào 3 nơi (WinForms, MedinetBridge, Electron) và lệch nhau.
///
/// Lưu ý về async: ExecuteScriptAsync KHÔNG chờ Promise. Vì vậy các lệnh điền
/// không lấy kết quả qua giá trị trả về mà qua window.MAF -> chrome.webview.postMessage
/// (Form1 bắt ở sự kiện WebMessageReceived).
/// </summary>
public static class AutoFillScriptBuilder
{
    /// <summary>Engine + nạp cấu hình. Dùng cho AddScriptToExecuteOnDocumentCreatedAsync.</summary>
    public static string Build(AppConfig config) => EngineScript.BuildBootstrap(config);

    /// <summary>Chỉ nạp lại cấu hình cho trang đang mở (sau khi bấm Lưu trong Cài đặt).</summary>
    public static string BuildConfigure(AppConfig config)
    {
        return "try{ if(window.MAF){ window.MAF.configure(" + AppJson.SerializeForScript(config) + "); } }catch(e){ console.error('[MAF] configure lỗi', e); }";
    }

    /// <summary>Lệnh điền dữ liệu. Kết quả về qua WebMessageReceived.</summary>
    public static string BuildFill(FillPayload payload)
    {
        return InvokeAsync("fill", payload);
    }

    /// <summary>Kiểm tra mapping mà không ghi (nút "Kiểm tra" / F10).</summary>
    public static string BuildDryRun(FillPayload payload)
    {
        payload.DryRun = true;
        return InvokeAsync("fill", payload);
    }

    /// <summary>Chọn "Không" hàng loạt (Ctrl+B).</summary>
    public static string BuildSelectNo(IEnumerable<string>? keywords = null)
    {
        var arg = keywords == null ? "{}" : "{\"keywords\":" + JsonSerializer.Serialize(keywords.ToArray()) + "}";
        return "try{ if(window.MAF){ window.MAF.selectAllNo(" + arg + "); } else { console.warn('[MAF] engine chưa nạp'); } }catch(e){ console.error(e); }";
    }

    /// <summary>Quét trang: trả về JSON (đồng bộ) gồm nhãn + ô nhập kề nó, kèm selector gợi ý.</summary>
    public static string BuildScan(string? filter = null)
    {
        var arg = string.IsNullOrEmpty(filter) ? "{}" : "{\"filter\":" + JsonSerializer.Serialize(filter) + "}";
        return "(function(){ try { return window.MAF ? JSON.stringify(window.MAF.scan(" + arg + ")) : '{\"error\":\"engine chua nap\"}'; } catch(e) { return '{\"error\":\"' + String(e).replace(/\"/g, '') + '\"}'; } })()";
    }

    /// <summary>Trạng thái engine (đồng bộ): form nhận diện được, số trường, phiên bản.</summary>
    public static string BuildState()
    {
        return "(function(){ try { return window.MAF ? JSON.stringify(window.MAF.state()) : '{\"error\":\"engine chua nap\"}'; } catch(e) { return '{\"error\":\"scan fail\"}'; } })()";
    }

    /// <summary>Đếm nhanh số trường tìm thấy ô nhập (đồng bộ) — dùng cho nút Kiểm tra.</summary>
    public static string BuildProbe(List<FieldMapping> fields)
    {
        var json = AppJson.SerializeForScript(fields);
        return "(function(){ try { return window.MAF ? JSON.stringify(window.MAF.probe(" + json + ")) : '{\"error\":\"engine chua nap\"}'; } catch(e) { return '{\"error\":\"probe fail\"}'; } })()";
    }

    /// <summary>Tô vàng một số nhãn trên trang để người dùng thấy mapping khớp chỗ nào.</summary>
    public static string BuildHighlight(IEnumerable<string> labels)
    {
        return "try{ if(window.MAF){ window.MAF.highlightLabels(" + JsonSerializer.Serialize(labels.ToArray()) + "); } }catch(e){ console.error(e); }";
    }

    /// <summary>Buộc engine quét lại DOM (sau khi trang tự vẽ lại form).</summary>
    public static string BuildInvalidate()
    {
        return "try{ if(window.MAF){ window.MAF.invalidate(); } }catch(e){}";
    }

    /// <summary>
    /// Bọc một lời gọi hàm async của engine. Cố ý KHÔNG return giá trị:
    /// ExecuteScriptAsync không chờ Promise, kết quả về qua postMessage.
    /// </summary>
    private static string InvokeAsync(string fn, object payload)
    {
        var json = AppJson.SerializeForScript(payload);
        return "(function(){ try {" +
               "  if(!window.MAF){ console.warn('[MAF] engine chưa được nạp vào trang này');" +
               "    if(window.chrome&&chrome.webview){chrome.webview.postMessage(JSON.stringify({type:'maf:result',payload:{error:'engine-not-loaded'," +
               "message:'Engine chưa nạp vào trang. Hãy tải lại trang (F5).'}}));} return; }" +
               "  window.MAF." + fn + "(" + json + ").catch(function(err){" +
               "    console.error('[MAF] " + fn + " lỗi', err);" +
               "    if(window.chrome&&chrome.webview){chrome.webview.postMessage(JSON.stringify({type:'maf:result',payload:{error:String(err&&err.message||err)," +
               "message:'Lỗi khi điền: '+String(err&&err.message||err)}}));}" +
               "  });" +
               "} catch(e){ console.error('[MAF] lỗi gọi engine', e); } })()";
    }
}
