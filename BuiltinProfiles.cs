namespace MedicalAutoFillTool;

/// <summary>Seed các form mẫu ban đầu (vẫn có thể chỉnh sửa trong giao diện Cài đặt).</summary>
internal static class BuiltinProfiles
{
    /// <summary>Phiếu Cận Lâm Sàng (giữ nguyên mapping hiện có).</summary>
    public static FormProfile CanLamSang()
    {
        var p = new FormProfile
        {
            Name = "Phiếu Cận Lâm Sàng (KSKDK)",
            UrlContains = "KSKDK_Phieu_CanLamSang"
        };

        (int, string[])[] cols =
        {
            (0, new[]{ "makcb" }),
            (1, new[]{ "hoten" }),
            (2, new[]{ "ngaysinh" }),
            (3, new[]{ "phai" }),
            (4, new[]{ "Số lượng HC (M/µL)", "Số lượng HC (T/L)" }),
            (5, new[]{ "Huyết sắc tố (g/dL)", "Huyết sắc tố (g/L)" }),
            (6, new[]{ "Hematocrit (g/dL)", "Hematocrit (L/L)" }),
            (7, new[]{ "MCV (fL)" }),
            (8, new[]{ "MCH (pg)" }),
            (9, new[]{ "MCHC (g/dL)", "MCHC (g/L)" }),
            (10, new[]{ "RDW (%)" }),
            (11, new[]{ "Số lượng bạch cầu (K/µL)", "Số lượng bạch cầu (G/L)" }),
            (12, new[]{ "Số lượng bạch cầu trung tính (K/µL)", "Số lượng bạch cầu trung tính (G/L)" }),
            (13, new[]{ "Số lượng bạch cầu lympho (K/µL)", "Số lượng bạch cầu lympho (G/L)" }),
            (14, new[]{ "Số lượng bạch cầu đơn nhân (K/µL)", "Số lượng bạch cầu đơn nhân (G/L)" }),
            (15, new[]{ "Số lượng bạch cầu ái toan (K/µL)", "Số lượng bạch cầu ái toan (G/L)" }),
            (16, new[]{ "Số lượng bạch cầu ái kiềm (K/µL)", "Số lượng bạch cầu ái kiềm (G/L)" }),
            (17, new[]{ "Số lượng tiểu cầu (K/µL)", "Số lượng tiểu cầu (G/L)" }),
            (18, new[]{ "Đường máu bất kỳ (mmol/L)" }),
            (19, new[]{ "Đường máu lúc đói (mmol/L)" }),
            (20, new[]{ "Urê (mmol/L)" }),
            (21, new[]{ "Creatinin (umol/L)", "Creatinin (µmol/L)" }),
            (22, new[]{ "ASAT(GOT)", "ASAT(GOT) (U/L)" }),
            (23, new[]{ "ALAT (GPT)", "ALAT (GPT) (U/L)" }),
            (24, new[]{ "Tỉ trọng" }),
            (25, new[]{ "pH" }),
            (26, new[]{ "Bạch cầu (Leu/uL)" }),
            (27, new[]{ "Hồng cầu (Ery/uL)" }),
            (28, new[]{ "Protein (mg/dL)", "Protein (g/L)" }),
            (29, new[]{ "Glucose (mg/dL)", "Glucose (mmol/L)" }),
            (30, new[]{ "Thể cetonic (mg/dL)", "Thể cetonic (mmol/L)" }),
            (31, new[]{ "Bilirubin (mg/dL)", "Bilirubin (µmol/L)" }),
            (32, new[]{ "Urobilinogen (mg/dL)", "Urobilinogen (µmol/L)" })
        };

        foreach (var (i, labels) in cols)
            p.Fields.Add(new FieldMapping { ExcelIndex = i, Labels = labels });

        return p;
    }

    /// <summary>Profile mẫu để người dùng tự điều chỉnh theo giao diện thực tế của form mới.</summary>
    public static FormProfile HoSoChung()
    {
        var p = new FormProfile
        {
            Name = "Hồ sơ sức khỏe (mẫu - chỉnh trong Cài đặt)",
            UrlContains = "YOUR_FORM_PART_URL"
        };
        string[] known = { "hoten", "ngaysinh", "phai", "sdt", "dia chi", "cccd" };
        for (int i = 0; i < known.Length; i++)
            p.Fields.Add(new FieldMapping { ExcelIndex = i, Labels = new[] { known[i] } });
        return p;
    }
}