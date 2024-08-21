namespace IBR.Shared.Models;

public class DeviceSeriesPayload
{
    public required string DeviceId { get; set; }
    public required long Timestamp { get; set; }
    public int? Quality { get; set; }
    public required IReadOnlyDictionary<string, object> Data { get; set; }
}