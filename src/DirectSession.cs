using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using Il2CppInterop.Runtime.InteropTypes.Arrays;
using Il2Cpp;
using MelonLoader;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Networking.Transport.Relay;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;

namespace RightRightRight;

internal static class DirectSession
{
    internal static bool Enabled=>SteamDistribution.Config?.Direct==true;
    private static readonly Dictionary<ulong,string> accepted=new();
    private static string address="127.0.0.1",portText="7787",proposal="",scene="",note="Host a game, or enter your friend's room code.";
    private static bool busy,loading,autoStarted;
    private static bool advanced,wasConnected;
    internal static bool Busy=>busy;
    internal static string Note {set=>note=value;}
    private static float nextPacket,connectedAt;
    private static int proposalSeed;
    private static bool Menu=>SceneManager.GetActiveScene().name=="Menu";
    private static bool Verified=>RaceNetwork.Args.Contains("--rrr-direct-verify")||RaceNetwork.Args.Contains("--rrr-relay-verify");
    private static bool AllAccepted=>RaceNetwork.Count==4&&RaceNetwork.ConnectedIds().All(id=>id==0||accepted.TryGetValue(id,out var token)&&token==proposal);

    internal static void Scene(string name)
    {
        if(!Enabled)return;
        if(name=="Menu") {proposal="";scene="";loading=false;accepted.Clear();Cursor.lockState=CursorLockMode.None;Cursor.visible=true;}
    }

    internal static void Update()
    {
        if(!Enabled)return;
        DirectFlowVerification.Tick();
        if(Menu) {
            foreach(var menu in Object.FindObjectsOfType<MainMenu>(true))menu.enabled=false;
            // The original tablet UI can be a sibling of its controller. Disable
            // every menu canvas so it cannot receive clicks behind Host/Join.
            foreach(var canvas in Object.FindObjectsOfType<Canvas>(true))canvas.enabled=false;
        }
        if(Menu&&!autoStarted&&Verified) {
            autoStarted=true;address=RaceNetwork.Arg("--rrr-address=","127.0.0.1");portText=RaceNetwork.Arg("--rrr-port=","7787");
            if(RaceNetwork.Args.Contains("--rrr-relay-verify"))RelaySession.AutoConnect();else Connect(RaceNetwork.Args.Contains("--rrr-direct-host"));
        }
        var manager=RaceNetwork.Manager;
        if(wasConnected&&(manager==null||!manager.IsListening||(!manager.IsServer&&!manager.IsConnectedClient))) {
            Disconnect("Connection lost. Host a new room or rejoin from the menu.");
            if(!Menu)SceneManager.LoadScene("Menu");
            return;
        }
        if(manager==null||!manager.IsListening)return;
        if(manager.IsConnectedClient)wasConnected=true;
        if(!manager.IsServer&&!manager.IsConnectedClient) {
            if(Time.realtimeSinceStartup-connectedAt>25)Disconnect(RelaySession.Active?"Room connection timed out. Check the code and ask the host to create a new room.":"Could not connect. Check the address, UDP port and Porthole connection.");
            return;
        }
        if(!Menu)return;
        if(Time.realtimeSinceStartup>=nextPacket) {
            nextPacket=Time.realtimeSinceStartup+.3f;
            if(manager.IsServer) {
                var ids=RaceNetwork.ConnectedIds();
                foreach(var id in accepted.Keys.Where(id=>!ids.Contains(id)).ToArray())accepted.Remove(id);
                using var w=RaceProtocol.Writer(RaceProtocol.Kind.DirectLobby);
                w.Write(CourseSession.ContentId);w.Write((byte)ids.Length);foreach(var id in ids)w.Write(id);
                w.Write(proposal);w.Write(scene);w.Write(proposalSeed);RaceNetwork.Send(RaceProtocol.Bytes(w),true);
            }
            else {
                using var w=RaceProtocol.Writer(RaceProtocol.Kind.DirectHello);w.Write(CourseSession.ContentId);w.Write(proposal);RaceNetwork.Send(RaceProtocol.Bytes(w),true);
            }
        }
        if(manager.IsServer&&Verified&&!DirectFlowVerification.FinishedRounds&&AllAccepted&&!loading&&proposal.Length==0)
            Select(Mod.Stages.First(s=>s.Scene=="RRR_05"));
        if(manager.IsServer&&proposal.Length>0&&!loading&&AllAccepted) {
            loading=true;CourseSession.CurrentSeed=proposalSeed;
            Mod.Log.Msg($"DIRECT_COURSE_CONFIRMED {scene} seed={proposalSeed} peers=4");
            manager.SceneManager.LoadScene(scene,LoadSceneMode.Single);
        }
    }

    internal static void Restart()
    {
        if(RaceNetwork.Host&&RaceRuntime.Active!=null)
            RaceNetwork.Manager.SceneManager.LoadScene(SceneManager.GetActiveScene().name,LoadSceneMode.Single);
    }

