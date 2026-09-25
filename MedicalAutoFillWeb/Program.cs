using Microsoft.EntityFrameworkCore;
using MedicalAutoFillWeb.Data;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------- CSDL
// Đường dẫn DB lấy từ cấu hình để có thể đặt ra ngoài thư mục app
// (deploy lại không mất cấu hình form).
var dbPath = builder.Configuration["Database:Path"];
if (string.IsNullOrWhiteSpace(dbPath))
    dbPath = Path.Combine(builder.Environment.ContentRootPath, "Data", "medical_autofill.db");
else if (!Path.IsPathRooted(dbPath))
    dbPath = Path.Combine(builder.Environment.ContentRootPath, dbPath);

// Dưới IIS, thư mục app thường CHỈ ĐỌC với identity của app pool => SQLite báo
// "attempt to write a readonly database" và mọi cấu hình mất trắng khi restart.
// Nếu không ghi được thì tự dời DB sang %ProgramData% (luôn ghi được).
dbPath = PickWritableDbPath(dbPath);

var dbDir = Path.GetDirectoryName(dbPath);
if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);

builder.Services.AddDbContext<AppDbContext>(opt => opt.UseSqlite($"Data Source={dbPath}"));

// ---------------------------------------------------------------- HTTP
builder.Services.AddControllersWithViews();

// IHttpClientFactory: bản cũ `new HttpClient()` mỗi request -> cạn socket
// (SocketException / port exhaustion) sau vài chục lần bấm "Điền".
builder.Services.AddHttpClient("bridge", c =>
{
    c.Timeout = TimeSpan.FromSeconds(100);   // điền nhiều dòng có thể chậm
});

// ---------------------------------------------------------------- App
var app = builder.Build();

// Khởi tạo CSDL: tạo nếu chưa có, NÂNG CẤP schema nếu đã có, seed nếu rỗng.
// Bản cũ chỉ EnsureCreated + seed mỗi lần chạy, nên DB cũ thiếu cột mới sẽ làm
// app crash với "no such column" và KHÔNG có đường nào phục hồi ngoài xoá DB
// (mất toàn bộ cấu hình người dùng đã nhập).
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = services.GetRequiredService<AppDbContext>();
        bool created = await db.Database.EnsureCreatedAsync();
        logger.LogInformation("CSDL: {Path} ({State})", dbPath, created ? "mới tạo" : "đã tồn tại");

        SchemaUpgrader.Upgrade(db, logger);
        await DbSeeder.SeedAsync(db, logger);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "KHÔNG khởi động được CSDL tại {Path}. " +
            "Kiểm tra quyền ghi thư mục này.", dbPath);
    }
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

// ---------------------------------------------------------------- Listen
// Bản cũ hardcode http://127.0.0.1:5000 => các máy khác trong LAN KHÔNG vào được
// (mà mục đích của bản web chính là nhiều người dùng chung 1 server).
// Nay: tôn trọng ASPNETCORE_URLS, mặc định nghe mọi card mạng.
// `app.Urls` đã được nạp sẵn từ --urls / ASPNETCORE_URLS nếu người dùng truyền vào
// (run-all.bat dùng --urls). Chỉ đặt mặc định khi CHƯA có gì, nếu không Kestrel sẽ
// bind trùng một cổng hai lần và ném "address already in use".
if (app.Urls.Count == 0)
{
    var fromEnv = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
    if (!string.IsNullOrWhiteSpace(fromEnv))
    {
        app.Urls.Add(fromEnv);
    }
    else
    {
        var host = builder.Configuration["Urls:Host"] ?? "0.0.0.0";
        var port = builder.Configuration["Urls:Port"] ?? "5000";
        app.Urls.Add($"http://{host}:{port}");
    }
}
var urls = string.Join(", ", app.Urls);

var log = app.Services.GetRequiredService<ILogger<Program>>();
log.LogInformation("==========================================================");
log.LogInformation(" Medical Auto Fill — Web");
log.LogInformation(" Nghe tại : {Urls}", urls);
if (urls.Contains("0.0.0.0"))
    log.LogInformation(" (0.0.0.0 = các máy khác trong LAN truy cập được qua http://<ip-máy-chủ>:5000)");
log.LogInformation(" Bridge   : {Bridge}", app.Configuration["Bridge:Url"] ?? "http://127.0.0.1:5119");
if (string.IsNullOrEmpty(app.Configuration["Web:FillToken"]))
    log.LogWarning(" Chưa đặt Web:FillToken — bất kỳ ai vào được trang này đều ra lệnh điền được.");
log.LogInformation("==========================================================");

app.Run();


// ------------------------------------------------------------- local functions
/// <summary>
/// Trả về đường dẫn DB ghi được. Nếu thư mục mong muốn không ghi được (IIS app pool
/// chỉ đọc, ổ đĩa đầy, thư mục bị khoá quyền) thì dời sang %ProgramData%\MedicalAutoFillWeb.
/// </summary>
static string PickWritableDbPath(string preferred)
{
    var dir = Path.GetDirectoryName(preferred);
    if (!string.IsNullOrEmpty(dir) && CanWriteTo(dir)) return preferred;

    var fallbackDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "MedicalAutoFillWeb");
    if (CanWriteTo(fallbackDir))
        return Path.Combine(fallbackDir, Path.GetFileName(preferred));

    return preferred;   // hết đường lui: cứ thử, lỗi sẽ được log rõ ở dưới
}

static bool CanWriteTo(string dir)
{
    try
    {
        Directory.CreateDirectory(dir);
        var probe = Path.Combine(dir, $".write-test-{Guid.NewGuid():N}");
        File.WriteAllText(probe, "ok");
        File.Delete(probe);
        return true;
    }
    catch
    {
        return false;
    }
}
