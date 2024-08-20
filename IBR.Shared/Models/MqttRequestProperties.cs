using System.Text.Json.Serialization;

namespace IBR.Shared.Models;

public class MqttRequestProperties
{
    [JsonPropertyName("user_properties")]
    public IReadOnlyDictionary<string, string>? UserProperties { get; set; }
}