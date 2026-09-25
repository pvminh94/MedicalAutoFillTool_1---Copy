using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace MedicalAutoFillWeb.Data;

/// <summary>
/// Nâng cấp schema cho CSDL SQLite ĐÃ TỒN TẠI.
///
/// Vì sao cần: bản cũ gọi `db.Database.EnsureCreated()` mỗi lần khởi động.
/// EnsureCreated chỉ tạo DB khi CHƯA có; nó KHÔNG BAO GIỜ thêm cột mới.
/// Nên sau khi thêm các cột HeaderNames/Selector/Required/Transform, mọi máy
/// đã chạy bản cũ sẽ gặp lỗi "no such column: f.HeaderNames" và app chết ngay
/// khi mở trang chủ. Bộ nâng cấp này tự ALTER TABLE các cột còn thiếu,
/// giữ nguyên dữ liệu cấu hình của người dùng (không phải seed lại từ đầu).
/// </summary>
public static class SchemaUpgrader
{
    public static void Upgrade(AppDbContext db, ILogger? logger = null)
    {
        var conn = db.Database.GetDbConnection();
        bool wasOpen = conn.State == System.Data.ConnectionState.Open;
        if (!wasOpen) conn.Open();

        try
        {
            // FieldMappings
            var fm = GetColumns(conn, "FieldMappings");
            if (fm.Count > 0)
            {
                AddColumn(conn, fm, "FieldMappings", "HeaderNames", "TEXT", logger);
                AddColumn(conn, fm, "FieldMappings", "Selector", "TEXT", logger);
                AddColumn(conn, fm, "FieldMappings", "ControlType", "TEXT", logger);
                AddColumn(conn, fm, "FieldMappings", "Transform", "TEXT", logger);
                AddColumn(conn, fm, "FieldMappings", "Required", "INTEGER NOT NULL DEFAULT 0", logger);
            }

            // FormProfiles
            var fp = GetColumns(conn, "FormProfiles");
            if (fp.Count > 0)
            {
                AddColumn(conn, fp, "FormProfiles", "UrlRegex", "TEXT", logger);
                AddColumn(conn, fp, "FormProfiles", "NoQuestionLabels", "TEXT", logger);
                AddColumn(conn, fp, "FormProfiles", "Description", "TEXT", logger);
            }
        }
        finally
        {
            if (!wasOpen) conn.Close();
        }
    }

    /// <summary>Đọc danh sách cột hiện có của một bảng (rỗng nếu bảng chưa tồn tại).</summary>
    private static HashSet<string> GetColumns(DbConnection conn, string table)
    {
        var cols = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"PRAGMA table_info(\"{table}\")";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                // PRAGMA table_info: cid | name | type | notnull | dflt_value | pk
                var name = reader.IsDBNull(1) ? null : reader.GetString(1);
                if (!string.IsNullOrEmpty(name)) cols.Add(name!);
            }
        }
        catch
        {
            // Bảng chưa tồn tại (DB mới) -> EnsureCreated/seed sẽ lo.
        }
        return cols;
    }

    private static void AddColumn(DbConnection conn, HashSet<string> existing,
                                  string table, string column, string type, ILogger? logger)
    {
        if (existing.Contains(column)) return;
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {type}";
            cmd.ExecuteNonQuery();
            existing.Add(column);
            logger?.LogInformation("Đã thêm cột {Table}.{Column} vào CSDL hiện có", table, column);
        }
        catch (Exception ex)
        {
            // "duplicate column name" xảy ra nếu 2 tiến trình cùng nâng cấp -> bỏ qua.
            logger?.LogWarning("Không thêm được cột {Table}.{Column}: {Message}", table, column, ex.Message);
        }
    }
}
