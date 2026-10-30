using System.Collections;
using System.Net.Http;
using System.Text.Json;
using MelonLoader;
using MelonLoader.Utils;
using RightRightRight.Distribution;
using UnityEngine;
using Unity.Networking.Transport.Relay;

namespace RightRightRight;

internal static class RelaySession
{
    private static RelayClient? client;
    private static CancellationTokenSource? cancellation;
    private static string entryCode = "", setupNote = "Online rooms aren't enabled in this build.";
    internal static bool Busy { get; private set; }
    internal static bool Active { get; private set; }
    internal static string RoomCode { get; private set; } = "";
    internal static bool Available => client != null;
    internal static bool Fixture => RaceNetwork.Args.Contains("--rrr-relay-verify") && RaceNetwork.Arg("--rrr-relay-fixture=").Length > 0;

    internal static void Initialize()
    {
        if (!DirectSession.Enabled) return;
        string path = Path.Combine(Directory.GetParent(MelonEnvironment.UserDataDirectory)!.FullName, RelayConfig.FileName);
        if (!File.Exists(path)) return;
        try {
            var settings = RelayConfig.Read(path);
            Uri? fixture = Fixture ? new Uri(RaceNetwork.Arg("--rrr-relay-fixture=")) : null;
            client = new RelayClient(settings, fixture: fixture);
            Mod.Log.Msg("RELAY_SETTINGS_READY environment=" + settings.EnvironmentName + (fixture != null ? " loopback fixture" : ""));
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or JsonException or ArgumentException) {
            setupNote = "Online settings are invalid. Download a configured build.";
            Mod.Log.Warning("RELAY_SETTINGS_INVALID " + ex.GetType().Name);
        }
    }

    internal static void Cancel()
    {
        cancellation?.Cancel(); cancellation = null;
        Busy = false; Active = false; RoomCode = "";
    }

    internal static void Connect(bool host)
    {
        if (client == null || Busy || DirectSession.Busy) return;
        string code;
        try { code = host ? "" : RelayClient.NormalizeCode(entryCode); }
        catch (ArgumentException ex) { DirectSession.Note = ex.Message; return; }
        DirectSession.Disconnect("");
        var source = new CancellationTokenSource(); cancellation = source; Busy = true;
        DirectSession.Note = host ? "Creating your room..." : "Joining room...";
        MelonCoroutines.Start(Run(host, code, source));
    }

    // Catch coroutine failures without calling Unity from HTTP continuations.
    private static IEnumerator Run(bool host, string code, CancellationTokenSource source)
    {
        var core = ConnectCore(host, code, source.Token);
        try {
            while (!source.IsCancellationRequested) {
                bool next;
                try { next = core.MoveNext(); }
                catch (Exception ex) {
                    string message = ex switch {
                        OperationCanceledException => "Connection timed out. Check your internet and try again.",
                        HttpRequestException => "Couldn't reach Unity Relay. Check your internet and try again.",
                        InvalidOperationException or ArgumentException => ex.Message,
                        _ => "Could not open the online room. Try again or download the latest build."
                    };
                    Mod.Log.Warning("RELAY_CONNECT_FAILED " + ex.GetType().Name);
                    DirectSession.Disconnect(message); yield break;
                }
                if (!next) yield break;
                yield return core.Current;
            }
        }
        finally {
            (core as IDisposable)?.Dispose();
            if (cancellation == source) { Busy = false; cancellation = null; }
            source.Dispose();
        }
    }

    private static IEnumerator ConnectCore(bool host, string code, CancellationToken token)
    {
        var prepare = DirectSession.Prepare();
        while (prepare.MoveNext()) { token.ThrowIfCancellationRequested(); yield return prepare.Current; }
        var request = host ? client!.AllocateAsync(token) : client!.JoinAsync(code, token);
        while (!request.IsCompleted) yield return null;
        token.ThrowIfCancellationRequested();
        var allocation = request.GetAwaiter().GetResult();
        Active = true;
        // Bind immediately: unbound allocations expire within seconds. Generate
        // the host's code after StartHost so slow HTTP cannot expire its binding.
        if (!DirectSession.StartRelayNative(host, allocation)) throw new InvalidOperationException("Couldn't start the online connection. Try again.");
        float bindDeadline = Time.realtimeSinceStartup + 20;
        while (DirectSession.RelayStatus() != RelayConnectionStatus.Established && Time.realtimeSinceStartup < bindDeadline) {
            token.ThrowIfCancellationRequested();
            if (!RaceNetwork.Manager.IsListening || DirectSession.RelayStatus() == RelayConnectionStatus.AllocationInvalid)
                throw new InvalidOperationException("The online room couldn't connect to Relay. Try creating a new room.");
            yield return null;
        }
        if (DirectSession.RelayStatus() != RelayConnectionStatus.Established)
            throw new InvalidOperationException("Relay connection timed out. Check your internet and try again.");
        if (host) {
            var codeRequest = client!.CodeAsync(allocation.Id, token);
            while (!codeRequest.IsCompleted) yield return null;
            token.ThrowIfCancellationRequested();
            RoomCode = codeRequest.GetAwaiter().GetResult();
            DirectSession.Note = "Room open. Share the code with three friends.";
            Mod.Log.Msg("RELAY_ROOM_READY");
            if (RaceNetwork.Args.Contains("--rrr-relay-verify")) {
                string output = RaceNetwork.Arg("--rrr-relay-code-file=");
                if (output.Length > 0) File.WriteAllText(output, RoomCode);
            }
        }
        else { RoomCode = code; DirectSession.Note = "Connecting to your host..."; }
        float deadline = Time.realtimeSinceStartup + 25;
        while (!RaceNetwork.Manager.IsConnectedClient && Time.realtimeSinceStartup < deadline) { token.ThrowIfCancellationRequested(); yield return null; }
        if (!RaceNetwork.Manager.IsConnectedClient) throw new InvalidOperationException("The room didn't connect. It may be full, closed, or unreachable. Ask the host for a new code.");
        Mod.Log.Msg("RELAY_CONNECTED host=" + host + " secure=" + allocation.Secure);
    }

    internal static void AutoConnect()
    {
        entryCode = RaceNetwork.Arg("--rrr-room="); Connect(RaceNetwork.Args.Contains("--rrr-direct-host"));
    }

    internal static void Gui(float left, float top, bool disconnected)
    {
        GUI.Label(new Rect(left+20,top+35,660,30), "Host a room, share its code, and race with your friends.");
        GUI.enabled = Available && disconnected && !Busy && !DirectSession.Busy;
        if (GUI.Button(new Rect(left+20,top+75,180,36), "HOST GAME")) Connect(true);
        entryCode = GUI.TextField(new Rect(left+225,top+79,180,30), entryCode, 12);
        if (GUI.Button(new Rect(left+420,top+75,145,36), "JOIN CODE")) Connect(false);
        GUI.enabled = true;
        if (RoomCode.Length > 0) {
            GUI.Label(new Rect(left+20,top+125,405,32), "ROOM CODE: " + RoomCode);
            if (GUI.Button(new Rect(left+430,top+123,135,28), "COPY CODE")) GUIUtility.systemCopyBuffer = RoomCode;
        }
        else GUI.Label(new Rect(left+20,top+125,545,40), Available ? "No accounts or extra apps needed. Everyone opens the same game version." : setupNote);
    }
}
