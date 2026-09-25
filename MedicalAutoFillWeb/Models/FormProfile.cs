using System.Text.Json.Serialization;

namespace MedicalAutoFillWeb.Models;

public class FormProfile
{
    public int Id { get; set; }
    public string Name { get; set; } = "Form mới";
    public string UrlContains { get; set; } = "";
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    public string OwnerId { get; set; } = string.Empty;
    
    public List<FieldMapping> Fields { get; set; } = new();
}