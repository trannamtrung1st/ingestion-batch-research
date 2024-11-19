
using System.Text.Json;

var jsonOpts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var dbl1 = new List<object>();
var dbl2 = new List<object>();

for (var i = 0; i < 100; i++)
{
    dbl1.Add(new object[] { GenerateTimestamp(i), GenerateValue(10), GenerateQuality() });
    dbl2.Add(new object[] { GenerateTimestamp(i), GenerateValue(20), GenerateQuality() });
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

var json = JsonSerializer.SerializeToUtf8Bytes(payload, options: jsonOpts);
File.WriteAllBytes("payload.json", json);

long GenerateTimestamp(int plusSec)
{
    return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + plusSec * 1000;
}

double GenerateValue(int baseValue) => baseValue + Random.Shared.NextDouble();

int GenerateQuality() => Random.Shared.NextDouble() > 0.5 ? 192 : 0;