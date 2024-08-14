using System.Text.Json;

namespace IBR.Shared.Helpers;

public static class ConsoleHelper
{
    public static T? GetEnv<T>(string varName)
    {
        var value = GetRawEnv(varName);
        return value != null ? JsonSerializer.Deserialize<T>(value) : default;
    }

    public static string? GetRawEnv(string varName) => Environment.GetEnvironmentVariable(varName);

    public static T? GetArgument<T>(string[] args, string argName)
    {
        var value = GetRawArgument(args, argName);
        if (value == null) return default;
        return JsonSerializer.Deserialize<T>(value);
    }

    public static string? GetRawArgument(string[] args, string argName)
    {
        var arg = args.FirstOrDefault(a => a.StartsWith($"-{argName}="));
        if (arg == null) return null;
        var value = arg[(arg.IndexOf('=') + 1)..];
        return value;
    }
}