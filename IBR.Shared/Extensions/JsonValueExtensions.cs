using System.Text.Json;
using System.Text.Json.Nodes;

namespace IBR.Shared.Extensions;

public static class JsonValueExtensions
{
    public static object? GetUnderlyingValue(this JsonValue? value)
    {
        if (value == null) return null;
        var element = value.GetValue<JsonElement>();

        return element.ValueKind switch
        {
            JsonValueKind.False or JsonValueKind.True => element.GetBoolean(),
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.GetDouble(),
            _ => element,
        };
    }
}

