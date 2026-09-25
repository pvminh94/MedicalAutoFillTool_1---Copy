using Microsoft.EntityFrameworkCore;
using MedicalAutoFillWeb.Models;

namespace MedicalAutoFillWeb.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }
    
    public DbSet<FormProfile> FormProfiles => Set<FormProfile>();
    public DbSet<FieldMapping> FieldMappings => Set<FieldMapping>();
    
    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.Entity<FormProfile>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.UrlContains).HasMaxLength(500);
        });
        
        builder.Entity<FieldMapping>(entity =>
        {
            entity.HasKey(e => new { e.FormProfileId, e.ExcelIndex });
            entity.Property(e => e.Labels).HasConversion(
                v => string.Join(";", v),
                v => v.Split(';', StringSplitOptions.RemoveEmptyEntries)
            );
            entity.Property(e => e.ControlType).HasMaxLength(20).HasDefaultValue("text");
            
            entity.HasOne(e => e.FormProfile)
                  .WithMany(f => f.Fields)
                  .HasForeignKey(e => e.FormProfileId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}