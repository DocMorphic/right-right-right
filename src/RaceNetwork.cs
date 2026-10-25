using System.Runtime.InteropServices;
using HarmonyLib;
using Il2Cpp;
using Il2CppInterop.Runtime;
using Il2CppNetcode.Transports.Facepunch;
using Il2CppSteamworks;
using Il2CppSteamworks.Data;
using MelonLoader;
using Unity.Collections;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace RightRightRight;

internal static class RaceNetwork
{
    internal const string Build = "0.3.0-alpha.1";
    internal const float Width=9.5f;
    internal static bool Enabled => !Args.Contains("--rrr-legacy-coop");
    internal static readonly string[] Args=Environment.GetCommandLineArgs();
    internal static bool Lan => Args.Any(a=>a.StartsWith("--rrr-lan="));
    internal static bool IsLanHost => Args.Contains("--rrr-lan=host");
    internal static bool Verify => Args.Contains("--rrr-race-verify");
    internal static NetworkManager Manager => NetworkManager.Singleton;
    internal static bool Host => Manager != null && Manager.IsServer;
    internal static int Count {
        get {
            if(Manager==null||!Manager.IsListening)return 0;
            if(Manager.IsServer)return Manager.ConnectionManager.ConnectedClientIds.Count;
            if(!Lan&&SteamLobby.Instance!=null&&SteamLobby.Instance.InLobby)return CourseSession.GetLobby(SteamLobby.Instance).MemberCount;
            return Seats.Length;
        }
    }
    internal static ulong[] Seats=Array.Empty<ulong>();
    internal static ulong[] ConnectedIds()
    {
        var list=Manager.ConnectionManager.ConnectedClientIds;var ids=new ulong[list.Count];
        for(int i=0;i<ids.Length;i++)ids[i]=list[i];Array.Sort(ids);return ids;
    }
    internal static int LocalSlot => Manager == null ? -1 : RaceProtocol.Slot(Seats, Manager.LocalClientId);
    internal static int LocalTeam => Math.Max(0, LocalSlot) / 2;
    internal static bool Navigator => LocalSlot >= 0 && LocalSlot%2==1;
    private static CustomMessagingManager? messaging;
    private static CustomMessagingManager.HandleNamedMessageDelegate? receiver;
    private static bool lanStarting;
    private static bool joining;
    private static float nextLobby;
    private static bool lobbyLayoutChecked;
    internal static string Arg(string prefix, string fallback="") => Args.FirstOrDefault(a=>a.StartsWith(prefix))?.Substring(prefix.Length) ?? fallback;

    internal static void Update()
    {
        if (!Enabled) return;
        var manager=Manager;
        if (manager != null && manager.IsListening && manager.CustomMessagingManager != null &&
            (messaging == null || messaging.Pointer != manager.CustomMessagingManager.Pointer))
        {
            messaging=manager.CustomMessagingManager;
            receiver=DelegateSupport.ConvertDelegate<CustomMessagingManager.HandleNamedMessageDelegate>((Action<ulong,FastBufferReader>)Receive);
            messaging.RegisterNamedMessageHandler("RRR/Race/1", receiver);
            Mod.Log.Msg("RACE_NETWORK_READY host="+Host+" client="+manager.LocalClientId);
        }
        if (Lan && !lanStarting && SceneManager.GetActiveScene().name=="Menu") { lanStarting=true; MelonCoroutines.Start(StartLan()); }
        if (Time.realtimeSinceStartup < nextLobby) return;
        nextLobby=Time.realtimeSinceStartup+.25f;
        if (!Lan && SteamLobby.Instance != null && SteamLobby.Instance.InLobby && SteamLobby.Instance.IsLobbyOwner)
        {
            var lobby=CourseSession.GetLobby(SteamLobby.Instance); lobby.MaxMembers=4;
            lobby.SetData("rrr_mode", "race4-"+Build);
            lobby.SetJoinable(RaceRuntime.Active==null);
            if(!lobbyLayoutChecked&&Args.Contains("--rrr-race-lobby-check")) {
                SetLobby(SteamLobby.Instance,lobby);lobbyLayoutChecked=true;
                Mod.Log.Msg("RACE_STEAM_CAPACITY_PASS max="+lobby.MaxMembers+" native lobby assignment/readback verified");
            }
        }
        if (Host && RaceRuntime.Active == null) Seats=ConnectedIds();
        foreach (var menu in Object.FindObjectsOfType<MainMenu>(true))
        {
            if (menu.crewCounter != null) menu.crewCounter.text=$"CREW {Count}/4";
            if (menu.noteLabel != null && string.IsNullOrEmpty(CourseSession.Status))
                menu.noteLabel.text="4 PLAYER RACE PROTOTYPE / join order: A driver, A navigator, B driver, B navigator";
        }
    }

