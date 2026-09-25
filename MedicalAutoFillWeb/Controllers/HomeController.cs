using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MedicalAutoFillWeb.Data;
using MedicalAutoFillWeb.Models;

namespace MedicalAutoFillWeb.Controllers;

// =============================================================================
//  HomeController — trang dán dữ liệu + cầu nối tới MedinetBridge.
//
//  NHỮNG LỖI CỦA BẢN CŨ ĐÃ SỬA:
//   1. GỬI SAI DỮ LIỆU CHO BRIDGE: bản cũ gửi `data` + một `script` hardcode
//      sinh ra từ danh sách field NHƯNG bridge lại bỏ qua script đó và dùng bộ
//      nhãn hardcode riêng => mapping trên web vô tác dụng. Nay gửi `rows` +
//      `headerRow` + `fields` (đúng cấu trúc engine), bridge dùng chung engine.
//   2. Chỉ gửi `rows[0]` (dòng đầu tiên) => người dùng dán 10 bệnh nhân thì
//      chỉ 1 người được điền. Nay gửi toàn bộ + chọn dòng đang bôi đen.
//   3. Index cột cứng, không có dòng tiêu đề => lệch cột.
//   4. `new HttpClient()` mỗi request => cạn socket (SocketException sau vài
//      chục lần gọi). Nay dùng IHttpClientFactory.
//   5. `/Home/FillMedinet` là open relay: ai cũng POST được, kể cả từ ngoài LAN.
//      Nay có tuỳ chọn token + giới hạn kích thước + chỉ gọi bridge loopback.
//   6. `catch { "Failed to fetch" }` che mất nguyên nhân thật.
// =============================================================================

