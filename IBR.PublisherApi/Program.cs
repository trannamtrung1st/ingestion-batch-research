using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using IBR.Shared.Models;
using Microsoft.AspNetCore.Mvc;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;
const MqttQualityOfServiceLevel DefaultQos = MqttQualityOfServiceLevel.AtLeastOnce;

var builder = WebApplication.CreateBuilder(args);
var configuration = builder.Configuration;
var mqttClientOptions = configuration.GetSection("MqttClientOptions");

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer()
    .AddSwaggerGen()
    .AddCors(builder => builder.AddDefaultPolicy(opt => opt.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin()));

var apiBase = mqttClientOptions["ApiBase"] ?? "http://localhost:18083";
var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes("publisher:abc@123"));
using var mqttRestClient = new HttpClient();
mqttRestClient.BaseAddress = new Uri(apiBase);
mqttRestClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", basicAuth);

var tcpServer = mqttClientOptions["TcpServer"] ?? "localhost";
var topic = mqttClientOptions["Topic"] ?? "batch_ingestion";
var factory = new MqttFactory();
using var mqttClient = factory.CreateMqttClient();
var options = new MqttClientOptionsBuilder()
    .WithProtocolVersion(MQTTnet.Formatter.MqttProtocolVersion.V500)
    .WithTcpServer(tcpServer)
    .Build();
await mqttClient.ConnectAsync(options);
var defaultJsonOptions = new JsonSerializerOptions(defaults: JsonSerializerDefaults.Web);

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors();

app.MapPost("/api/publish-single", async () =>
{
    await PublishSingle();
    return Results.NoContent();
})
.WithName("Publish single");

app.MapPost("/api/publish-multiple", async ([FromQuery] int batchSize = 10) =>
{
    await PublishMutipleUsingBulkApi(batchSize);
    return Results.NoContent();
})
.WithName("Publish multiple");

app.MapPost("/api/publish-batch-csv", async (IFormFile file) =>
{
    var csv = await ReadAsStringAsync(file);
    await PublishBatchUsingPlaintextCsv(csv: csv);
    return Results.NoContent();
})
.WithName("Publish batch CSV")
.DisableAntiforgery();

app.MapPost("/api/publish-batch-with-json-path", async (
    [FromForm] IFormFile file,
    [FromForm] string payloadInfo) =>
{
    var payloadStr = await ReadAsStringAsync(file);
    await PublishBatchUsingSingleApi(payloadStr, payloadType: "payload_with_json_path", payloadInfo);
    return Results.NoContent();
})
.WithName("Publish batch with JSON path")
.DisableAntiforgery();

app.MapPost("/api/publish-batch-with-template", async (
    [FromForm] IFormFile file,
    [FromForm] string payloadInfo) =>
{
    var payloadStr = await ReadAsStringAsync(file);
    await PublishBatchUsingSingleApi(payloadStr, payloadType: "payload_with_template", payloadInfo);
    return Results.NoContent();
})
.WithName("Publish batch with template")
.DisableAntiforgery();

app.MapGet("/api/sample-payloads/single", ([FromQuery] int noOfMetrics = 3) =>
{
    return Results.Ok(BuildSinglePayload(noOfMetrics));
})
.WithName("Get sample payload: Single");

app.MapGet("/api/sample-payloads/batch-row-based", ([FromQuery] int batchSize = 10, [FromQuery] int noOfMetrics = 3) =>
{
    var payload = BuildRowBasedBatchPayload(batchSize, noOfMetrics);
    var json = JsonSerializer.SerializeToUtf8Bytes(payload, defaultJsonOptions);
    return Results.Bytes(json, contentType: "application/json", fileDownloadName: "batch-row-based.json");
})
.WithName("Get sample payload: Row-based");

app.MapGet("/api/sample-payloads/batch-columnar", ([FromQuery] int batchSize = 10, [FromQuery] int noOfMetrics = 3) =>
{
    var payload = BuildColumnarBatchPayload(batchSize, noOfMetrics);
    var json = JsonSerializer.SerializeToUtf8Bytes(payload, defaultJsonOptions);
    return Results.Bytes(json, contentType: "application/json", fileDownloadName: "batch-columnar.json");
})
.WithName("Get sample payload: Columnar");

app.MapGet("/api/sample-payloads/template", () =>
{
    var template = BuildSamplePayloadTemplate();
    return Results.Content(template, contentType: "text/plain");
})
.WithName("Get sample payload: Template");

app.Run();

// === Functions ===============