    private static System.Collections.IEnumerator StartLan()
    {
        yield return new WaitForSecondsRealtime(1);
        NetSession.Ensure();
        if (Manager.IsListening) Manager.Shutdown();
        while (Manager.IsListening || Manager.ShutdownInProgress) yield return null;
        var transport=Manager.GetComponent<UnityTransport>() ?? Manager.gameObject.AddComponent<UnityTransport>();
        Manager.NetworkConfig.NetworkTransport=transport;
        transport.SetConnectionData("127.0.0.1", ushort.Parse(Arg("--rrr-port=","7787")), "127.0.0.1");
        Configure(Manager);
        if (IsLanHost) Manager.StartHost(); else Manager.StartClient();
        Mod.Log.Msg("RACE_LAN_STARTED host="+IsLanHost);
        if (!IsLanHost) yield break;
        float deadline=Time.realtimeSinceStartup+90;
        while (Count < 4 && Time.realtimeSinceStartup<deadline) yield return null;
        if (Count != 4) { Mod.Log.Error("RACE_LAN_FAILED: four clients were not connected."); Application.Quit(10); yield break; }
        yield return new WaitForSecondsRealtime(2);
        CourseSession.CurrentSeed=12345;
        Manager.SceneManager.LoadScene(Arg("--rrr-race-stage=","RRR_05"), LoadSceneMode.Single);
    }

    internal static void Configure(NetworkManager manager)
    {
        if (!Enabled) return;
        // The native approval callback contains a managed struct which the IL2CPP
        // delegate bridge cannot marshal. Enforce the four-seat cap on connection,
        // and require the matching pack/seed before a race can begin.
        manager.NetworkConfig.ConnectionApproval=false;
    }

    internal static unsafe void Send(byte[] packet, bool reliable=false, ulong? recipient=null)
    {
        if (messaging == null || Manager == null || !Manager.IsListening) return;
        var writer=new FastBufferWriter(packet.Length,Allocator.Temp,packet.Length);
        try
        {
            fixed (byte* p=packet) writer.WriteBytesSafe(p,packet.Length);
            var delivery=reliable?NetworkDelivery.ReliableSequenced:NetworkDelivery.UnreliableSequenced;
            if (recipient.HasValue) messaging.SendNamedMessage("RRR/Race/1",recipient.Value,writer,delivery);
            else if (Host) messaging.SendNamedMessageToAll("RRR/Race/1",writer,delivery);
            else messaging.SendNamedMessage("RRR/Race/1",0,writer,delivery);
        }
        finally { writer.Dispose(); }
    }

    private static unsafe void Receive(ulong sender,FastBufferReader reader)
    {
        int length=reader.Length-reader.Position;
        if (length<6 || length>RaceProtocol.MaxPacket) return;
        var bytes=new byte[length]; Marshal.Copy((IntPtr)reader.GetUnsafePtrAtCurrentPosition(),bytes,0,length);
        try { RaceRuntime.Active?.Receive(sender,bytes); }
        catch (Exception ex) when (ex is IOException || ex is ArgumentException || ex is FormatException) { Mod.Log.Warning("Rejected malformed race message: "+ex.Message); }
    }

