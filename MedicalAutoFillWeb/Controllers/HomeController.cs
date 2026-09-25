using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MedicalAutoFillWeb.Data;
using MedicalAutoFillWeb.Models;
using MedicalAutoFillWeb.Services;

namespace MedicalAutoFillWeb.Controllers;

public class HomeController : Controller
{
    private readonly AppDbContext _db;
    private readonly ScriptBuilderService _scriptBuilder;

    public HomeController(AppDbContext db, ScriptBuilderService scriptBuilder)
    {
        _db = db;
        _scriptBuilder = scriptBuilder;
    }

    // Trang chính - load thẳng vào medinet
    public IActionResult Index()
    {
        return View();
    }

    // API trả về script auto-fill
    [HttpGet]
    public async Task<IActionResult> GetScript()
    {
        var forms = await _db.FormProfiles.Include(f => f.Fields).ToListAsync();
        var script = _scriptBuilder.BuildAutoFillScript(forms);
        return Content(script, "application/javascript");
    }

    // API trả về danh sách form (cho JS gọi)
    [HttpGet]
    public async Task<IActionResult> GetForms()
    {
        var forms = await _db.FormProfiles.Include(f => f.Fields).ToListAsync();
        return Json(forms.Select(f => new
        {
            f.Id,
            f.Name,
            f.UrlContains,
            Fields = f.Fields.Select(m => new
            {
                m.ExcelIndex,
                Labels = m.Labels,
                m.ControlType
            })
        }));
    }

    // Form Builder (sửa/thêm form)
    public async Task<IActionResult> Forms()
    {
        var forms = await _db.FormProfiles.Include(f => f.Fields).ToListAsync();
        return View(forms);
    }

    [HttpGet]
    public async Task<IActionResult> EditForm(int id)
    {
        var form = await _db.FormProfiles.Include(f => f.Fields).FirstOrDefaultAsync(f => f.Id == id);
        if (form == null) return NotFound();
        return View(form);
    }

    [HttpPost]
    public async Task<IActionResult> SaveForm(FormProfile model)
    {
        if (model.Id == 0)
        {
            model.Fields ??= new();
            _db.FormProfiles.Add(model);
        }
        else
        {
            var existing = await _db.FormProfiles.Include(f => f.Fields).FirstOrDefaultAsync(f => f.Id == model.Id);
            if (existing == null) return NotFound();
            
            existing.Name = model.Name;
            existing.UrlContains = model.UrlContains;
            
            _db.FieldMappings.RemoveRange(existing.Fields);
            
            if (model.Fields != null)
            {
                foreach (var field in model.Fields)
                {
                    field.FormProfileId = existing.Id;
                    _db.FieldMappings.Add(field);
                }
            }
        }
        
        await _db.SaveChangesAsync();
        return RedirectToAction("Forms");
    }

    [HttpPost]
    public async Task<IActionResult> DeleteForm(int id)
    {
        var form = await _db.FormProfiles.FindAsync(id);
        if (form != null)
        {
            _db.FormProfiles.Remove(form);
            await _db.SaveChangesAsync();
        }
        return RedirectToAction("Forms");
    }

    [HttpPost]
    public async Task<IActionResult> ResetForms()
    {
        // Xóa tất cả form cũ
        var allForms = await _db.FormProfiles.Include(f => f.Fields).ToListAsync();
        foreach (var f in allForms)
            _db.FormProfiles.Remove(f);
        await _db.SaveChangesAsync();
        
        // Seed lại form mặc định
        DbSeeder.Seed(_db);
        
        // Trả về JSON
        return Json(new { success = true, message = "Đã reset form về mặc định" });
    }

    // ====== API: Nhận dữ liệu paste từ Handsontable, gửi xuống MedinetBridge ======
    [HttpPost]
    public async Task<IActionResult> FillMedinet([FromBody] FillMedinetRequest request)
    {
        try
        {
            if (request?.Rows == null || request.Rows.Count == 0)
                return Json(new { success = false, message = "Không có dữ liệu" });

            // Thử gửi xuống MedinetBridge (chạy trên máy chủ ở port 5119)
            var bridgeUrl = "http://127.0.0.1:5119/fill";
            
            // Lấy headers từ dòng đầu nếu có
            var headers = request.Rows.Count > 0 
                ? request.Rows[0].Select((_, i) => $"Column{i}").ToList() 
                : new List<string>();

            var payload = new
            {
                data = request.Rows,
                headers = headers,
                script = request.Script ?? ""
            };

            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            var json = System.Text.Json.JsonSerializer.Serialize(payload);
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            
            try
            {
                var response = await client.PostAsync(bridgeUrl, content);
                var responseBody = await response.Content.ReadAsStringAsync();
                
                if (response.IsSuccessStatusCode)
                {
                    return Content(responseBody, "application/json");
                }
                else
                {
                    return Json(new { success = false, message = $"Bridge báo lỗi: {response.StatusCode}" });
                }
            }
            catch (HttpRequestException)
            {
                // Bridge chưa chạy
                return Json(new { success = false, message = "⚠️ MedinetBridge chưa chạy trên máy chủ! Hãy chạy MedinetBridge.exe trước." });
            }
        }
        catch (Exception ex)
        {
            return Json(new { success = false, message = $"Lỗi: {ex.Message}" });
        }
    }
}

public class FillMedinetRequest
{
    public List<List<string>>? Rows { get; set; }
    public string? Script { get; set; }
}