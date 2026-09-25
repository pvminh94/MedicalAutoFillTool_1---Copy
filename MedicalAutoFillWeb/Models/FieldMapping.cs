using System.Text.Json.Serialization;

namespace MedicalAutoFillWeb.Models;

public class FieldMapping
{
    public int ExcelIndex { get; set; }
    public string[] Labels { get; set; } = Array.Empty<string>();
    public string ControlType { get; set; } = "text";
    
    public int? FormProfileId { get; set; }
    [JsonIgnore]
    public FormProfile? FormProfile { get; set; }
}