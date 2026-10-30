using System.Net;
using System.Text;
using System.Text.Json;
using RightRightRight;
using RightRightRight.Distribution;

void Check(bool value, string reason) { if (!value) throw new Exception(reason); }
void Reject(Action action) { try { action(); } catch (Exception ex) when(ex is ArgumentException or InvalidDataException or FormatException) { return; } throw new Exception("Expected rejection."); }
async Task RejectAsync(Func<Task> action, string expected) {
    try { await action(); } catch (Exception ex) { Check(ex.Message.Contains(expected) && !ex.Message.Contains("PRIVATE_TEST_CREDENTIAL"), ex.Message); return; }
    throw new Exception("Expected failure: " + expected);
}
var config = new RelayConfig { ProjectId = "11111111-1111-4111-8111-111111111111" };
config.Validate();
Reject(() => new RelayConfig().Validate());
Reject(() => new RelayConfig { ProjectId = Guid.Empty.ToString() }.Validate());
Reject(() => new RelayConfig { ProjectId = config.ProjectId, EnvironmentName = "production\r\nHeader: bad" }.Validate());
foreach (string bad in new[] { "", "123", "ABC DEF", "ABC/DE", "ABCDEFGHIJKLM", "ABC💥DE" }) Reject(() => RelayClient.NormalizeCode(bad));
Check(RelayClient.NormalizeCode(" bcdf67 ") == "BCDF67", "Code normalization");
foreach (string bad in new[] { "http://example.com/", "https://127.0.0.1/", "http://localhost/", "http://127.0.0.1/path", "http://x@127.0.0.1/" })
    Reject(() => new RelayClient(config, fixture: new Uri(bad)));

string Bytes(int count) => Convert.ToBase64String(Enumerable.Range(0, count).Select(i => (byte)i).ToArray());
object Allocation(bool secure = true, bool hostData = true, int keySize = 64) => new {
    data = new { allocation = new {
        allocationId = "22222222-2222-4222-8222-222222222222", allocationIdBytes = Bytes(16), key = Bytes(keySize),
        connectionData = Bytes(255), hostConnectionData = hostData ? Bytes(255) : "", region = "test-region",
        serverEndpoints = new[] { new { connectionType = secure ? "dtls" : "udp", host = "127.0.0.1", port = 7777, secure } }
    } }
};
using (var doc = JsonDocument.Parse(JsonSerializer.Serialize(Allocation(false)))) {
    Reject(() => RelayClient.ParseAllocation(doc.RootElement, false));
    Check(!RelayClient.ParseAllocation(doc.RootElement, false, true).Secure, "Loopback fixture");
}
using (var doc = JsonDocument.Parse(JsonSerializer.Serialize(Allocation(keySize: 65)))) Reject(() => RelayClient.ParseAllocation(doc.RootElement, false));
using (var doc = JsonDocument.Parse(JsonSerializer.Serialize(Allocation(hostData: false)))) Reject(() => RelayClient.ParseAllocation(doc.RootElement, true));
// Shorter documented API blobs must be accepted, not mistaken for bad allocations.
using (var doc = JsonDocument.Parse(JsonSerializer.Serialize(Allocation(keySize: 32)))) Check(RelayClient.ParseAllocation(doc.RootElement, false).Key.Length == 32, "Key bound");

var calls = new List<string>();
var handler = new Handler(async (request, token) => {
    calls.Add(request.RequestUri!.AbsolutePath);
    Check(request.Headers.GetValues("ProjectId").Single() == config.ProjectId, "Project header");
    Check(request.Headers.GetValues("UnityEnvironment").Single() == "production", "Environment header");
    using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
    string path = request.RequestUri.AbsolutePath;
    if (path.EndsWith("/anonymous")) {
        Check(request.Headers.Authorization == null, "Anonymous request must not reuse a bearer");
        return Handler.Json(new { idToken = "PRIVATE_TEST_CREDENTIAL", sessionToken = "SESSION_TEST", expiresIn = 3600 });
    }
    Check(request.Headers.Authorization?.ToString() == "Bearer PRIVATE_TEST_CREDENTIAL", "Player authorization");
    if (path.EndsWith("/allocate")) {
        Check(body.RootElement.GetProperty("maxConnections").GetInt32() == 3, "Exactly three guests");
        return Handler.Json(Allocation());
    }
    if (path.EndsWith("/joincode")) {
        Check(body.RootElement.GetProperty("allocationId").GetString() == "22222222-2222-4222-8222-222222222222", "Allocation ownership");
        return Handler.Json(new { data = new { joinCode = "BCDF67" } });
    }
    Check(body.RootElement.GetProperty("joinCode").GetString() == "BCDF67", "Join request code");
    return Handler.Json(Allocation());
});
using (var client = new RelayClient(config, handler)) {
    var allocation = await client.AllocateAsync(default);
    Check(allocation.Secure && allocation.IdBytes.Length == 16 && allocation.ConnectionData.Length == 255, "Transport credentials");
    Check(await client.CodeAsync(allocation.Id, default) == "BCDF67", "Host code");
    await client.JoinAsync(" bcdf67 ", default);
}
Check(calls.SequenceEqual(new[] { "/v1/authentication/anonymous", "/v1/allocate", "/v1/joincode", "/v1/join" }), "Sign-in reused across rooms");
foreach (var (status, expected) in new[] { (404, "Room not found"), (400, "Check the code"), (401, "expired"), (403, "Authentication and Relay"), (429, "Wait a minute"), (503, "HTTP 503") }) {
    using var client = new RelayClient(config, new Handler((request, _) => Task.FromResult(request.RequestUri!.AbsolutePath.EndsWith("/anonymous")
        ? Handler.Json(new { idToken = "PRIVATE_TEST_CREDENTIAL", sessionToken = "S", expiresIn = 3600 })
        : new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent("PRIVATE_TEST_CREDENTIAL") })));
    await RejectAsync(() => client.JoinAsync("BCDF67", default), expected);
}
using (var source = new CancellationTokenSource()) {
    using var client = new RelayClient(config, new Handler(async (_, token) => { await Task.Delay(10000, token); return Handler.Json(new { }); }));
    source.CancelAfter(30);
    try { await client.AllocateAsync(source.Token); throw new Exception("Cancellation ignored"); } catch(OperationCanceledException) { }
}
using (var client = new RelayClient(config, new Handler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new string('X', 65537)) }))))
    await RejectAsync(() => client.AllocateAsync(default), "oversized");
// Headers can arrive while the body stalls forever. The per-request deadline
// must cancel the body read even without a caller cancellation token.
using (var client = new RelayClient(config, new Handler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StreamContent(new PendingBody()) })))) {
    var watch = System.Diagnostics.Stopwatch.StartNew();
    try { await client.AllocateAsync(default); throw new Exception("Body deadline ignored"); }
    catch (OperationCanceledException) { Check(watch.Elapsed.TotalSeconds < 22, "Body deadline exceeded"); }
}
Console.WriteLine("PASS: Relay request flow, project/environment headers, anonymous auth reuse, three-guest allocation, secure endpoint, bounded credentials, code validation, HTTP errors without secret disclosure, cancellation, response limit.");

sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken);
    internal static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };
}

sealed class PendingBody : Stream
{
    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default) { await Task.Delay(Timeout.Infinite, token); return 0; }
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override void Flush() => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
