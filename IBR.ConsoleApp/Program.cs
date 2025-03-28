
using System.Text.Json;

var jsonOpts = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    WriteIndented = true
};
const int BatchSize = 3;
const int Base1 = 50;
const int Base2 = 70;
const int Base3 = 100;

var payload = GenerateRowBased1();
var json = JsonSerializer.SerializeToUtf8Bytes(payload, options: jsonOpts);
File.WriteAllBytes("payload.json", json);

object GenerateRowBased1()
{
    var temp = new List<object>();
    var hum = new List<object>();
    var light = new List<object>();

    for (var i = 0; i < BatchSize; i++)
    {
        var quality = GenerateQuality();
        temp.Add(new object[] { GenerateTimestamp(i), GenerateValue(Base1), quality });
        hum.Add(new object[] { GenerateTimestamp(i), GenerateValue(Base2), quality });
        light.Add(new object[] { GenerateTimestamp(i), GenerateValue(Base3), quality });
    }

    var payload = new
    {
        deviceId = "batch-device-1",
        data = new
        {
            temp,
            hum,
            light,
        }
    };

    return payload;
}

object GenerateColumnar1()
{
    var tsTemp = new List<double>();
    var tsHum = new List<double>();
    var tsLight = new List<double>();
    var vTemp = new List<double>();
    var vHum = new List<double>();
    var vLight = new List<double>();
    var qTemp = new List<int>();
    var qHum = new List<int>();
    var qLight = new List<int>();

    for (var i = 0; i < BatchSize; i++)
    {
        var quality = GenerateQuality();
        tsTemp.Add(GenerateTimestamp(i));
        tsHum.Add(GenerateTimestamp(i));
        tsLight.Add(GenerateTimestamp(i));
        vTemp.Add(GenerateValue(Base1));
        vHum.Add(GenerateValue(Base2));
        vLight.Add(GenerateValue(Base3));
        qTemp.Add(quality);
        qHum.Add(quality);
        qLight.Add(quality);
    }

    var payload = new
    {
        deviceId = "batch-device-1",
        data = new
        {
            temp = new object[] { tsTemp, vTemp, qTemp },
            hum = new object[] { tsHum, vHum, qHum },
            light = new object[] { tsLight, vLight, qLight },
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
        records.Add(GenerateRecord("temp", i, Base1, quality));
        records.Add(GenerateRecord("hum", i, Base2, quality));
        records.Add(GenerateRecord("light", i, Base3, quality));
    }

    var payload = new
    {
        deviceId = "batch-device-1",
        data = records
    };

    return payload;
}

long GenerateTimestamp(int minusMin)
{
    var ts = DateTimeOffset.UtcNow.AddMinutes(-minusMin);
    ts.AddSeconds(-ts.Second);
    return ts.ToUnixTimeMilliseconds();
}

double GenerateValue(int baseValue) => baseValue + Random.Shared.NextDouble() * 5;

int GenerateQuality() => Random.Shared.NextDouble() > 0.5 ? 192 : 0;