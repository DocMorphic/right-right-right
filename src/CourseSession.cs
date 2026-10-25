using System.Security.Cryptography;
using System.Text;
using System.Runtime.InteropServices;
using Il2Cpp;
using Il2CppInterop.Runtime;
using Il2CppSteamworks.Data;
using MelonLoader;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace RightRightRight;

internal static class CourseSession
{
    internal const string Version = "0.2.0";
    internal static string ContentId = "";
    private static string lastAcknowledged = "";
    private static bool selecting;
    private static float nextPoll;
    internal static int CurrentSeed;
    internal static string Status = "";
    internal static string Fingerprint(string json)
    {
        using var document = System.Text.Json.JsonDocument.Parse(json);
        var canonical = System.Text.Json.JsonSerializer.Serialize(document.RootElement);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Version + "\n" + canonical)))[..16];
    }

    private static Lobby GetLobby(SteamLobby owner)
    {
        // IL2CPP boxes a populated Nullable<Lobby> as Lobby, although the generated
        // accessor wraps it as Nullable. Unbox the actual type, rather than reading
        // Nullable fields at offsets belonging to a different object layout.
        var optional = owner._lobby;
        var name = Marshal.PtrToStringAnsi(IL2CPP.il2cpp_class_get_name(IL2CPP.il2cpp_object_get_class(optional.Pointer)));
        if (name != "Lobby") throw new InvalidDataException("Unexpected Steam lobby object type: " + name);
        return Marshal.PtrToStructure<Lobby>(IL2CPP.il2cpp_object_unbox(optional.Pointer));
    }

    internal static void Update()
    {
        if (Time.realtimeSinceStartup < nextPoll) return;
        nextPoll = Time.realtimeSinceStartup + .2f;
        var lobby = SteamLobby.Instance;
        if (lobby == null || !lobby.InLobby) return;
        var data = GetLobby(lobby);
        string token = data.GetData("rrr_course");
        if (string.IsNullOrEmpty(token) || token == lastAcknowledged) return;
        var fields = token.Split('|');
        if (fields.Length != 3) return;
        data.SetMemberData("rrr_ack", fields[0] == ContentId ? token : "version-mismatch");
        if (fields[0] != ContentId) SetStatus("Different course packs. Both players must update Right Right Right.");
        lastAcknowledged = token;
    }

    internal static void Select(StageDefinition stage, Action<string> load)
    {
        if (selecting) return;
        if (NetSession.Instance != null && !NetSession.Instance.IsDriver) { SetStatus("The driver chooses the course."); return; }
        int seed = RandomNumberGenerator.GetInt32(1, int.MaxValue);
        string token = $"{ContentId}|{stage.Scene}|{seed}";
        var lobby = SteamLobby.Instance;
        if (lobby == null || !lobby.InLobby) { SetStatus("Steam lobby is not ready yet. Try again in a moment."); return; }
        Mod.Log.Msg($"COURSE_LOBBY id={GetLobby(lobby).Id.Value} owner={GetLobby(lobby).Owner.Id.Value} members={GetLobby(lobby).MemberCount} localOwner={lobby.IsLobbyOwner}");
        if (!GetLobby(lobby).SetData("rrr_course", token)) { SetStatus("Could not publish the course to Steam. Please retry."); return; }
        CurrentSeed = seed;
        selecting = true;
        SetStatus("Sharing randomized course with navigator...");
        MelonCoroutines.Start(WaitForCrew(stage, token, load));
    }

    private static System.Collections.IEnumerator WaitForCrew(StageDefinition stage, string token, Action<string> load)
    {
        float deadline = Time.realtimeSinceStartup + 15;
        while (Time.realtimeSinceStartup < deadline)
        {
            var lobby = SteamLobby.Instance;
            if (lobby == null || !lobby.InLobby) break;
            var data = GetLobby(lobby);
            bool ready = true, mismatch = false;
            for (int i = 0; i < data.MemberCount; i++)
            {
                var id = Il2CppSteamworks.SteamMatchmaking.Internal.GetLobbyMemberByIndex(data.Id, i);
                var member = new Il2CppSteamworks.Friend(id);
                var ack = data.GetMemberData(member, "rrr_ack");
                if (ack == "version-mismatch") mismatch = true;
                if (ack != token) ready = false;
            }
            if (mismatch) { SetStatus("Different course packs. Both players must update."); selecting = false; yield break; }
            if (ready)
            {
                selecting = false; Status = "";
                Mod.Log.Msg($"COURSE_SHARED {stage.Scene} seed={CurrentSeed} pack={ContentId}");
                load(stage.Scene); yield break;
            }
            yield return new WaitForSecondsRealtime(.1f);
        }
        selecting = false;
        SetStatus("Navigator did not confirm the course. Both players must launch the updated pack.");
    }

    internal static int ResolveSeed(StageDefinition stage)
    {
        var testSeed = Environment.GetCommandLineArgs().FirstOrDefault(a => a.StartsWith("--rrr-seed="));
        if (testSeed != null && int.TryParse(testSeed.Split('=')[1], out int explicitSeed)) return CurrentSeed = explicitSeed;
        var lobby = SteamLobby.Instance;
        if (lobby != null && lobby.InLobby)
        {
            var fields = GetLobby(lobby).GetData("rrr_course").Split('|');
            if (fields.Length == 3 && fields[0] == ContentId && fields[1] == stage.Scene && int.TryParse(fields[2], out int seed))
                return CurrentSeed = seed;
        }
        throw new InvalidDataException("No confirmed shared course seed. Return to the menu and let the driver select the stage.");
    }

    internal static void SetStatus(string text)
    {
        Status = text;
        Mod.Log.Msg(text);
        if (SceneManager.GetActiveScene().name != "Menu") return;
        foreach (var menu in UnityEngine.Object.FindObjectsOfType<MainMenu>(true))
            if (menu.noteLabel != null) menu.noteLabel.text = text;
    }
}