    internal static void Scene(string name)
    {
        if (!Enabled) return;
        RaceRuntime.Active=null;
        if (name=="Menu") return;
        if (Mod.Stages.Any(s=>s.Scene==name)) MelonCoroutines.Start(RaceRuntime.Create());
    }

    [HarmonyPatch(typeof(NetworkManager),nameof(NetworkManager.StartHost))]
    private static class HostPatch { static void Prefix(NetworkManager __instance)=>Configure(__instance); }
    [HarmonyPatch(typeof(NetworkManager),nameof(NetworkManager.StartClient))]
    private static class ClientPatch { static void Prefix(NetworkManager __instance)=>Configure(__instance); }
    [HarmonyPatch(typeof(SteamLobby),"HostOwnLobby")]
    private static class IdlePatch { static bool Prefix()=>!Lan&&!joining; }
    [HarmonyPatch(typeof(SteamLobby),"ApplyTransport")]
    private static class TransportPatch { static bool Prefix()=>!Lan; }
    [HarmonyPatch(typeof(NetSession),"OnClientConnected")]
    private static class ConnectedPatch { static bool Prefix(ulong clientId) { if(!Enabled)return true;if(Host&&Count>4)Manager.DisconnectClient(clientId,"This race has four seats.");return false;} }
    [HarmonyPatch(typeof(NetSession),"EnterMenu")]
    private static class IdleHostPatch { static bool Prefix()=>!Lan; }

    [HarmonyPatch(typeof(SteamMatchmaking),nameof(SteamMatchmaking.CreateLobbyAsync))]
    private static class CapacityPatch { static void Prefix(ref int maxMembers) { if(Enabled)maxMembers=4; } }

