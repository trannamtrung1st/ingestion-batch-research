using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CsvHelper;
using CsvHelper.Configuration;
using IBR.Shared.Helpers;
using IBR.Shared.Models;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (s, e) =>
{
    Console.WriteLine("Canceling ...");
    cts.Cancel();
    e.Cancel = true;
};
var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes("publisher:abc@123"));
var cancellationToken = cts.Token;
var tcpServer = ConsoleHelper.GetRawEnv("MqttClientOptions__TcpServer") ?? "localhost";
var apiBase = ConsoleHelper.GetRawEnv("MqttClientOptions__ApiBase") ?? "http://localhost:18083";
var topicFormat = ConsoleHelper.GetRawEnv("MqttClientOptions__TopicFormat") ?? "projectId/{0}/devices/{1}/telemetry";
var qos = MqttQualityOfServiceLevel.AtLeastOnce;
var factory = new MqttFactory();
using var httpClient = new HttpClient()
{
    BaseAddress = new Uri(apiBase)
};
httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", basicAuth);
var mqttClient = factory.CreateMqttClient();
var options = new MqttClientOptionsBuilder()
    .WithProtocolVersion(MQTTnet.Formatter.MqttProtocolVersion.V500)
    .WithTcpServer(tcpServer)
    .Build();
await mqttClient.ConnectAsync(options, cancellationToken);

while (!cancellationToken.IsCancellationRequested)
{
    Console.WriteLine("1. Publish single");
    Console.WriteLine("2. Publish batch using REST API");
    Console.WriteLine("3. Publish batch using plaintext csv");
    Console.WriteLine("4. Publish batch using row-based payload (JSON path)");
    Console.WriteLine("5. Publish batch using columnar payload (JSON path)");
    Console.WriteLine("6. Publish batch using row-based payload (JSON schema)");
    Console.WriteLine("7. Publish batch using columnar payload (JSON schema)");
    Console.Write("Choose an option: ");
    if (!int.TryParse(Console.ReadLine(), out var opt) || opt < 1 || opt > 7)
    {
        Console.WriteLine("Invalid option!");
        continue;
    }
    else
    {
        switch (opt)
        {
            case 1:
                {
                    await PublishSingle();
                    Console.WriteLine("Done!");
                    break;
                }
            case 2:
                {
                    Console.Write("Input batch size: ");
                    var batchSize = int.TryParse(Console.ReadLine(), out var bValue) ? bValue : 10;
                    await PublishUsingBulkApi(batchSize);
                    Console.WriteLine("Done!");
                    break;
                }
            case 3:
                {
                    Console.Write("Input batch size: ");
                    var batchSize = int.TryParse(Console.ReadLine(), out var bValue) ? bValue : 10;
                    await PublishBatchUsingPlaintextCsv(batchSize);
                    Console.WriteLine("Done!");
                    break;
                }
            case 4:
                {
                    Console.Write("Input batch size: ");
                    var batchSize = int.TryParse(Console.ReadLine(), out var bValue) ? bValue : 10;
                    var payload = BuildRowBasedBatchPayload(0, batchSize);
                    var payloadInfo = BuildRowBasedJsonPath();
                    await PublishUsingSingleApi(0, payloadStr: JsonSerializer.Serialize(payload), payloadType: "payload_with_json_path", payloadInfo: payloadInfo);
                    Console.WriteLine("Done!");
                    break;
                }
            case 5:
                {
                    Console.Write("Input batch size: ");
                    var batchSize = int.TryParse(Console.ReadLine(), out var bValue) ? bValue : 10;
                    var payload = BuildColumnarBatchPayload(0, batchSize);
                    var payloadInfo = BuildColumnarJsonPath();
                    await PublishUsingSingleApi(0, payloadStr: JsonSerializer.Serialize(payload), payloadType: "payload_with_json_path", payloadInfo: payloadInfo);
                    Console.WriteLine("Done!");
                    break;
                }
            case 6:
                {
                    Console.Write("Input batch size: ");
                    var batchSize = int.TryParse(Console.ReadLine(), out var bValue) ? bValue : 10;
                    var payload = BuildRowBasedBatchPayload(0, batchSize);
                    var payloadInfo = BuildRowBasedJsonSchema();
                    await PublishUsingSingleApi(0, payloadStr: JsonSerializer.Serialize(payload), payloadType: "payload_with_schema", payloadInfo: payloadInfo);
                    Console.WriteLine("Done!");
                    break;
                }
            case 7:
                {
                    Console.Write("Input batch size: ");
                    var batchSize = int.TryParse(Console.ReadLine(), out var bValue) ? bValue : 10;
                    var payload = BuildColumnarBatchPayload(0, batchSize);
                    var payloadInfo = BuildColumnarJsonSchema();
                    await PublishUsingSingleApi(0, payloadStr: JsonSerializer.Serialize(payload), payloadType: "payload_with_schema", payloadInfo: payloadInfo);
                    Console.WriteLine("Done!");
                    break;
                }
        }
    }

    Console.ReadLine();
    Console.Clear();
}

async Task PublishSingle(int i = 0)
{
    var dict = BuildPayload(i);
    var messagePayload = JsonSerializer.SerializeToUtf8Bytes(dict);
    var message = new MqttApplicationMessageBuilder()
        .WithTopic(string.Format(topicFormat, i, i))
        .WithPayload(messagePayload)
        .WithQualityOfServiceLevel(qos)
        .WithUserProperty("payload_type", "single")
        .Build();
    await mqttClient.PublishAsync(message, cancellationToken);
}

