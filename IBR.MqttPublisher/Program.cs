using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
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
    Console.Write("Choose an option: ");
    if (!int.TryParse(Console.ReadLine(), out var opt) || opt < 1 || opt > 2)
    {
        Console.WriteLine("Wrong option!");
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
                    await PublishBatchUsingApi(batchSize);
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

async Task PublishBatchUsingApi(int batchSize)
{
    List<MqttPublishBatchPayload> batch = [];
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

IReadOnlyDictionary<string, object> BuildPayload(int i, int noOfMetrics = 10)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"device-{i}";
    dict["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    for (int m = 0; m < noOfMetrics; m++)
        dict[$"numeric_{i}_{m}"] = Random.Shared.NextDouble();
    return dict;
}

class MqttPublishBatchPayload
{
    [JsonPropertyName("payload_encoding")]
    public required string PayloadEncoding { get; set; }
    public required string Topic { get; set; }
    public MqttQualityOfServiceLevel Qos { get; set; }
    public required string Payload { get; set; }
}