    [HarmonyPatch(typeof(SteamLobby),"JoinLobby")]
    private static class JoinPatch
    {
        static bool Prefix(SteamLobby __instance,Lobby lobby)
        {
            if(!Enabled)return true;
            if(!joining) { joining=true;__instance._joining=true;MelonCoroutines.Start(Join(__instance,lobby)); }
            return false;
        }
    }
    private static System.Collections.IEnumerator Join(SteamLobby owner,Lobby lobby)
    {
        if(lobby.GetData("rrr_mode")!="race4-"+Build) { NetSession.SetNote("That lobby is not running this four-player prototype.");owner._joining=false;joining=false;yield break; }
        NetSession.Ensure().PrepareForJoin();
        owner._joining=true;
        while(Manager.IsListening||Manager.ShutdownInProgress)yield return null;
        var request=lobby.Join();float deadline=Time.realtimeSinceStartup+20;
        while(!request.IsCompleted && Time.realtimeSinceStartup<deadline)yield return null;
        if(!request.IsCompleted||request.IsFaulted||request.Result!=RoomEnter.Success) {NetSession.SetNote("Could not join the four-player lobby.");owner._joining=false;joining=false;yield break;}
        SetLobby(owner,lobby);
        var transport=Manager.GetComponent<FacepunchTransport>()??Manager.gameObject.AddComponent<FacepunchTransport>();
        transport.targetSteamId=lobby.Owner.Id.Value;Manager.NetworkConfig.NetworkTransport=transport;
        owner.RefreshRoster();Manager.StartClient();owner._joining=false;joining=false;
    }
    private static void SetLobby(SteamLobby owner,Lobby lobby)
    {
        var type=Il2CppClassPointerStore<Il2CppSystem.Nullable<Lobby>>.NativeClassPtr;
        int has=(int)IL2CPP.il2cpp_field_get_offset(IL2CPP.GetIl2CppField(type,"hasValue"))-IntPtr.Size*2;
        int value=(int)IL2CPP.il2cpp_field_get_offset(IL2CPP.GetIl2CppField(type,"value"))-IntPtr.Size*2;
        if(has!=0||value!=8)throw new InvalidDataException("Unsupported native lobby layout.");
        var target=owner.Pointer+(int)IL2CPP.il2cpp_field_get_offset(IL2CPP.GetIl2CppField(Il2CppClassPointerStore<SteamLobby>.NativeClassPtr,"_lobby"));
        Marshal.WriteInt64(target+value,unchecked((long)lobby.Id.Value));Marshal.WriteByte(target+has,1);
        if(!owner.InLobby||CourseSession.GetLobby(owner).Id.Value!=lobby.Id.Value)throw new InvalidDataException("Native lobby assignment failed.");
    }
    [HarmonyPatch(typeof(SteamLobby),"RefreshRoster")]
    private static class RosterPatch
    {
        static bool Prefix(SteamLobby __instance)
        {
            if(!Enabled)return true;__instance._members.Clear();
            if(__instance.InLobby) {
                var lobby=CourseSession.GetLobby(__instance);
                // The original menu has two physical roster rows. Keep those safe;
                // the prototype overlay/counter exposes all four assigned seats.
                for(int i=0;i<Math.Min(2,lobby.MemberCount);i++) {
                    var id=SteamMatchmaking.Internal.GetLobbyMemberByIndex(lobby.Id,i);var friend=new Friend(id);
                    __instance._members.Add(new SteamLobby.Member {Name=friend.Name,IsDriver=id==lobby.Owner.Id,IsLocal=id==SteamClient.SteamId});
                }
            }
            __instance.RosterChanged?.Invoke();return false;
        }
    }
    [HarmonyPatch(typeof(SteamLobby),"InviteFriend")]
    private static class InvitePatch {static bool Prefix(SteamLobby __instance,SteamId steamId,ref bool __result) {if(!Enabled)return true;__result=__instance.InLobby&&CourseSession.GetLobby(__instance).InviteFriend(steamId);return false;}}
    [HarmonyPatch(typeof(SteamLobby),"TryOpenInviteOverlay")]
    private static class OverlayPatch {static bool Prefix(SteamLobby __instance,ref bool __result){if(!Enabled)return true;__result=__instance.InLobby;if(__result)SteamFriends.OpenGameInviteOverlay(CourseSession.GetLobby(__instance).Id);return false;}}
    [HarmonyPatch(typeof(MainMenu),"RefreshLobby")]
    private static class MenuRosterPatch {static void Postfix(MainMenu __instance){if(!Enabled)return;if(__instance.crewCounter!=null)__instance.crewCounter.text=$"CREW {Count}/4";if(__instance.inviteButton!=null)__instance.inviteButton.interactable=Host&&Count<4;}}
    [HarmonyPatch(typeof(NetSession),"get_IsDriver")]
    private static class DriverPatch {static bool Prefix(ref bool __result){if(Enabled&&RaceRuntime.Active!=null&&LocalSlot>=0){__result=LocalSlot%2==0;return false;}return true;}}
    [HarmonyPatch(typeof(NetSession),"get_IsNavigator")]
    private static class NavPatch {static bool Prefix(ref bool __result){if(Enabled&&RaceRuntime.Active!=null&&LocalSlot>=0){__result=LocalSlot%2==1;return false;}return true;}}
    [HarmonyPatch(typeof(MainMenu),"LoadMap")]
    private static class OriginalMapPatch {static bool Prefix(string sceneName){if(!Enabled||sceneName.StartsWith("RRR_"))return true;CourseSession.SetStatus("Choose one of the six race profiles: 04–09.");return false;}}

    internal static void Gui()
    {
        if(!Enabled||SceneManager.GetActiveScene().name!="Menu")return;
        GUI.Box(new Rect(16,16,510,105),$"FOUR PLAYER RACE / PROTOTYPE\n{Count}/4 connected — seats follow join order\n1: A driver | 2: A navigator | 3: B driver | 4: B navigator\nEveryone launches this prototype before accepting Steam invites.");
    }
}
