namespace MedicalAutoFillTool;

/// <summary>Seed các form mẫu ban đầu (vẫn chỉnh sửa được trong giao diện Cài đặt).</summary>
internal static class BuiltinProfiles
{
    /// <summary>
    /// Phiếu Cận Lâm Sàng (KSKDK).
    /// Mỗi trường nay khai thêm HeaderNames = tên cột trong file Excel, nhờ vậy khi
    /// dán khối dữ liệu CÓ dòng tiêu đề thì engine khớp theo TÊN CỘT chứ không theo
    /// vị trí — copy thiếu/thừa/đảo cột vẫn điền đúng (bản cũ điền sai toàn bộ).
    /// </summary>
    public static FormProfile CanLamSang()
    {
        var p = new FormProfile
        {
            Name = "Phiếu Cận Lâm Sàng (KSKDK)",
            UrlContains = "KSKDK_Phieu_CanLamSang"
        };

        // ---- Nhóm hành chính ----
        p.Fields.Add(F(0, "text", "Mã KCB", "Ma KCB", "makcb"));
        p.Fields.Add(F(1, "text", "Họ và tên", "Ho va ten", "hoten"));
        p.Fields.Add(F(2, "date", "Ngày sinh", "Ngay sinh", "ngaysinh"));
        p.Fields.Add(F(3, "auto", "Phái", "Giới tính", "phai", "gioitinh"));

        // ---- Công thức máu ----
        p.Fields.Add(F(4, "text", "Số lượng HC (M/µL)", "Số lượng HC (T/L)"));
        p.Fields.Add(F(5, "text", "Huyết sắc tố (g/dL)", "Huyết sắc tố (g/L)"));
        p.Fields.Add(F(6, "text", "Hematocrit (g/dL)", "Hematocrit (L/L)"));
        p.Fields.Add(F(7, "text", "MCV (fL)"));
        p.Fields.Add(F(8, "text", "MCH (pg)"));
        p.Fields.Add(F(9, "text", "MCHC (g/dL)", "MCHC (g/L)"));
        p.Fields.Add(F(10, "text", "RDW (%)"));
        p.Fields.Add(F(11, "text", "Số lượng bạch cầu (K/µL)", "Số lượng bạch cầu (G/L)"));
        p.Fields.Add(F(12, "text", "Số lượng bạch cầu trung tính (K/µL)", "Số lượng bạch cầu trung tính (G/L)"));
        p.Fields.Add(F(13, "text", "Số lượng bạch cầu lympho (K/µL)", "Số lượng bạch cầu lympho (G/L)"));
        p.Fields.Add(F(14, "text", "Số lượng bạch cầu đơn nhân (K/µL)", "Số lượng bạch cầu đơn nhân (G/L)"));
        p.Fields.Add(F(15, "text", "Số lượng bạch cầu ái toan (K/µL)", "Số lượng bạch cầu ái toan (G/L)"));
        p.Fields.Add(F(16, "text", "Số lượng bạch cầu ái kiềm (K/µL)", "Số lượng bạch cầu ái kiềm (G/L)"));
        p.Fields.Add(F(17, "text", "Số lượng tiểu cầu (K/µL)", "Số lượng tiểu cầu (G/L)"));

        // ---- Sinh hoá máu ----
        p.Fields.Add(F(18, "text", "Đường máu bất kỳ (mmol/L)"));
        p.Fields.Add(F(19, "text", "Đường máu lúc đói (mmol/L)"));
        p.Fields.Add(F(20, "text", "Urê (mmol/L)"));
        // Creatinin: "umol/L" và "µmol/L" là HAI cách gõ khác nhau của cùng một đơn vị
        // (u thường vs µ micro) — file Excel mỗi nơi gõ một kiểu nên phải khai cả hai.
        p.Fields.Add(F(21, "text", "Creatinin (umol/L)", "Creatinin (µmol/L)"));
        p.Fields.Add(F(22, "text", "ASAT(GOT)", "ASAT(GOT) (U/L)", "GOT (U/L)"));
        p.Fields.Add(F(23, "text", "ALAT (GPT)", "ALAT (GPT) (U/L)", "GPT (U/L)"));

        // ---- Nước tiểu ----
        p.Fields.Add(F(24, "text", "Tỉ trọng"));
        p.Fields.Add(F(25, "text", "pH"));
        p.Fields.Add(F(26, "text", "Bạch cầu (Leu/uL)"));
        p.Fields.Add(F(27, "text", "Hồng cầu (Ery/uL)"));
        p.Fields.Add(F(28, "text", "Protein (mg/dL)", "Protein (g/L)"));
        p.Fields.Add(F(29, "text", "Glucose (mg/dL)", "Glucose (mmol/L)"));
        p.Fields.Add(F(30, "text", "Thể cetonic (mg/dL)", "Thể cetonic (mmol/L)"));
        p.Fields.Add(F(31, "text", "Bilirubin (mg/dL)", "Bilirubin (µmol/L)"));
        p.Fields.Add(F(32, "text", "Urobilinogen (mg/dL)", "Urobilinogen (µmol/L)"));

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
        p.Fields.Add(F(0, "text", "Họ và tên", "Ho va ten", "hoten"));
        p.Fields.Add(F(1, "date", "Ngày sinh", "Ngay sinh", "ngaysinh"));
        p.Fields.Add(F(2, "auto", "Giới tính", "Phái", "gioitinh"));
        p.Fields.Add(F(3, "text", "Số điện thoại", "Dien thoai", "sdt"));
        p.Fields.Add(F(4, "text", "Địa chỉ", "Dia chi"));
        p.Fields.Add(F(5, "text", "CCCD", "Số căn cước", "cccd"));
        p.Fields.Add(F(6, "text", "Mã BHYT", "Số thẻ BHYT", "mabhyt"));
        return p;
    }

    /// <summary>
    /// Tạo 1 mapping. <paramref name="labels"/> vừa là nhãn trên web vừa là tên cột Excel
    /// (engine tự bỏ dấu, bỏ đơn vị trong ngoặc khi so khớp).
    /// </summary>
    private static FieldMapping F(int idx, string controlType, params string[] labels)
    {
        return new FieldMapping
        {
            ExcelIndex = idx,
            Labels = labels,
            HeaderNames = (string[])labels.Clone(),
            ControlType = controlType
        };
    }

    /// <summary>Tạo mapping có tên cột Excel KHÁC với nhãn trên web.</summary>
    internal static FieldMapping F(int idx, string controlType, string[] labels, string[] headerNames)
    {
        return new FieldMapping
        {
            ExcelIndex = idx,
            Labels = labels,
            HeaderNames = headerNames,
            ControlType = controlType
        };
    }
}
