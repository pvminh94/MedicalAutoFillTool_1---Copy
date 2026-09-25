using Microsoft.EntityFrameworkCore;
using MedicalAutoFillWeb.Models;

namespace MedicalAutoFillWeb.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<FormProfile> FormProfiles => Set<FormProfile>();
    public DbSet<FieldMapping> FieldMappings => Set<FieldMapping>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Danh sách nhãn / tên cột lưu dạng "a;b;c" trong SQLite cho đơn giản.
        modelBuilder.Entity<FieldMapping>()
            .Property(f => f.Labels)
            .HasConversion(
                v => v ?? string.Empty,
                v => string.IsNullOrEmpty(v) ? null : v);

        modelBuilder.Entity<FieldMapping>()
            .Property(f => f.HeaderNames)
            .HasConversion(
                v => v ?? string.Empty,
                v => string.IsNullOrEmpty(v) ? null : v);

        modelBuilder.Entity<FormProfile>()
            .HasMany(f => f.Fields)
            .WithOne(f => f.FormProfile!)
            .HasForeignKey(f => f.FormProfileId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<FieldMapping>()
            .HasIndex(f => new { f.FormProfileId, f.ExcelIndex });
    }
}