public class HomeController : Controller
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<HomeController> _logger;
    private readonly IConfiguration _config;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public HomeController(AppDbContext db, IHttpClientFactory httpFactory,
                          ILogger<HomeController> logger, IConfiguration config)
    {
        _db = db;
        _httpFactory = httpFactory;
        _logger = logger;
        _config = config;
    }

    private string BridgeUrl => _config["Bridge:Url"] ?? "http://127.0.0.1:5119";
    private string BridgeToken => _config["Bridge:Token"] ?? "";

    // ------------------------------------------------------------------ trang
    public IActionResult Index()
    {
        var forms = _db.FormProfiles.Include(f => f.Fields).AsNoTracking().ToList();
        ViewBag.FormCount = forms.Count;
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }

    /// <summary>
    /// Engine JS dùng chung (Shared/maf-engine.js) — phục vụ ngay từ app, KHÔNG CDN.
    /// Trang web dùng nó để parse dữ liệu dán và tự nhận diện dòng tiêu đề,
    /// đúng cùng một thuật toán mà bridge/WinForms dùng khi điền.
    /// </summary>
    [HttpGet]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Client)]
    public IActionResult EngineJs()
    {
        try
        {
            var js = EngineAsset.Load();
            return Content(js, "application/javascript; charset=utf-8");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Không nạp được engine JS nhúng");
            return Content("/* Không nạp được maf-engine.js: " + ex.Message.Replace("*/", "") + " */",
                           "application/javascript; charset=utf-8");
        }
    }

    // ------------------------------------------------------------------ forms
    [HttpGet]
    public async Task<IActionResult> GetForms()
    {
        var forms = await _db.FormProfiles
            .Include(f => f.Fields.OrderBy(x => x.ExcelIndex))
            .AsNoTracking()
            .ToListAsync();

        var result = forms.Select(f => new
        {
            id = f.Id,
            name = f.Name,
            displayName = f.DisplayName,
            url = f.Url,
            urlRegex = f.UrlRegex,
            description = f.Description,
            noQuestionLabels = f.NoQuestionLabels,
            fields = f.Fields.OrderBy(x => x.ExcelIndex).Select(x => new
            {
                excelIndex = x.ExcelIndex,
                labels = SplitList(x.Labels),
                headerNames = SplitList(x.HeaderNames),
                selector = x.Selector,
                controlType = x.ControlType,
                required = x.Required,
                transform = x.Transform
            }).ToList()
        }).ToList();

        return Json(result);
    }

    [HttpGet]
    public async Task<IActionResult> EditForm(int? id)
    {
        bool wantNew = string.Equals(Request.Query["new"], "1", StringComparison.Ordinal);

        FormProfile? form = null;
        if (!wantNew)
        {
            form = id.HasValue
                ? await _db.FormProfiles.Include(f => f.Fields.OrderBy(x => x.ExcelIndex)).FirstOrDefaultAsync(f => f.Id == id.Value)
                : await _db.FormProfiles.Include(f => f.Fields.OrderBy(x => x.ExcelIndex)).OrderBy(f => f.Id).FirstOrDefaultAsync();
        }

        ViewBag.Form = form;
        ViewBag.AllForms = await _db.FormProfiles.OrderBy(f => f.Id).AsNoTracking().ToListAsync();
        ViewBag.FormJson = form == null ? "null" : JsonSerializer.Serialize(ToFormDto(form), JsonOpts);
        return View();
    }

    /// <summary>
    /// Bản cũ có Views/Home/Forms.cshtml nhưng KHÔNG có action Forms -> /Home/Forms 404.
    /// Giữ route này để không phá bookmark cũ, chuyển về trang cấu hình hợp nhất.
    /// </summary>
    [HttpGet]
    public IActionResult Forms() => RedirectToAction(nameof(EditForm));

    /// <summary>Đúng cấu trúc JSON mà EditForm.cshtml mong đợi (camelCase).</summary>
    private static object ToFormDto(FormProfile f) => new
    {
        id = f.Id,
        name = f.Name,
        displayName = f.DisplayName,
        url = f.Url,
        urlRegex = f.UrlRegex,
        description = f.Description,
        noQuestionLabels = f.NoQuestionLabels,
        fields = f.Fields.OrderBy(x => x.ExcelIndex).Select(x => new
        {
            excelIndex = x.ExcelIndex,
            labels = SplitList(x.Labels),
            headerNames = SplitList(x.HeaderNames),
            selector = x.Selector,
            controlType = x.ControlType ?? "auto",
            required = x.Required,
            transform = x.Transform
        }).ToList()
    };

    [HttpPost]
    public async Task<IActionResult> SaveForm([FromBody] FormProfileDto dto)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { message = "Thiếu tên form." });

        try
        {
            FormProfile form;
            bool isNew = dto.Id <= 0;

            if (isNew)
            {
                form = new FormProfile
                {
                    Name = dto.Name.Trim(),
                    DisplayName = dto.DisplayName?.Trim(),
                    Url = dto.Url?.Trim(),
                    UrlRegex = dto.UrlRegex?.Trim(),
                    Description = dto.Description?.Trim(),
                    NoQuestionLabels = dto.NoQuestionLabels?.Trim()
                };
                _db.FormProfiles.Add(form);
            }
            else
            {
                var existing = await _db.FormProfiles.FirstOrDefaultAsync(f => f.Id == dto.Id);
                if (existing == null) return NotFound(new { message = "Không tìm thấy form id=" + dto.Id });
                form = existing;
                form.Name = dto.Name.Trim();
                form.DisplayName = dto.DisplayName?.Trim();
                form.Url = dto.Url?.Trim();
                form.UrlRegex = dto.UrlRegex?.Trim();
                form.Description = dto.Description?.Trim();
                form.NoQuestionLabels = dto.NoQuestionLabels?.Trim();
            }

            // Thay toàn bộ fields: cấu hình trường ít và luôn được gửi đủ từ client.
            if (!isNew)
            {
                var old = _db.FieldMappings.Where(f => f.FormProfileId == form.Id);
                _db.FieldMappings.RemoveRange(old);
            }

            var seenIndex = new HashSet<int>();
            var idx = 0;
            foreach (var f in (dto.Fields ?? new List<FieldMappingDto>()))
            {
                // Không cho 2 trường dùng chung 1 cột Excel: bản cũ cho phép,
                // dẫn tới 2 ô trên web nhận cùng 1 giá trị rất khó hiểu.
                if (!seenIndex.Add(f.ExcelIndex))
                {
                    _logger.LogWarning("Bỏ trường '{Label}' vì trùng cột Excel {Index}", f.Labels, f.ExcelIndex);
                    continue;
                }

                _db.FieldMappings.Add(new FieldMapping
                {
                    FormProfileId = isNew ? 0 : form.Id,
                    ExcelIndex = f.ExcelIndex,
                    Labels = JoinList(f.Labels),
                    HeaderNames = JoinList(f.HeaderNames),
                    Selector = f.Selector,
                    ControlType = f.ControlType,
                    Required = f.Required,
                    Transform = f.Transform,
                    FormProfile = isNew ? form : null
                });
                idx++;
            }

            await _db.SaveChangesAsync();
            _logger.LogInformation("Đã lưu form {Name} với {Count} trường", form.Name, idx);
            return Ok(new { message = $"Đã lưu form '{form.DisplayName ?? form.Name}' ({idx} trường).", id = form.Id });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi lưu form");
            return StatusCode(500, new { message = "Không lưu được: " + ex.Message });
        }
    }

    /// <summary>Script nạp vào DevTools — nay chính là engine dùng chung + cấu hình.</summary>
    [HttpGet]
    public async Task<IActionResult> Script(int? id)
    {
        FormProfile? form = id.HasValue
            ? await _db.FormProfiles.Include(f => f.Fields).FirstOrDefaultAsync(f => f.Id == id.Value)
            : await _db.FormProfiles.Include(f => f.Fields).OrderBy(f => f.Id).FirstOrDefaultAsync();

        var script = Services.ScriptBuilderService.Build(form);
        return Content(script, "application/javascript; charset=utf-8");
    }

    // ---------------------------------------------------------------- bridge
    /// <summary>Trang web dùng endpoint này để hiện badge "Bridge sẵn sàng/không".</summary>
    [HttpGet]
    public async Task<IActionResult> BridgeStatus()
    {
        try
        {
            var client = _httpFactory.CreateClient("bridge");
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(4));
            var resp = await client.GetAsync(BridgeUrl.TrimEnd('/') + "/status", cts.Token);
            if (!resp.IsSuccessStatusCode)
                return Json(new { reachable = false, message = "Bridge trả về HTTP " + (int)resp.StatusCode });

            var raw = await resp.Content.ReadAsStringAsync(cts.Token);
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
            var root = doc.RootElement;

            string url = root.TryGetProperty("url", out var u) ? (u.GetString() ?? "") : "";
            string engine = root.TryGetProperty("engine", out var e) ? (e.GetString() ?? "") : "";

            // Báo cho người dùng biết Bridge có đang mở ĐÚNG form không.
            bool? formDetected = null;
            var forms = await _db.FormProfiles.AsNoTracking().ToListAsync();
            if (forms.Count > 0 && !string.IsNullOrEmpty(url))
                formDetected = forms.Any(f => Services.ScriptBuilderService.UrlMatches(f, url));

            return Json(new
            {
                reachable = true,
                status = root.TryGetProperty("status", out var s) ? s.GetString() : "",
                url,
                engine,
                formDetected
            });
        }
        catch (Exception ex)
        {
            return Json(new { reachable = false, message = DescribeBridgeFailure(ex) });
        }
    }

    // ------------------------------------------------------------------ điền
    [HttpPost]
    public async Task<IActionResult> FillMedinet([FromBody] FillWebRequest request)
    {
        if (request == null || request.Rows == null || request.Rows.Count == 0)
            return BadRequest(new { success = false, message = "Không có dữ liệu để điền." });

        // --- Bảo vệ: endpoint này ra lệnh cho máy chủ điền hồ sơ bệnh nhân.
        var token = _config["Web:FillToken"];
        if (!string.IsNullOrEmpty(token))
        {
            var got = Request.Headers["X-MAF-Token"].FirstOrDefault() ?? "";
            if (!string.Equals(got, token, StringComparison.Ordinal))
                return StatusCode(401, new { success = false, message = "Sai token điền form (Web:FillToken)." });
        }

        // Giới hạn kích thước: 5.000 dòng là quá đủ cho một ca trực.
        if (request.Rows.Count > 5000)
            return BadRequest(new { success = false, message = "Quá nhiều dòng (" + request.Rows.Count + "). Tối đa 5000." });

        var form = await _db.FormProfiles
            .Include(f => f.Fields)
            .FirstOrDefaultAsync(f => f.Id == request.FormId);

        if (form == null)
            return NotFound(new { success = false, message = "Không tìm thấy form id=" + request.FormId });

        var fields = form.Fields.OrderBy(f => f.ExcelIndex).Select(f => new
        {
            excelIndex = f.ExcelIndex,
            labels = SplitList(f.Labels),
            headerNames = SplitList(f.HeaderNames),
            selector = f.Selector,
            controlType = f.ControlType,
            required = f.Required,
            transform = f.Transform
        }).ToList();

        if (fields.Count == 0)
            return BadRequest(new { success = false, message = "Form này chưa cấu hình trường nào." });

        // Chọn dòng cần điền. Bản cũ luôn lấy rows[0] và trừ 1 một cách tuỳ tiện.
        int rowIndex = ComputeRowIndex(request);

        var payload = new
        {
            rows = request.Rows,
            headerRow = request.HeaderRow,
            headerRowIndex = request.HeaderRowIndex,
            rowIndex,
            rowIndexes = request.FillAll ? Enumerable.Range(0, request.Rows.Count).ToList() : null,
            fields,
            formId = form.Name,
            dryRun = request.DryRun
        };

        _logger.LogInformation(
            "Gửi bridge: form={Form}, {Rows} dòng, dòng điền={Idx}, {Fields} trường, dryRun={Dry}",
            form.Name, request.Rows.Count, rowIndex, fields.Count, request.DryRun);

        try
        {
            var client = _httpFactory.CreateClient("bridge");
            var content = new StringContent(JsonSerializer.Serialize(payload, JsonOpts), Encoding.UTF8, "application/json");
            if (!string.IsNullOrEmpty(BridgeToken))
                client.DefaultRequestHeaders.TryAddWithoutValidation("X-MAF-Token", BridgeToken);

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
            var resp = await client.PostAsync(BridgeUrl.TrimEnd('/') + "/fill", content, cts.Token);
            var raw = await resp.Content.ReadAsStringAsync(cts.Token);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("Bridge trả về HTTP {Code}: {Body}", (int)resp.StatusCode, Trunc(raw, 400));
                return StatusCode(502, new { success = false, message = $"Bridge trả về lỗi HTTP {(int)resp.StatusCode}. {Trunc(raw, 300)}" });
            }

            // Trả nguyên văn báo cáo của bridge/engine cho trang web hiển thị.
            try
            {
                using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
                return new ContentResult
                {
                    Content = doc.RootElement.GetRawText(),
                    ContentType = "application/json; charset=utf-8",
                    StatusCode = 200
                };
            }
            catch
            {
                return Ok(new { success = true, message = "Bridge đã nhận lệnh (không đọc được báo cáo chi tiết)." });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Không gọi được MedinetBridge");
            return Ok(new
            {
                success = false,
                message = "Không kết nối được MedinetBridge (" + BridgeUrl + "). " + DescribeBridgeFailure(ex)
            });
        }
    }

    [HttpPost]
    public async Task<IActionResult> SelectNoMedinet()
    {
        var form = await _db.FormProfiles.OrderBy(f => f.Id).FirstOrDefaultAsync();
        if (form == null)
            return NotFound(new { success = false, message = "Chưa có form nào trong CSDL." });

        var payload = new
        {
            labels = SplitList(form.NoQuestionLabels),
            value = "Không"
        };

        try
        {
            var client = _httpFactory.CreateClient("bridge");
            var content = new StringContent(JsonSerializer.Serialize(payload, JsonOpts), Encoding.UTF8, "application/json");
            if (!string.IsNullOrEmpty(BridgeToken))
                client.DefaultRequestHeaders.TryAddWithoutValidation("X-MAF-Token", BridgeToken);

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            var resp = await client.PostAsync(BridgeUrl.TrimEnd('/') + "/selectno", content, cts.Token);
            var raw = await resp.Content.ReadAsStringAsync(cts.Token);
            try
            {
                using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
                return new ContentResult { Content = doc.RootElement.GetRawText(), ContentType = "application/json; charset=utf-8", StatusCode = 200 };
            }
            catch
            {
                return Ok(new { success = resp.IsSuccessStatusCode, message = raw });
            }
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, message = "Không kết nối được Bridge: " + DescribeBridgeFailure(ex) });
        }
    }

    // ---------------------------------------------------------------- helper
    /// <summary>
    /// Xác định dòng trong `rows` sẽ được điền.
    /// rows gửi lên gồm CẢ dòng tiêu đề, nên rowIndex là chỉ số trong chính mảng đó.
    /// </summary>
    private static int ComputeRowIndex(FillWebRequest request)
    {
        int total = request.Rows.Count;
        int sel = request.SelectedRow ?? 0;

        if (request.HeaderRowIndex.HasValue && request.HeaderRowIndex.Value >= 0)
        {
            int firstData = request.HeaderRowIndex.Value + 1;
            // Người dùng đang chọn đúng dòng tiêu đề -> dùng dòng dữ liệu đầu tiên.
            if (sel <= request.HeaderRowIndex.Value) sel = firstData;
        }

        if (sel < 0) sel = 0;
        if (sel >= total) sel = total - 1;
        return sel;
    }

    private static string DescribeBridgeFailure(Exception ex)
    {
        var inner = ex.InnerException?.Message ?? ex.Message;
        if (ex is HttpRequestException || inner.Contains("refused", StringComparison.OrdinalIgnoreCase)
            || inner.Contains("Connection", StringComparison.OrdinalIgnoreCase))
            return "Có thể MedinetBridge.exe chưa chạy trên máy chủ, hoặc đang chạy ở cổng khác. " +
                   "Hãy mở Bridge trên máy chủ (nó sẽ hiện cửa sổ medinet) rồi thử lại. Chi tiết: " + inner;
        if (ex is TaskCanceledException || ex is OperationCanceledException)
            return "Bridge không phản hồi kịp (timeout). Có thể trang medinet trong Bridge đang tải hoặc bị treo.";
        return inner;
    }

    private static string Trunc(string s, int n) => s.Length <= n ? s : s.Substring(0, n) + "...";

    /// <summary>Tách chuỗi "a;b;c" trong CSDL thành danh sách (bỏ phần tử rỗng).</summary>
    private static List<string> SplitList(string? s) =>
        string.IsNullOrWhiteSpace(s)
            ? new List<string>()
            : s.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

    private static string? JoinList(List<string>? items) =>
        items == null || items.Count == 0
            ? null
            : string.Join(";", items.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()));
}

