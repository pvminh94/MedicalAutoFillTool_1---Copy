using Microsoft.EntityFrameworkCore;
using MedicalAutoFillWeb.Models;

namespace MedicalAutoFillWeb.Data;

/// <summary>
/// Seed cấu hình mặc định: form Phiếu Xét Nghiệm KSKDK trên medinet.org.vn.
///
/// Khác bản cũ: mỗi trường có thêm HEADER NAMES (tên cột trong file Excel thật).
/// Nhờ vậy engine ghép cột THEO TIÊU ĐỀ, không phụ thuộc thứ tự cột — bản cũ
/// điền theo index cứng nên chỉ cần file Excel thêm/bớt một cột là sai toàn bộ.
/// </summary>
public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext db, ILogger? logger = null)
    {
        if (await db.FormProfiles.AnyAsync()) return;

        var fields = new List<FieldMapping>();
        int i = 0;

        // ---- Nhóm thông tin chung -------------------------------------------
        // (không có tên cột Excel: các ô này thường không nằm trong file XN)
        Add(fields, i++, "Mã CBC; Mã CB", null, "text");
        Add(fields, i++, "Họ và tên nhân viên y tế", null, "text");
        Add(fields, i++, "Mã KCB", null, "text");
        Add(fields, i++, "Họ và tên", "Họ và tên; Họ tên; Họ tên bệnh nhân", "text", required: true);
        Add(fields, i++, "Ngày sinh", "Ngày sinh; Năm sinh", "text");
        Add(fields, i++, "Giới tính", "Giới tính; Giới", "select");
        Add(fields, i++, "Số CCCND; Số hộ chiếu", "CCCD; CMND; Số CCCND; Số hộ chiếu", "text");

        // ---- Công thức máu ---------------------------------------------------
        Add(fields, i++, "Số lượng HC", "Số lượng HC; SLHC; Số lượng hồng cầu; RBC", "number", required: true);
        Add(fields, i++, "Huyết sắc tố", "Huyết sắc tố; HST; Hemoglobin; Hb", "number", required: true);
        Add(fields, i++, "Hematocrit", "Hematocrit; Hct", "number");
        Add(fields, i++, "Số lượng BC", "Số lượng BC; SLBC; Số lượng bạch cầu; WBC", "number", required: true);
        Add(fields, i++, "Công thức BC", "Công thức BC; CTBC; Công thức bạch cầu", "text");
        Add(fields, i++, "Số lượng TC", "Số lượng TC; SLTC; Tiểu cầu; Platelet; PLT", "number", required: true);

        // ---- Nhóm máu / Đông máu --------------------------------------------
        Add(fields, i++, "Nhóm máu ABO", "Nhóm máu; Nhóm máu ABO; ABO", "text");
        Add(fields, i++, "Nhóm máu Rh", "Nhóm máu Rh; Rh; Yếu tố Rh", "text");
        Add(fields, i++, "TQ; Tỷ lệ Prothrombin", "TQ; Tỷ lệ Prothrombin; Prothrombin; PT", "number");
        Add(fields, i++, "INR", "INR", "number");
        Add(fields, i++, "APTT; TCK", "APTT; TCK", "number");

        // ---- Sinh hoá máu ----------------------------------------------------
        Add(fields, i++, "Ure", "Ure; Urea", "number");
        Add(fields, i++, "Creatinin", "Creatinin; Creatinine", "number");
        Add(fields, i++, "Glucose", "Glucose; Đường huyết; Glucose máu", "number", required: true);
        Add(fields, i++, "HbA1c", "HbA1c", "number");
        Add(fields, i++, "Protein TP", "Protein TP; Protein toàn phần; Total Protein", "number");
        Add(fields, i++, "Albumin", "Albumin", "number");
        Add(fields, i++, "Bilirubin TP", "Bilirubin TP; Bilirubin toàn phần; Bilirubin total", "number");
        Add(fields, i++, "Bilirubin TT", "Bilirubin TT; Bilirubin trực tiếp; Bilirubin direct", "number");
        Add(fields, i++, "Bilirubin GT", "Bilirubin GT; Bilirubin gián tiếp", "number");
        Add(fields, i++, "AST; GOT", "AST; GOT; SGOT", "number");
        Add(fields, i++, "ALT; GPT", "ALT; GPT; SGPT", "number");
        Add(fields, i++, "GGT", "GGT", "number");
        Add(fields, i++, "ALP; Phosphatase kiềm", "ALP; Phosphatase kiềm", "number");
        Add(fields, i++, "LDH", "LDH", "number");
        Add(fields, i++, "Amylase", "Amylase", "number");
        Add(fields, i++, "CK; Creatine Kinase", "CK; Creatine Kinase", "number");
        Add(fields, i++, "Na+; Natri", "Na+; Natri; Na; Sodium", "number");
        Add(fields, i++, "K+; Kali", "K+; Kali; K; Potassium", "number");
        Add(fields, i++, "Cl-; Clo", "Cl-; Clo; Cl; Chloride", "number");
        Add(fields, i++, "Ca++; Canxi", "Ca++; Canxi; Ca; Calcium", "number");
        Add(fields, i++, "Mg++; Magie", "Mg++; Magie; Mg; Magnesium", "number");
        Add(fields, i++, "Fe; Sắt", "Fe; Sắt; Iron", "number");
        Add(fields, i++, "Acid Uric", "Acid Uric; Uric Acid; Uric", "number");
        Add(fields, i++, "Cholesterol TP", "Cholesterol TP; Cholesterol toàn phần; Cholesterol", "number");
        Add(fields, i++, "Triglycerid", "Triglycerid; Triglyceride", "number");
        Add(fields, i++, "HDL-C", "HDL-C; HDL; HDL Cholesterol", "number");
        Add(fields, i++, "LDL-C", "LDL-C; LDL; LDL Cholesterol", "number");
        Add(fields, i++, "CRP; CRP hs", "CRP; CRP hs; hs-CRP", "number");

        // ---- Nước tiểu -------------------------------------------------------
        Add(fields, i++, "pH; Tỷ trọng nước tiểu", "pH; Tỷ trọng; Tỷ trọng nước tiểu", "text");
        Add(fields, i++, "Protein niệu", "Protein niệu; Protein; Urine Protein", "text");
        Add(fields, i++, "Glucose niệu", "Glucose niệu; Đường niệu; Urine Glucose", "text");
        Add(fields, i++, "Hồng cầu niệu", "Hồng cầu niệu; RBC niệu; Urine RBC", "text");
        Add(fields, i++, "Bạch cầu niệu", "Bạch cầu niệu; WBC niệu; Urine WBC", "text");
        Add(fields, i++, "Trụ niệu", "Trụ niệu; Trụ; Urine Cast", "text");
        Add(fields, i++, "Tế bào biểu mô", "Tế bào biểu mô; Biểu mô", "text");
        Add(fields, i++, "Vi khuẩn niệu", "Vi khuẩn niệu; Vi khuẩn", "text");
        Add(fields, i++, "Cặn niệu", "Cặn niệu; Tinh thể", "text");
        Add(fields, i++, "Urobilinogen", "Urobilinogen", "text");
        Add(fields, i++, "Bilirubin niệu", "Bilirubin niệu; Urine Bilirubin", "text");
        Add(fields, i++, "Ketone niệu", "Ketone niệu; Ketone; Ceton", "text");
        Add(fields, i++, "Nitrite niệu", "Nitrite niệu; Nitrite", "text");
        Add(fields, i++, "Leukocyte esterase", "Leukocyte esterase", "text");

        // ---- Khác ------------------------------------------------------------
        Add(fields, i++, "Điện tim", "Điện tim; ECG; Điện tim đồ", "textarea");
        Add(fields, i++, "X-quang", "X-quang; XQ; X-Quang", "textarea");
        Add(fields, i++, "Siêu âm", "Siêu âm; SA", "textarea");
        Add(fields, i++, "HIV", "HIV; Anti-HIV", "select");
        Add(fields, i++, "HBsAg; Viêm gan B", "HBsAg; Viêm gan B; HBs", "select");
        Add(fields, i++, "HCV; Viêm gan C", "HCV; Viêm gan C; Anti-HCV", "select");
        Add(fields, i++, "Giang mai; VDRL; TPHA", "Giang mai; VDRL; TPHA; RPR", "select");
        Add(fields, i++, "Ma túy; Test ma túy", "Ma túy; Test ma túy; Morphin", "select");
        Add(fields, i++, "Ngày lấy mẫu", "Ngày lấy mẫu; Ngày XN; Ngày xét nghiệm", "text");
        Add(fields, i++, "Ngày trả kết quả", "Ngày trả kết quả; Ngày KQ", "text");
        Add(fields, i++, "Bệnh viện; Cơ sở xét nghiệm", "Bệnh viện; Cơ sở xét nghiệm; Nơi xét nghiệm", "text");
        Add(fields, i++, "Kết luận", "Kết luận", "textarea");
        Add(fields, i++, "Nhận xét", "Nhận xét; Ghi chú", "textarea");

        var form = new FormProfile
        {
            Name = "can_lam_sang_kskdk",
            DisplayName = "Phiếu Xét Nghiệm (Khám sức khỏe định kỳ)",
            Url = "https://quanlyskcd.medinet.org.vn/PhieuKhamSucKhoe/KSKDK_Phieu_CanLamSang/Index",
            // Chuỗi nhận diện trong URL — engine dùng cái này để tự chọn form,
            // không so URL tuyệt đối (URL medinet có thể đổi phiên bản/id).
            UrlRegex = "KSKDK_Phieu_CanLamSang",
            Description = "Form xét nghiệm Khám sức khỏe định kỳ trên medinet.org.vn",
            NoQuestionLabels = "Bệnh tiểu đường; Bệnh tăng huyết áp; Bệnh lý tim mạch; Bệnh thận; Bệnh gan; Bệnh phổi; Bệnh về máu; Tiền sử bệnh lý",
            Fields = fields
        };

        db.FormProfiles.Add(form);
        await db.SaveChangesAsync();
        logger?.LogInformation("Đã seed form mặc định '{Name}' với {Count} trường", form.DisplayName, fields.Count);
    }

    /// <summary>
    /// Thêm một trường. headerNames = các tên cột có thể gặp trong file Excel,
    /// viết cách nhau bằng ";". Nếu null, engine sẽ tự suy từ Labels
    /// (xem ConfigRepository/AutoFillScriptBuilder — hai bên cùng quy tắc).
    /// </summary>
    private static void Add(List<FieldMapping> list, int idx, string label,
                            string? headerNames, string controlType = "auto", bool required = false)
    {
        list.Add(new FieldMapping
        {
            ExcelIndex = idx,
            Labels = label,
            HeaderNames = headerNames,
            ControlType = controlType,
            Required = required
        });
    }
}
