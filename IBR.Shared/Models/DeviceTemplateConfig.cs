namespace IBR.Shared.Models;

public class DeviceTemplateConfig
{
    public required string MetricKeysPath { get; set; }
    public required DeviceMetricSettings[] DeviceMetrics { get; set; }
}
