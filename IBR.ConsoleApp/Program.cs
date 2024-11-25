
using System.Text.Json;

var jsonOpts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
const int BatchSize = 10;
const int Base1 = 50;
const int Base2 = 70;

var payload = GenerateGenericMetric();
var json = JsonSerializer.SerializeToUtf8Bytes(payload, options: jsonOpts);
File.WriteAllBytes("payload.json", json);

object GenerateRowBased1()
{
    var dbl1 = new List<object>();
    var dbl2 = new List<object>();

    for (var i = 0; i < BatchSize; i++)
    {
        var quality = GenerateQuality();
        dbl1.Add(new object[] { GenerateTimestamp(i), GenerateValue(Base1), quality });
        dbl2.Add(new object[] { GenerateTimestamp(i), GenerateValue(Base2), quality });
    }

    var payload = new
    {
        deviceId = "dev01",
        data = new
        {
            xVelocity = dbl1,
            zVelocity = dbl2,
        }
    };

    return payload;
}

object GenerateColumnar1()
{
    var ts1 = new List<object>();
    var ts2 = new List<object>();
    var v1 = new List<object>();
    var v2 = new List<object>();
    var q1 = new List<object>();
    var q2 = new List<object>();

    for (var i = 0; i < BatchSize; i++)
    {
        var quality = GenerateQuality();
        ts1.Add(GenerateTimestamp(i));
        ts2.Add(GenerateTimestamp(i));
        v1.Add(GenerateValue(Base1));
        v2.Add(GenerateValue(Base2));
        q1.Add(quality);
        q2.Add(quality);
    }

    var payload = new
    {
        deviceId = "dev01",
        data = new
        {
            xVelocity = new[] { ts1, v1, q1 },
            zVelocity = new[] { ts2, v2, q2 },
        }
    };

    return payload;
}

object GenerateGenericMetric()
{
    var records = new List<object>();

    object GenerateRecord(string metricKey, int i, int baseValue, int quality) => new
    {
        key = metricKey,
        ts = GenerateTimestamp(i),
        v = GenerateValue(baseValue),
        q = quality
    };

    for (var i = 0; i < BatchSize; i++)
    {
        var quality = GenerateQuality();
        records.Add(GenerateRecord("XVelocity", i, Base1, quality));
        records.Add(GenerateRecord("ZVelocity", i, Base2, quality));
    }

    var payload = new
    {
        deviceId = "dev01",
        data = records
    };

    return payload;
}

long GenerateTimestamp(int plusSec)
{
    return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + plusSec * 1000;
}

double GenerateValue(int baseValue) => baseValue + Random.Shared.NextDouble();

int GenerateQuality() => Random.Shared.NextDouble() > 0.5 ? 192 : 0;