async Task PublishSingle(CancellationToken cancellationToken = default)
{
    var dict = BuildSinglePayload();
    var messagePayload = JsonSerializer.SerializeToUtf8Bytes(dict, options: defaultJsonOptions);
    var message = new MqttApplicationMessageBuilder()
        .WithTopic(topic)
        .WithPayload(messagePayload)
        .WithQualityOfServiceLevel(DefaultQos)
        .WithUserProperty("payload_type", "single")
        .Build();
    await mqttClient.PublishAsync(message, cancellationToken);
}

async Task PublishMutipleUsingBulkApi(int batchSize)
{
    List<MqttPublishPayload> batch = [];
    for (var i = 0; i < batchSize; i++)
    {
        batch.Add(new()
        {
            Payload = JsonSerializer.Serialize(BuildSinglePayload(i), options: defaultJsonOptions),
            PayloadEncoding = "plain",
            Topic = topic,
            Qos = DefaultQos,
            Properties = new()
            {
                UserProperties = new Dictionary<string, string>()
                {
                    ["payload_type"] = "single"
                }
            }
        });
    }

    var resp = await mqttRestClient.PostAsJsonAsync("/api/v5/publish/bulk", batch);
    resp.EnsureSuccessStatusCode();
}

async Task PublishBatchUsingPlaintextCsv(string csv)
{
    var payload = new MqttPublishPayload()
    {
        Payload = csv,
        PayloadEncoding = "plain",
        Topic = topic,
        Qos = DefaultQos,
        Properties = new MqttRequestProperties
        {
            UserProperties = new Dictionary<string, string>()
            {
                ["payload_type"] = "csv"
            }
        }
    };

    var resp = await mqttRestClient.PostAsJsonAsync("/api/v5/publish", payload);
    resp.EnsureSuccessStatusCode();
}

async Task PublishBatchUsingSingleApi(string payloadStr, string payloadType, string payloadInfo)
{
    MqttPublishPayload batch = new()
    {
        Payload = payloadStr,
        PayloadEncoding = "plain",
        Topic = topic,
        Qos = DefaultQos,
        Properties = new MqttRequestProperties()
        {
            UserProperties = new Dictionary<string, string>()
            {
                ["payload_type"] = payloadType,
                ["payload_info"] = payloadInfo
            }
        }
    };

    var resp = await mqttRestClient.PostAsJsonAsync("/api/v5/publish", batch);
    resp.EnsureSuccessStatusCode();
}

Dictionary<string, object> BuildRowBasedBatchPayload(int batchSize, int noOfMetrics = 3)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"dev-0";
    var data = new Dictionary<string, object>();
    dict["data"] = data;
    var baseUtc = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    for (int m = 0; m < noOfMetrics; m++)
    {
        var currentUtc = baseUtc;
        var arr = new object[batchSize];
        data[$"numeric_{m}"] = arr;
        for (int r = 0; r < batchSize; r++)
            arr[r] = new object[] { currentUtc += 5000, Random.Shared.NextDouble(), 92 };
    }
    return dict;
}

Dictionary<string, object> BuildColumnarBatchPayload(int batchSize, int noOfMetrics = 3)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"dev-0";
    var data = new Dictionary<string, object>();
    dict["data"] = data;
    var baseUtc = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    for (int m = 0; m < noOfMetrics; m++)
    {
        var currentUtc = baseUtc;
        var ts = new long[batchSize];
        var value = new object[batchSize];
        var quality = new int[batchSize];
        data[$"numeric_{m}"] = new object[] { ts, value, quality };

        for (int r = 0; r < batchSize; r++)
        {
            ts[r] = currentUtc += 5000;
            value[r] = Random.Shared.NextDouble();
            quality[r] = 92;
        }
    }
    return dict;
}

Dictionary<string, object> BuildSinglePayload(int noOfMetrics = 3)
{
    var dict = new Dictionary<string, object>();
    dict["deviceId"] = $"dev-0";
    dict["timestamp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    var data = new Dictionary<string, object>();
    for (int m = 0; m < noOfMetrics; m++)
        data[$"numeric_{m}"] = Random.Shared.NextDouble();
    dict["data"] = data;
    return dict;
}

async Task<string> ReadAsStringAsync(IFormFile file)
{
    using var csvStream = file.OpenReadStream();
    using var streamReader = new StreamReader(csvStream);
    return await streamReader.ReadToEndAsync();
}

string BuildSamplePayloadTemplate()
{
    var template = 
@"{
  ""deviceId"": ""%%"",
  ""timestamp"": %%,
  ""quality"": %%,
  ""data"": {
    ""temperature"": %%,
    ""humidity"": %%,
    ""running"": %%
  }
}";
    return template;
}