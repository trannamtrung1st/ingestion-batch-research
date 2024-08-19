namespace IBR.Shared.Models;

public readonly struct TimeSeries
{
    public TimeSeries(DateTime timeStamp, object? value, int? quality) : this()
    {
        TimeStamp = timeStamp;
        Value = value;
        Quality = quality;
    }

    public readonly DateTime TimeStamp { get; }
    public readonly object? Value { get; }
    public readonly int? Quality { get; }

    public override string ToString() => $"Series: {TimeStamp} - {Value} - {Quality}";
}