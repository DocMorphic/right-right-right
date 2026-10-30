using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using RightRightRight.Distribution;

namespace RightRightRight;

// Uses the documented Unity player APIs, not the original game's cloud project.
// All operations are managed HTTP; native Unity calls stay on the game thread.
internal sealed class RelayClient : IDisposable
{
    internal sealed record Allocation(string Id, string Host, ushort Port, byte[] IdBytes,
        byte[] Key, byte[] ConnectionData, byte[] HostConnectionData, bool Secure);
    private readonly RelayConfig config;
    private readonly HttpClient http;
    private readonly string authBase, relayBase;
    private string accessToken = "", sessionToken = "";
    private DateTimeOffset expires;

    internal RelayClient(RelayConfig settings, HttpMessageHandler? handler = null, Uri? fixture = null)
    {
        settings.Validate(); config = settings;
        // A fixture is developer-only and may never send credentials off localhost.
        if (fixture != null && (fixture.Scheme != "http" || fixture.Host != "127.0.0.1" ||
            fixture.AbsolutePath != "/" || fixture.UserInfo.Length != 0 || fixture.Query.Length != 0 || fixture.Fragment.Length != 0))
            throw new ArgumentException("Relay fixtures must use an IPv4 loopback HTTP origin.");
        http = handler == null ? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) : new HttpClient(handler);
        http.Timeout = TimeSpan.FromSeconds(15);
        authBase = fixture?.ToString().TrimEnd('/') ?? "https://player-auth.services.api.unity.com/v1";
        relayBase = fixture?.ToString().TrimEnd('/') ?? "https://relay-allocations.services.api.unity.com/v1";
    }

    internal static string NormalizeCode(string code)
    {
        code = (code ?? "").Trim().ToUpperInvariant();
        // Accept A-Z/0-9, including the older public documentation's sample codes.
        if (code.Length < 6 || code.Length > 12 || code.Any(c => !((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))))
            throw new ArgumentException("Enter the 6–12 character room code from your host.");
        return code;
    }

    internal async Task<Allocation> AllocateAsync(CancellationToken cancellation)
    {
        await Authenticate(cancellation).ConfigureAwait(false);
        var body = new Dictionary<string, object> { ["maxConnections"] = 3 };
        if (config.Region.Length > 0) body["region"] = config.Region;
        using var doc = await Post(relayBase + "/allocate", body, true, "create", cancellation).ConfigureAwait(false);
        return ParseAllocation(doc.RootElement, false, relayBase.StartsWith("http://127.0.0.1:"));
    }

    internal async Task<string> CodeAsync(string allocationId, CancellationToken cancellation)
    {
        await Authenticate(cancellation).ConfigureAwait(false);
        using var doc = await Post(relayBase + "/joincode", new { allocationId }, true, "code", cancellation).ConfigureAwait(false);
        return NormalizeCode(doc.RootElement.GetProperty("data").GetProperty("joinCode").GetString()!);
    }

    internal async Task<Allocation> JoinAsync(string code, CancellationToken cancellation)
    {
        code = NormalizeCode(code); // reject typos before creating a player
        await Authenticate(cancellation).ConfigureAwait(false);
        using var doc = await Post(relayBase + "/join", new { joinCode = code }, true, "join", cancellation).ConfigureAwait(false);
        return ParseAllocation(doc.RootElement, true, relayBase.StartsWith("http://127.0.0.1:"));
    }

    private async Task Authenticate(CancellationToken cancellation)
    {
        if (accessToken.Length > 0 && DateTimeOffset.UtcNow < expires) return;
        // Reuse the anonymous player during this process. No player credentials
        // are shipped in the ZIP, written into logs, or copied between machines.
        string endpoint = sessionToken.Length == 0 ? "/authentication/anonymous" : "/authentication/session-token";
        object body = sessionToken.Length == 0 ? new { } : new { sessionToken };
        using var doc = await Post(authBase + endpoint, body, false, "sign-in", cancellation).ConfigureAwait(false);
        var root = doc.RootElement;
        accessToken = root.GetProperty("idToken").GetString() ?? "";
        sessionToken = root.GetProperty("sessionToken").GetString() ?? "";
        if (accessToken.Length == 0 || sessionToken.Length == 0) throw new InvalidDataException("Unity sign-in returned incomplete credentials.");
        expires = DateTimeOffset.UtcNow.AddSeconds(Math.Max(0, root.GetProperty("expiresIn").GetDouble() - 60));
    }

    private async Task<JsonDocument> Post(string url, object body, bool authorized, string action, CancellationToken cancellation)
    {
        // HttpClient's timeout ends at the headers with ResponseHeadersRead.
        // Keep the deadline active through the bounded body read and JSON parse.
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(TimeSpan.FromSeconds(15));
        cancellation = deadline.Token;
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("ProjectId", config.ProjectId);
        request.Headers.Add("UnityEnvironment", config.EnvironmentName);
        if (authorized) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellation).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            // Do not echo service response bodies: they may contain identifiers or credentials.
            string message = response.StatusCode switch {
                HttpStatusCode.NotFound when action == "join" => "Room not found or expired. Ask the host for a new code.",
                HttpStatusCode.BadRequest when action == "join" => "Could not join that room. Check the code; the room may be full or closed.",
                HttpStatusCode.Unauthorized => "Unity sign-in expired or was rejected. Disconnect and try again.",
                HttpStatusCode.Forbidden => "Online rooms are unavailable for this game. Check Authentication and Relay in the game's Unity project.",
                HttpStatusCode.TooManyRequests => "Too many connection attempts. Wait a minute and try again.",
                _ => $"Unity Relay could not {action} (HTTP {(int)response.StatusCode}). Try again shortly."
            };
            if (response.StatusCode == HttpStatusCode.Unauthorized) { accessToken = ""; sessionToken = ""; }
            throw new InvalidOperationException(message);
        }
        // Bound service responses even if a fixture or upstream service misbehaves.
        using var stream = await response.Content.ReadAsStreamAsync(cancellation).ConfigureAwait(false);
        using var bytes = new MemoryStream(); var buffer = new byte[4096]; int count;
        while ((count = await stream.ReadAsync(buffer, cancellation).ConfigureAwait(false)) > 0) {
            if (bytes.Length + count > 65536) throw new InvalidDataException("Unity returned an oversized response.");
            bytes.Write(buffer, 0, count);
        }
        bytes.Position = 0;
        return await JsonDocument.ParseAsync(bytes, cancellationToken: cancellation).ConfigureAwait(false);
    }

    internal static Allocation ParseAllocation(JsonElement root, bool joining, bool fixture = false)
    {
        var data = root.GetProperty("data").GetProperty("allocation");
        var id = data.GetProperty("allocationId").GetString()!;
        if (!Guid.TryParse(id, out _)) throw new InvalidDataException("Unity returned an invalid allocation ID.");
        // Require DTLS; never silently downgrade an internet room to plain UDP.
        var endpoint = data.GetProperty("serverEndpoints").EnumerateArray().FirstOrDefault(e =>
            (e.GetProperty("connectionType").GetString() == "dtls" && e.GetProperty("secure").GetBoolean()) ||
            (fixture && e.GetProperty("connectionType").GetString() == "udp" && e.GetProperty("host").GetString() == "127.0.0.1"));
        if (endpoint.ValueKind == JsonValueKind.Undefined) throw new InvalidDataException("Unity did not provide a secure Relay endpoint.");
        string host = endpoint.GetProperty("host").GetString()!;
        if (string.IsNullOrWhiteSpace(host) || host.Length > 253) throw new InvalidDataException("Unity returned an invalid Relay host.");
        ushort port = endpoint.GetProperty("port").GetUInt16();
        if (port == 0) throw new InvalidDataException("Unity returned an invalid Relay port.");
        byte[] Bytes(string name, int length) {
            var value = Convert.FromBase64String(data.GetProperty(name).GetString()!);
            if (value.Length == 0 || value.Length > length || (name == "allocationIdBytes" && value.Length != 16))
                throw new InvalidDataException("Unity returned invalid " + name + ".");
            return value;
        }
        var connection = Bytes("connectionData", 255);
        return new Allocation(id, host, port, Bytes("allocationIdBytes", 16), Bytes("key", 64),
            connection, joining ? Bytes("hostConnectionData", 255) : connection, endpoint.GetProperty("secure").GetBoolean());
    }

    public void Dispose() { http.Dispose(); accessToken = ""; sessionToken = ""; }
}
