using Microsoft.EntityFrameworkCore;
using MedicalAutoFillWeb.Data;
using MedicalAutoFillWeb.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={Path.Combine(AppContext.BaseDirectory, "medicalautofill.db")}"));
builder.Services.AddScoped<ScriptBuilderService>();

var app = builder.Build();

// Tắt HTTPS redirect - chỉ dùng HTTP
app.UseDeveloperExceptionPage();

app.UseStaticFiles();
app.UseRouting();

// Không dùng HTTPS

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

// Tự động tạo DB và seed dữ liệu mẫu
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    DbSeeder.Seed(db);
}

app.Run();