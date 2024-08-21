namespace IBR.Shared.Models;

public class JsonPathPayloadInfo
{
    public required string DeviceId { get; set; }
    public required string MetricKey { get; set; }
    public required string Timestamp { get; set; }
    public required string Value { get; set; }
    public required string? Quality { get; set; }
}
