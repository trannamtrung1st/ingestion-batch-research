using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CsvHelper;
using CsvHelper.Configuration;
using DeviceId;
using IBR.Shared.Extensions;
using IBR.Shared.Models;
using JsonPath;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Formatter;

namespace IBR.MqttListener;

public class Worker : BackgroundService
{
    private static readonly JsonSerializerOptions _defaultJsonOptions = new(defaults: JsonSerializerDefaults.Web);
    private static readonly JsonNodeJPath _jPathValueSystem = new();
    private readonly ILogger<Worker> _logger;
    private readonly IConfiguration _configuration;
    private readonly ConcurrentBag<IManagedMqttClient> _mqttClients;
    private CancellationToken _stoppingToken;

    public Worker(ILogger<Worker> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
        _mqttClients = new ConcurrentBag<IManagedMqttClient>();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _stoppingToken = stoppingToken;

        InitializeMqttClient(0);

        while (!stoppingToken.IsCancellationRequested)
            await Task.Delay(1000, stoppingToken);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        var topic = _configuration["MqttClientOptions:Topic"];

        foreach (var client in _mqttClients)
        {
            if (client.IsConnected)
                await client.UnsubscribeAsync(topic);
        }

        foreach (var client in _mqttClients)
        {
            await client.InternalClient.DisconnectAsync(new MqttClientDisconnectOptions
            {
                SessionExpiryInterval = 1,
                Reason = MqttClientDisconnectOptionsReason.NormalDisconnection
            }, cancellationToken);
            await client.StopAsync();
        }

        await base.StopAsync(cancellationToken);
    }

    private async Task RestartMqttClients()
    {
        foreach (var client in _mqttClients)
            await client.StartAsync(client.Options);
    }

    private async Task StopMqttClients()
    {
        foreach (var client in _mqttClients)
            await client.StopAsync();
    }

    private async void InitializeMqttClient(int threadIdx)
    {
        var factory = new MqttFactory();
        var mqttClient = factory.CreateManagedMqttClient();
        var mqttClientConfiguration = _configuration.GetSection("MqttClientOptions");
        var optionsBuilder = new MqttClientOptionsBuilder()
            .WithTcpServer(options => mqttClientConfiguration.GetSection("Tcp").Bind(options))
            .WithKeepAlivePeriod(value: mqttClientConfiguration.GetValue<TimeSpan>("KeepAlivePeriod"))
            .WithCleanSession(value: mqttClientConfiguration.GetValue<bool>("CleanSession"))
            .WithSessionExpiryInterval(mqttClientConfiguration.GetValue<uint>("SessionExpiryInterval"))
            .WithProtocolVersion(MqttProtocolVersion.V500);
        string deviceId = new DeviceIdBuilder()
            .AddMachineName()
            .AddOsVersion()
            .ToString();

        var clientId = mqttClientConfiguration["ClientId"] != null
            ? $"{mqttClientConfiguration["ClientId"]}_{threadIdx}"
            : $"mqtt-listener_{deviceId}_{threadIdx}";
        optionsBuilder = optionsBuilder.WithClientId(clientId);

        var options = optionsBuilder.Build();
        var managedOptions = new ManagedMqttClientOptionsBuilder()
            .WithAutoReconnectDelay(TimeSpan.FromSeconds(_configuration.GetValue<int>("MqttClientOptions:ReconnectDelaySecs")))
            .WithClientOptions(options)
            .Build();
        _mqttClients.Add(mqttClient);

        mqttClient.ConnectedAsync += (e) => OnConnected(e, mqttClient);
        mqttClient.DisconnectedAsync += (e) =>
        {
            _logger.LogError(exception: e.Exception, message: e.Reason.ToString());
            return Task.CompletedTask;
        };
        mqttClient.ApplicationMessageReceivedAsync += OnMessageReceived;
        await mqttClient.StartAsync(managedOptions);
    }

    private async Task OnConnected(MqttClientConnectedEventArgs e, IManagedMqttClient mqttClient)
    {
        if (e.ConnectResult.ResultCode != MqttClientConnectResultCode.Success)
            throw new Exception($"Cannot connect, result code: {e.ConnectResult.ResultCode}");

        var topic = _configuration["MqttClientOptions:Topic"];
        var qos = _configuration.GetValue<MQTTnet.Protocol.MqttQualityOfServiceLevel>("MqttClientOptions:QoS");
        await mqttClient.SubscribeAsync(topic: topic, qualityOfServiceLevel: qos);
    }

