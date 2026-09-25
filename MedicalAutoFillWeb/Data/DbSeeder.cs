using MedicalAutoFillWeb.Models;

namespace MedicalAutoFillWeb.Data;

public static class DbSeeder
{
    public static void Seed(AppDbContext db)
    {
        if (db.FormProfiles.Any()) return; // Đã có dữ liệu thì không seed lại

        db.FormProfiles.Add(new()
        {
            Name = "Phiếu Cận Lâm Sàng (KSKDK)",
            UrlContains = "KSKDK_Phieu_CanLamSang",
            Fields = new()
            {
                NewField(0, "makcb"),
                NewField(1, "hoten"),
                NewField(2, "ngaysinh"),
                NewField(3, "phai"),
                NewField(4, "Số lượng HC (M/µL)", "Số lượng HC (T/L)"),
                NewField(5, "Huyết sắc tố (g/dL)", "Huyết sắc tố (g/L)"),
                NewField(6, "Hematocrit (g/dL)", "Hematocrit (L/L)"),
                NewField(7, "MCV (fL)"),
                NewField(8, "MCH (pg)"),
                NewField(9, "MCHC (g/dL)", "MCHC (g/L)"),
                NewField(10, "RDW (%)"),
                NewField(11, "Số lượng bạch cầu (K/µL)", "Số lượng bạch cầu (G/L)"),
                NewField(12, "Số lượng bạch cầu trung tính (K/µL)", "Số lượng bạch cầu trung tính (G/L)"),
                NewField(13, "Số lượng bạch cầu lympho (K/µL)", "Số lượng bạch cầu lympho (G/L)"),
                NewField(14, "Số lượng bạch cầu đơn nhân (K/µL)", "Số lượng bạch cầu đơn nhân (G/L)"),
                NewField(15, "Số lượng bạch cầu ái toan (K/µL)", "Số lượng bạch cầu ái toan (G/L)"),
                NewField(16, "Số lượng bạch cầu ái kiềm (K/µL)", "Số lượng bạch cầu ái kiềm (G/L)"),
                NewField(17, "Số lượng tiểu cầu (K/µL)", "Số lượng tiểu cầu (G/L)"),
                NewField(18, "Đường máu bất kỳ (mmol/L)"),
                NewField(19, "Đường máu lúc đói (mmol/L)"),
                NewField(20, "Urê (mmol/L)"),
                NewField(21, "Creatinin (umol/L)", "Creatinin (µmol/L)"),
                NewField(22, "ASAT(GOT)", "ASAT(GOT) (U/L)"),
                NewField(23, "ALAT (GPT)", "ALAT (GPT) (U/L)"),
                NewField(24, "Tỉ trọng"),
                NewField(25, "pH"),
                NewField(26, "Bạch cầu (Leu/uL)"),
                NewField(27, "Hồng cầu (Ery/uL)"),
                NewField(28, "Protein (mg/dL)", "Protein (g/L)"),
                NewField(29, "Glucose (mg/dL)", "Glucose (mmol/L)"),
                NewField(30, "Thể cetonic (mg/dL)", "Thể cetonic (mmol/L)"),
                NewField(31, "Bilirubin (mg/dL)", "Bilirubin (µmol/L)"),
                NewField(32, "Urobilinogen (mg/dL)", "Urobilinogen (µmol/L)")
            }
        });
        
        db.SaveChanges();
    }
    
    private static FieldMapping NewField(int idx, params string[] labels)
    {
        return new() { ExcelIndex = idx, Labels = labels };
    }
}