    internal static void ReturnToLobby()
    {
        if(RaceNetwork.Host)RaceNetwork.Manager.SceneManager.LoadScene("Menu",LoadSceneMode.Single);
    }

    internal static bool Receive(ulong sender,byte[] bytes)
    {
        if(!Enabled)return false;
        using var reader=RaceProtocol.Reader(bytes,out var kind);
        if(kind!=RaceProtocol.Kind.DirectHello&&kind!=RaceProtocol.Kind.DirectLobby)return false;
        if(kind==RaceProtocol.Kind.DirectHello) {
            if(!RaceNetwork.Host||!RaceNetwork.ConnectedIds().Contains(sender))return true;
            if(reader.ReadString()!=CourseSession.ContentId) {
                RaceNetwork.Manager.DisconnectClient(sender,"Different game versions. Download the same standalone release.");return true;
            }
            accepted[sender]=reader.ReadString();
            return true;
        }
        if(RaceNetwork.Host||sender!=0)return true;
        if(reader.ReadString()!=CourseSession.ContentId) {Disconnect("Different game versions. Everyone needs the same standalone release.");return true;}
        int count=reader.ReadByte();if(count<1||count>4)return true;
        var ids=new ulong[count];for(int i=0;i<count;i++)ids[i]=reader.ReadUInt64();
        if(ids[0]!=0||ids.Distinct().Count()!=count)return true;
        string token=reader.ReadString(),target=reader.ReadString();int seed=reader.ReadInt32();
        if(token.Length>0 && (!Mod.Stages.Any(s=>s.Scene==target)||seed<=0||token!=$"{target}|{seed}"))return true;
        RaceNetwork.Seats=ids;proposal=token;scene=target;proposalSeed=seed;
        if(token.Length>0)CourseSession.CurrentSeed=seed;
        note=token.Length>0?"Confirming the host's course...":"Connected. Waiting for the host to choose a course.";
        return true;
    }

    internal static void Select(StageDefinition stage)
    {
        if(!Enabled||!RaceNetwork.Host||!AllAccepted||loading)return;
        proposalSeed=Verified?12345:RandomNumberGenerator.GetInt32(1,int.MaxValue);
        scene=stage.Scene;proposal=$"{scene}|{proposalSeed}";note="Waiting for all four players to confirm the course...";
        nextPacket=0;
    }

    private static void Connect(bool host)
    {
        if(busy||RelaySession.Busy)return;
        if(!ushort.TryParse(portText,out ushort port)||port==0){note="Enter a UDP port from 1 to 65535.";return;}
        if(!IPAddress.TryParse(address,out var ip)||ip.AddressFamily!=AddressFamily.InterNetwork){note="Enter an IPv4 address, such as 127.0.0.1.";return;}
        RelaySession.Cancel();busy=true;note=host?"Starting host...":"Connecting...";
        MelonCoroutines.Start(StartSafely(host,ip.ToString(),port));
    }

    private static System.Collections.IEnumerator StartSafely(bool host,string ip,ushort port)
    {
        var start=Start(host,ip,port);
        try {
            while(busy) {
                bool next;
                try{next=start.MoveNext();}
                catch(Exception ex){Mod.Log.Warning("DIRECT_CONNECT_FAILED "+ex.GetType().Name);Disconnect("Could not start the connection. Disconnect and try again.");yield break;}
                if(!next)yield break;
                yield return start.Current;
            }
        }
        finally{(start as IDisposable)?.Dispose();}
    }

    private static System.Collections.IEnumerator Start(bool host,string ip,ushort port)
    {
        var prepare=Prepare();
        while(prepare.MoveNext())yield return prepare.Current;
        var manager=RaceNetwork.Manager;
        var transport=manager.GetComponent<UnityTransport>()??manager.gameObject.AddComponent<UnityTransport>();
        // SetConnectionData alone does not reliably clear a previous Relay mode.
        transport.m_ProtocolType=UnityTransport.ProtocolType.UnityTransport;
        manager.NetworkConfig.NetworkTransport=transport;transport.SetConnectionData(ip,port,"0.0.0.0");
        bool success=StartNative(host);busy=false;
        note=success?(host?$"Hosting UDP {port}. Waiting for three friends.":"Connecting to host..."):"Could not start the connection. Check whether this port is already in use.";
        Mod.Log.Msg($"DIRECT_STARTED host={host} success={success} port={port}");
    }

    internal static System.Collections.IEnumerator Prepare()
    {
        wasConnected=false;NetSession.Ensure();var manager=RaceNetwork.Manager;
        if(manager.IsListening)manager.Shutdown();
        float deadline=Time.realtimeSinceStartup+10;
        while(manager.IsListening||manager.ShutdownInProgress) {
            if(Time.realtimeSinceStartup>deadline)throw new InvalidOperationException("Previous connection is still closing. Try again.");
            yield return null;
        }
    }

