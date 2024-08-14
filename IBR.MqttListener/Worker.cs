using System.Collections.Concurrent;
using System.Text;
using DeviceId;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Formatter;

namespace IBR.MqttListener;

public class Worker : BackgroundService
{
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
            var payload = e.ApplicationMessage.PayloadSegment.Array;
            var payloadStr = Encoding.UTF8.GetString(payload!);
            await e.AcknowledgeAsync(cancellationToken: _stoppingToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, ex.Message);
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