// ---------------------------------------------------------------------- DTO
public class FillWebRequest
{
    public int FormId { get; set; }
    public List<List<string>> Rows { get; set; } = new();
    public List<string>? HeaderRow { get; set; }
    public int? HeaderRowIndex { get; set; }
    public int? SelectedRow { get; set; }
    public bool DryRun { get; set; }
    public bool FillAll { get; set; }
    public bool ReloadFirst { get; set; }
}

public class FormProfileDto
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? DisplayName { get; set; }
    public string? Url { get; set; }
    public string? UrlRegex { get; set; }
    public string? Description { get; set; }
    public string? NoQuestionLabels { get; set; }
    public List<FieldMappingDto>? Fields { get; set; }
}

public class FieldMappingDto
{
    public int ExcelIndex { get; set; }
    public string? Labels { get; set; }
    public string? HeaderNames { get; set; }
    public string? Selector { get; set; }
    public string? ControlType { get; set; }
    public bool Required { get; set; }
    public string? Transform { get; set; }
}

/// <summary>Nạp Shared/maf-engine.js đã nhúng vào assembly.</summary>
public static class EngineAsset
{
    private const string ResourceName = "maf-engine.js";
    private static string? _cached;

    public static string Load()
    {
        if (_cached != null) return _cached;

        var asm = System.Reflection.Assembly.GetExecutingAssembly();
        foreach (var n in asm.GetManifestResourceNames())
        {
            if (string.Equals(n, ResourceName, StringComparison.OrdinalIgnoreCase) ||
                n.EndsWith(ResourceName, StringComparison.OrdinalIgnoreCase))
            {
                using var stream = asm.GetManifestResourceStream(n)!;
                using var reader = new StreamReader(stream, Encoding.UTF8);
                _cached = reader.ReadToEnd();
                return _cached;
            }
        }
        throw new InvalidOperationException(
            "Không tìm thấy tài nguyên nhúng '" + ResourceName + "'. " +
            "Kiểm tra mục EmbeddedResource trong MedicalAutoFillWeb.csproj.");
    }
}