    private static bool StartNative(bool host)
    {
        var manager=RaceNetwork.Manager;
        RaceNetwork.Seats=Array.Empty<ulong>();accepted.Clear();proposal="";scene="";loading=false;
        RaceNetwork.Configure(manager);connectedAt=Time.realtimeSinceStartup;
        return host?manager.StartHost():manager.StartClient();
    }

    internal static bool StartRelayNative(bool host,RelayClient.Allocation allocation)
    {
        var manager=RaceNetwork.Manager;
        var transport=manager.GetComponent<UnityTransport>()??manager.gameObject.AddComponent<UnityTransport>();
        manager.NetworkConfig.NetworkTransport=transport;
        transport.SetRelayServerData(allocation.Host,allocation.Port,
            new Il2CppStructArray<byte>(allocation.IdBytes),new Il2CppStructArray<byte>(allocation.Key),
            new Il2CppStructArray<byte>(allocation.ConnectionData),new Il2CppStructArray<byte>(allocation.HostConnectionData),allocation.Secure);
        if(transport.Protocol!=UnityTransport.ProtocolType.RelayUnityTransport)throw new InvalidOperationException("This build could not enable Relay transport.");
        return StartNative(host);
    }

    internal static RelayConnectionStatus RelayStatus()
    {
        var transport=RaceNetwork.Manager.GetComponent<UnityTransport>();
        return transport!=null&&transport.m_Driver.IsCreated?transport.m_Driver.GetRelayConnectionStatus():RelayConnectionStatus.NotEstablished;
    }

    internal static void Disconnect(string message)
    {
        wasConnected=false;RelaySession.Cancel();
        if(RaceNetwork.Manager!=null&&RaceNetwork.Manager.IsListening)RaceNetwork.Manager.Shutdown();
        RaceNetwork.Seats=Array.Empty<ulong>();accepted.Clear();proposal="";loading=false;busy=false;note=message;
    }

    internal static void Gui()
    {
        if(!Enabled||!Menu)return;
        float left=Math.Max(8,(Screen.width-700)/2f),top=Math.Max(8,(Screen.height-520)/2f);
        GUI.Box(new Rect(left,top,700,510),"RIGHT RIGHT RIGHT / FOUR PLAYER RACE");
        bool disconnected=RaceNetwork.Manager==null||(!RaceNetwork.Manager.IsListening&&!RaceNetwork.Manager.ShutdownInProgress);
        if(!advanced)RelaySession.Gui(left,top,disconnected);
        else {
            GUI.Label(new Rect(left+20,top+35,660,40),"LAN / VPN: enter the host's IPv4 address. Porthole: share UDP 7787, then join 127.0.0.1.");
            GUI.enabled=!busy&&!RelaySession.Busy&&disconnected;
            GUI.Label(new Rect(left+20,top+90,100,25),"Host address");address=GUI.TextField(new Rect(left+125,top+90,205,28),address,45);
            GUI.Label(new Rect(left+345,top+90,45,25),"Port");portText=GUI.TextField(new Rect(left+390,top+90,75,28),portText,5);
            if(GUI.Button(new Rect(left+485,top+90,85,30),"HOST"))Connect(true);
            if(GUI.Button(new Rect(left+580,top+90,95,30),"JOIN"))Connect(false);
            GUI.enabled=true;
            if(GUI.Button(new Rect(left+20,top+135,150,28),"OPEN PORTHOLE"))Application.OpenURL("steam://run/4963920");
            if(GUI.Button(new Rect(left+180,top+135,150,28),"GET PORTHOLE"))Application.OpenURL("https://store.steampowered.com/app/4963920/");
        }
        if(GUI.Button(new Rect(left+575,top+135,100,28),"DISCONNECT"))Disconnect("Disconnected. Host or join a race.");
        GUI.Label(new Rect(left+20,top+185,660,45),$"{RaceNetwork.Count}/4 players — {note}");
        GUI.Label(new Rect(left+20,top+232,660,35),"Join order: host = A driver / next = A navigator / next = B driver / last = B navigator");
        bool canChoose=RaceNetwork.Host&&AllAccepted&&!loading&&proposal.Length==0;
        GUI.Label(new Rect(left+20,top+270,660,25),canChoose?"All four connected. Host: choose a course.":"The host can choose a course when all four matching players are connected.");
        GUI.enabled=canChoose;
        for(int i=0;i<Mod.Stages.Length;i++)if(GUI.Button(new Rect(left+20+(i%2)*335,top+310+(i/2)*46,320,36),Mod.Stages[i].Name))Select(Mod.Stages[i]);
        GUI.enabled=true;
        if(GUI.Button(new Rect(left+20,top+460,220,28),advanced?"BACK TO ROOM CODES":"LAN / ADVANCED"))advanced=!advanced;
        GUI.Label(new Rect(left+260,top+460,415,35),"Everyone needs the same game version. Four players per race.");
    }
}