    private async Task OnMessageReceived(MqttApplicationMessageReceivedEventArgs e)
    {
        try
        {
            e.AutoAcknowledge = false;
            var payload = e.ApplicationMessage.PayloadSegment.Array!;
            var payloadStr = Encoding.UTF8.GetString(payload);
            var payloadType = e.ApplicationMessage.UserProperties?.Find(p => p.Name == "payload_type");
            var config = e.ApplicationMessage.UserProperties?.Find(p => p.Name == "config");

            switch (payloadType?.Value)
            {
                case "single":
                default:
                    {
                        HandleSingle(payload);
                        break;
                    }
                case "csv":
                    {
                        await HandleCsv(payload);
                        break;
                    }
                case "payload_with_json_path":
                    {
                        HandlePayloadWithJsonPath(payload, config?.Value);
                        break;
                    }
                case "payload_with_template":
                    {
                        await HandlePayloadWithTemplate(payload, template: config?.Value);
                        break;
                    }
            }

            await e.AcknowledgeAsync(cancellationToken: _stoppingToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, ex.Message);
            await e.AcknowledgeAsync(cancellationToken: _stoppingToken);
        }
    }

    private static void HandleSingle(byte[] _)
    {
        Console.WriteLine($"Single handled at {DateTime.UtcNow}");
    }

    private static void HandlePayloadWithJsonPath(byte[] payload, string? configStr)
    {
        if (configStr is null) return;
        var templateConfig = JsonSerializer.Deserialize<DeviceTemplateConfig>(configStr, options: _defaultJsonOptions)
            ?? throw new ArgumentException(message: null, nameof(configStr));
        var jsonStr = Encoding.UTF8.GetString(payload);
        var rootNode = JsonNode.Parse(payload);
        var jPathContext = _jPathValueSystem.CreateContext();

        var metrics = templateConfig.DeviceMetrics;
        var deviceIdMetric = metrics.First(m => m.Type == "device_id");
        var timestampMetric = metrics.First(m => m.Type == "timestamp");
        var qualityMetric = metrics.FirstOrDefault(m => m.Type == "quality");
        var otherMetrics = metrics.Where(m => m.Type == "metric").ToArray();
        var deviceId = jPathContext
            .SelectNodes(obj: rootNode, expr: deviceIdMetric.Path, resultor: (value, _) => (value as JsonValue)?.GetValue<string>())
            .FirstOrDefault() ?? string.Empty;

        void GetSeries(DeviceMetricSettings? metric, string[]? flattenMetricKeys, string? flattenValuesPath)
        {
            var timestamps = jPathContext
                .SelectNodes(obj: rootNode, expr: timestampMetric.Path!.Replace("{metric_base}", metric?.BasePath),
                    resultor: (rawValue, _) =>
                    {
                        var value = (rawValue as JsonValue)?.GetUnderlyingValue();
                        if (value is string valueStr)
                        {
                            if (DateTime.TryParse(valueStr, out DateTime timestamp))
                                return timestamp;
                            if (long.TryParse(valueStr, out long lValue1))
                                return DateTimeOffset.FromUnixTimeMilliseconds(lValue1).UtcDateTime;
                        }

                        if (value is double iValue)
                            return DateTimeOffset.FromUnixTimeMilliseconds((long)iValue).UtcDateTime;

                        throw new FormatException();
                    })
                .ToArray();

            var values = jPathContext
                .SelectNodes(obj: rootNode, expr: metric?.Path.Replace("{metric_base}", metric?.BasePath) ?? flattenValuesPath,
                    resultor: (value, _) => (value as JsonValue)?.GetUnderlyingValue())
                .ToArray();

            int[]? qualities = null;
            if (qualityMetric?.Path is not null)
            {
                qualities = jPathContext
                    .SelectNodes(obj: rootNode, expr: qualityMetric.Path.Replace("{metric_base}", metric?.BasePath),
                        resultor: (value, _) => (value as JsonValue)?.GetValue<int>() ?? 0)
                    .ToArray();
            }

            if (values.Length <= 200)
            {
                for (int i = 0; i < values.Length; i++)
                {
                    var ts = timestamps[i];
                    var value = values[i];
                    var quality = qualities != null ? qualities[i] : default(int?);
                    var metricKey = metric?.Key ?? flattenMetricKeys![i];
                    var series = new TimeSeries(
                        deviceId, metricKey: metricKey ?? throw new Exception("Empty metric key"),
                        ts, value, quality);
                    Console.WriteLine(series);
                }
            }
            else
            {
                Console.WriteLine($"Parsed count: {values.Length}");
            }
        }

        var valuePaths = otherMetrics.Select(m => m.Path).Distinct().ToArray();
        if (valuePaths.Length == 1 && !valuePaths[0].Contains("{metric_base}"))
        {
            var flattenMetricKeys = jPathContext
                .SelectNodes(obj: rootNode, expr: templateConfig.MetricKeysPath,
                    resultor: (value, _) => (value as string) ?? (value as JsonValue)?.GetValue<string>() ?? string.Empty)
                .ToArray();

            GetSeries(metric: null, flattenMetricKeys, valuePaths[0]);
        }
        else
        {
            foreach (var metric in otherMetrics)
                GetSeries(metric, flattenMetricKeys: null, flattenValuesPath: null);
        }
    }

