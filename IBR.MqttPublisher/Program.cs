using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CsvHelper;
using CsvHelper.Configuration;
using IBR.Shared.Helpers;
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
    .WithTcpServer(tcpServer)
    .Build();
await mqttClient.ConnectAsync(options, cancellationToken);

while (!cancellationToken.IsCancellationRequested)
{
    Console.WriteLine("1. Publish single");
    Console.WriteLine("2. Publish batch using REST API");
    Console.WriteLine("3. Publish batch using plaintext csv");
    Console.WriteLine("4. Publish batch using row-based payload");
    Console.WriteLine("5. Publish batch using columnar payload");
    Console.Write("Choose an option: ");
    if (!int.TryParse(Console.ReadLine(), out var opt) || opt < 1 || opt > 5)
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
                    await PublishUsingSingleApi(0, payloadStr: JsonSerializer.Serialize(payload));
                    Console.WriteLine("Done!");
                    break;
                }
            case 5:
                {
                    Console.Write("Input batch size: ");
                    var batchSize = int.TryParse(Console.ReadLine(), out var bValue) ? bValue : 10;
                    var payload = BuildColumnarBatchPayload(0, batchSize);
                    await PublishUsingSingleApi(0, payloadStr: JsonSerializer.Serialize(payload));
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
            Qos = qos
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
        Qos = qos
    };

    var resp = await httpClient.PostAsJsonAsync("/api/v5/publish", payload);
    resp.EnsureSuccessStatusCode();
}

async Task PublishUsingSingleApi(int i, string payloadStr)
{
    MqttPublishPayload batch = new()
    {
        Payload = payloadStr,
        PayloadEncoding = "plain",
        Topic = string.Format(topicFormat, i, i),
        Qos = qos
    };

    var resp = await httpClient.PostAsJsonAsync("/api/v5/publish", batch);
    resp.EnsureSuccessStatusCode();
}

Dictionary<string, object> BuildRowBasedBatchPayload(int i, int batchSize, int noOfMetrics = 10)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"device-{i}";
    for (int m = 0; m < noOfMetrics; m++)
    {
        var arr = new object[batchSize];
        dict[$"numeric_{i}_{m}"] = arr;
        for (int r = 0; r < batchSize; r++)
            arr[r] = new object[] { DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Random.Shared.NextDouble(), 92 };
    }
    return dict;
}

Dictionary<string, object> BuildColumnarBatchPayload(int i, int batchSize, int noOfMetrics = 10)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"device-{i}";
    for (int m = 0; m < noOfMetrics; m++)
    {
        var ts = new long[batchSize];
        var value = new object[batchSize];
        var quality = new int[batchSize];
        dict[$"numeric_{i}_{m}"] = new object[] { ts, value, quality };

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
    for (int m = 0; m < noOfMetrics; m++)
        dict[$"numeric_{i}_{m}"] = Random.Shared.NextDouble();
    return dict;
}

class MqttPublishPayload
{
    [JsonPropertyName("payload_encoding")]
    public required string PayloadEncoding { get; set; }
    public required string Topic { get; set; }
    public MqttQualityOfServiceLevel Qos { get; set; }
    public required string Payload { get; set; }
}