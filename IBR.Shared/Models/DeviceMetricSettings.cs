namespace IBR.Shared.Models;

public class DeviceMetricSettings
{
    public required string Key { get; set; }
    public required string Name { get; set; }
    public required string Type { get; set; }
    public required string DataType { get; set; }
    public required string Path { get; set; }
    public string? BasePath { get; set; }
}