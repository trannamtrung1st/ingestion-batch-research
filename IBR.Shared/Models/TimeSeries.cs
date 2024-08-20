namespace IBR.Shared.Models;

public readonly struct TimeSeries
{
    public TimeSeries(string deviceId, string metricKey, DateTime timeStamp, object? value, int? quality) : this()
    {
        DeviceId = deviceId;
        MetricKey = metricKey;
        TimeStamp = timeStamp;
        Value = value;
        Quality = quality;
    }

    public readonly string DeviceId { get; }
    public readonly string MetricKey { get; }
    public readonly DateTime TimeStamp { get; }
    public readonly object? Value { get; }
    public readonly int? Quality { get; }

    public override string ToString() => $"{TimeStamp} | {DeviceId}.{MetricKey} = {Value} ({Quality})";
}