async Task PublishUsingBulkApi(int batchSize)
{
    List<MqttPublishPayload> batch = [];
    for (var i = 0; i < batchSize; i++)
    {
        batch.Add(new()
        {
            Payload = JsonSerializer.Serialize(BuildPayload(i)),
            PayloadEncoding = "plain",
            Topic = string.Format(topicFormat, i, i),
            Qos = qos,
            Properties = new()
            {
                UserProperties = new Dictionary<string, string>()
                {
                    ["payload_type"] = "single"
                }
            }
        });
    }

    var resp = await httpClient.PostAsJsonAsync("/api/v5/publish/bulk", batch);
    resp.EnsureSuccessStatusCode();
}

async Task PublishBatchUsingPlaintextCsv(int batchSize)
{
    using var memStream = new MemoryStream();
    using var streamWriter = new StreamWriter(memStream);
    using var csvWriter = new CsvWriter(streamWriter, configuration: new CsvConfiguration(CultureInfo.InvariantCulture)
    {
        NewLine = Environment.NewLine
    });
    var dict = BuildPayload(0);
    csvWriter.WriteField(dict["deviceId"]);
    await csvWriter.NextRecordAsync();
    dict.Remove("deviceId");

    async Task WriteRecord<T>(IEnumerable<T> record)
    {
        foreach (var value in record)
            csvWriter.WriteField(value);
        await csvWriter.NextRecordAsync();
    }

    await WriteRecord(dict.Keys);

    for (var i = 0; i < batchSize; i++)
    {
        await WriteRecord(dict.Values);
        dict = BuildPayload(0);
        dict.Remove("deviceId");
    }

    await csvWriter.FlushAsync();
    memStream.Seek(0, SeekOrigin.Begin);
    var payload = new MqttPublishPayload()
    {
        Payload = Encoding.UTF8.GetString(memStream.ToArray()),
        PayloadEncoding = "plain",
        Topic = string.Format(topicFormat, 0, 0),
        Qos = qos,
        Properties = new MqttRequestProperties
        {
            UserProperties = new Dictionary<string, string>()
            {
                ["payload_type"] = "csv"
            }
        }
    };

    var resp = await httpClient.PostAsJsonAsync("/api/v5/publish", payload);
    resp.EnsureSuccessStatusCode();
}

async Task PublishUsingSingleApi(int i, string payloadStr, string payloadType, string payloadInfo)
{
    MqttPublishPayload batch = new()
    {
        Payload = payloadStr,
        PayloadEncoding = "plain",
        Topic = string.Format(topicFormat, i, i),
        Qos = qos,
        Properties = new MqttRequestProperties()
        {
            UserProperties = new Dictionary<string, string>()
            {
                ["payload_type"] = payloadType,
                ["payload_info"] = payloadInfo
            }
        }
    };

    var resp = await httpClient.PostAsJsonAsync("/api/v5/publish", batch);
    resp.EnsureSuccessStatusCode();
}

Dictionary<string, object> BuildRowBasedBatchPayload(int i, int batchSize, int noOfMetrics = 10)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"device-{i}";
    var data = new Dictionary<string, object>();
    dict["data"] = data;
    for (int m = 0; m < noOfMetrics; m++)
    {
        var arr = new object[batchSize];
        data[$"numeric_{i}_{m}"] = arr;
        for (int r = 0; r < batchSize; r++)
            arr[r] = new object[] { DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Random.Shared.NextDouble(), 92 };
    }
    return dict;
}

Dictionary<string, object> BuildColumnarBatchPayload(int i, int batchSize, int noOfMetrics = 10)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"device-{i}";
    var data = new Dictionary<string, object>();
    dict["data"] = data;
    for (int m = 0; m < noOfMetrics; m++)
    {
        var ts = new long[batchSize];
        var value = new object[batchSize];
        var quality = new int[batchSize];
        data[$"numeric_{i}_{m}"] = new object[] { ts, value, quality };

        for (int r = 0; r < batchSize; r++)
        {
            ts[r] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            value[r] = Random.Shared.NextDouble();
            quality[r] = 92;
        }
    }
    return dict;
}

Dictionary<string, object> BuildPayload(int i, int noOfMetrics = 10)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"device-{i}";
    dict["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    var data = new Dictionary<string, object>();
    for (int m = 0; m < noOfMetrics; m++)
        data[$"numeric_{i}_{m}"] = Random.Shared.NextDouble();
    dict["data"] = data;
    return dict;
}

string BuildRowBasedJsonPath()
{
    return JsonSerializer.Serialize(new JsonPathPayloadInfo
    {
        DeviceId = "$.deviceId",
        MetricKey = "$.data.*~",
        Timestamp = "$.data.{metric_key}.*[0]",
        Value = "$.data.{metric_key}.*[1]",
        Quality = "$.data.{metric_key}.*[2]",
    });
}

string BuildColumnarJsonPath()
{
    return JsonSerializer.Serialize(new JsonPathPayloadInfo
    {
        DeviceId = "$.deviceId",
        MetricKey = "$.data.*~",
        Timestamp = "$.data.{metric_key}[0][*]",
        Value = "$.data.{metric_key}[1][*]",
        Quality = "$.data.{metric_key}[2][*]",
    });
}

string BuildRowBasedJsonSchema()
{
    return string.Empty;
}

string BuildColumnarJsonSchema()
{
    return string.Empty;
}

class MqttPublishPayload
{
    [JsonPropertyName("payload_encoding")]
    public required string PayloadEncoding { get; set; }
    public required string Topic { get; set; }
    public MqttQualityOfServiceLevel Qos { get; set; }
    public required string Payload { get; set; }
    public MqttRequestProperties? Properties { get; set; }
}

class MqttRequestProperties
{
    [JsonPropertyName("user_properties")]
    public IReadOnlyDictionary<string, string>? UserProperties { get; set; }
}