    private static async Task HandlePayloadWithTemplate(byte[] payload, string? template)
    {
        if (template is null) return;
        using var memStream = new MemoryStream(payload);
        using var streamReader = new StreamReader(memStream);
        using var csvReader = new CsvReader(reader: streamReader, culture: CultureInfo.InvariantCulture);
        while (await csvReader.ReadAsync())
        {
            var recordJson = template;
            for (var i = 0; i < csvReader.ColumnCount; i++)
            {
                var field = csvReader.GetField(i);
                var placeholderIdx = recordJson.IndexOf("%%");
                if (placeholderIdx == -1) break;
                recordJson = string.Concat(
                    recordJson.AsSpan(0, placeholderIdx),
                    field, recordJson.AsSpan(placeholderIdx + 2));
            }

            var record = JsonSerializer.Deserialize<DeviceSeriesPayload>(recordJson, _defaultJsonOptions);
            if (record is not null)
            {
                foreach (var item in record.Data)
                {
                    var series = new TimeSeries(
                        deviceId: record.DeviceId,
                        metricKey: item.Key,
                        timeStamp: DateTimeOffset.FromUnixTimeMilliseconds(record.Timestamp).UtcDateTime,
                        value: item.Value,
                        quality: record.Quality);
                    Console.WriteLine(series);
                }
            }
        }
    }

    private static async Task HandleCsv(byte[] payload)
    {
        using var memStream = new MemoryStream(payload);
        using var streamReader = new StreamReader(memStream);
        using var csvReader = new CsvReader(reader: streamReader, configuration: new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            NewLine = Environment.NewLine
        });

        while (await csvReader.ReadAsync())
        {
            for (int i = 0; i < csvReader.ColumnCount; i++)
                Console.Write(csvReader[i] + "\t");
            Console.WriteLine();
        }
    }

    public override void Dispose()
    {
        base.Dispose();
        GC.SuppressFinalize(this);
        foreach (var client in _mqttClients)
            client.Dispose();
        _mqttClients.Clear();
    }
}

public class JsonNodeJPath : IJsonPathValueSystem
{
    private static JsonNode GetJsonNode(object value)
    {
        if (value is not JsonNode jNode)
            throw new InvalidOperationException();
        return jNode;
    }

    private static JsonObject? GetJsonObject(object value)
    {
        var jNode = GetJsonNode(value);
        return jNode as JsonObject;
    }

    private static JsonArray? GetJsonArray(object value)
    {
        var jNode = GetJsonNode(value);
        return jNode as JsonArray;
    }

    public IEnumerable<string> GetMembers(object value)
    {
        JsonObject? jObj = GetJsonObject(value);

        IEnumerable<string>? members = jObj?.ToDictionary().Keys;

        return members ?? [];
    }

    public object? GetMemberValue(object value, string member)
    {
        var jNode = GetJsonNode(value);

        if (jNode is JsonObject jObj)
            return jObj?.TryGetPropertyValue(member, out var jsonNode) == true ? jsonNode : default;

        if (jNode is JsonArray jArr)
            return int.TryParse(member, out var idx) ? jArr[idx] : default;

        return default;
    }

    public bool HasMember(object value, string member)
    {
        var jNode = GetJsonNode(value);

        if (jNode is JsonObject jObj)
            return jObj?.TryGetPropertyValue(member, out _) == true;

        if (jNode is JsonArray jArr)
            return int.TryParse(member, out var idx) && idx < jArr.Count;

        return false;
    }

    public bool IsArray(object value)
    {
        return value is JsonArray;
    }

    public bool IsObject(object value)
    {
        return value is JsonObject;
    }

    public bool IsPrimitive(object value)
    {
        return value is JsonValue;
    }

    public int GetCount(object value)
    {
        JsonArray? jArr = GetJsonArray(value);

        return jArr?.Count ?? 0;
    }

    public JsonPathContext CreateContext() => new()
    {
        ValueSystem = this
    };

}