using System.Text.Json;

namespace RightRightRight.Distribution;

public sealed class DistributionConfig
{
    public const string FileName = "rrr-distribution.json";
    public const uint OriginalPlaytest = 5425110;
    public int Format { get; set; } = 1;
    public string State { get; set; } = "pending-steam";
    public uint? SteamAppId { get; set; }
    public string ContentVersion { get; set; } = "0.3.0-alpha.1";
    public bool Configured => State == "configured";

    public static DistributionConfig Read(string path)
    {
        var value = JsonSerializer.Deserialize<DistributionConfig>(File.ReadAllText(path))
            ?? throw new InvalidDataException("Distribution configuration is empty.");
        value.Validate();
        return value;
    }

    public void Validate()
    {
        if (Format != 1 || ContentVersion != "0.3.0-alpha.1")
            throw new InvalidDataException("Unsupported portable game configuration.");
        if (State == "pending-steam" && SteamAppId == null) return;
        if (State != "configured" || SteamAppId == null || SteamAppId == 0 ||
            SteamAppId == 480 || SteamAppId == OriginalPlaytest)
            throw new InvalidDataException("Supply Right Right Right's own Steam App ID. The original playtest and sample App IDs are not standalone identities.");
    }

    public uint RequireAppId()
    {
        Validate();
        if (!Configured)
            throw new InvalidOperationException("Steam setup is pending. A separate Steamworks App ID and player access are required before this portable build can use Steam invites.");
        return SteamAppId!.Value;
    }
}
