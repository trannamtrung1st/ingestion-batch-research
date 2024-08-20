using System.Text.Json.Serialization;
using MQTTnet.Protocol;

namespace IBR.Shared.Models;

public class MqttPublishPayload
{
    [JsonPropertyName("payload_encoding")]
    public required string PayloadEncoding { get; set; }
    public required string Topic { get; set; }
    public MqttQualityOfServiceLevel Qos { get; set; }
    public required string Payload { get; set; }
    public MqttRequestProperties? Properties { get; set; }
}
