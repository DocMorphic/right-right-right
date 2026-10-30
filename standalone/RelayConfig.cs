using System.Text.Json;
using System.Text.RegularExpressions;

namespace RightRightRight.Distribution;

// Public identifiers only. Never put a service-account key or player token here.
public sealed class RelayConfig
{
    public const string FileName = "rrr-relay.json";
    public int Format { get; set; } = 1;
    public string ProjectId { get; set; } = "";
    public string EnvironmentName { get; set; } = "production";
    public string Region { get; set; } = "";

    public static RelayConfig Read(string path)
    {
        var result = JsonSerializer.Deserialize<RelayConfig>(File.ReadAllText(path))
            ?? throw new InvalidDataException("Relay settings are empty.");
        result.Validate();
        return result;
    }

    public void Validate()
    {
        if (Format != 1 || !Guid.TryParseExact(ProjectId, "D", out var id) || id == Guid.Empty)
            throw new InvalidDataException("Relay needs this game's Unity Project ID.");
        if (!Regex.IsMatch(EnvironmentName ?? "", "^[a-zA-Z0-9_-]{1,64}$") ||
            !Regex.IsMatch(Region ?? "", "^[a-zA-Z0-9-]{0,64}$"))
            throw new InvalidDataException("Invalid Unity environment name or Relay region.");
    }
}
