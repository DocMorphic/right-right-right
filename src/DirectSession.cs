using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using Il2Cpp;
using MelonLoader;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object=UnityEngine.Object;

namespace RightRightRight;

internal static class DirectSession
{
    internal static bool Enabled=>SteamDistribution.Config?.Direct==true;
    private static readonly Dictionary<ulong,string> accepted=new();
    private static string address="127.0.0.1",portText="7787",proposal="",scene="",note="Host a race, or join your host's address.";
    private static bool busy,loading,autoStarted;
    private static float nextPacket,connectedAt;
    private static int proposalSeed;
    private static bool Menu=>SceneManager.GetActiveScene().name=="Menu";
    private static bool Verified=>RaceNetwork.Args.Contains("--rrr-direct-verify");
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
            Connect(RaceNetwork.Args.Contains("--rrr-direct-host"));
        }
        var manager=RaceNetwork.Manager;
        if(manager==null||!manager.IsListening)return;
        if(!manager.IsServer&&!manager.IsConnectedClient) {
            if(Time.realtimeSinceStartup-connectedAt>25)Disconnect("Could not connect. Check the address, UDP port and Porthole connection.");
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
        if(busy)return;
        if(!ushort.TryParse(portText,out ushort port)||port==0){note="Enter a UDP port from 1 to 65535.";return;}
        if(!IPAddress.TryParse(address,out var ip)||ip.AddressFamily!=AddressFamily.InterNetwork){note="Enter an IPv4 address, such as 127.0.0.1.";return;}
        busy=true;note=host?"Starting host...":"Connecting...";
        MelonCoroutines.Start(Start(host,ip.ToString(),port));
    }

    private static System.Collections.IEnumerator Start(bool host,string ip,ushort port)
    {
        NetSession.Ensure();var manager=RaceNetwork.Manager;
        if(manager.IsListening)manager.Shutdown();
        while(manager.IsListening||manager.ShutdownInProgress)yield return null;
        var transport=manager.GetComponent<UnityTransport>()??manager.gameObject.AddComponent<UnityTransport>();
        manager.NetworkConfig.NetworkTransport=transport;transport.SetConnectionData(ip,port,"0.0.0.0");
        RaceNetwork.Seats=Array.Empty<ulong>();accepted.Clear();proposal="";scene="";loading=false;
        RaceNetwork.Configure(manager);connectedAt=Time.realtimeSinceStartup;
        bool success=host?manager.StartHost():manager.StartClient();busy=false;
        note=success?(host?$"Hosting UDP {port}. Waiting for three friends.":"Connecting to host..."):"Could not start the connection. Check whether this port is already in use.";
        Mod.Log.Msg($"DIRECT_STARTED host={host} success={success} port={port}");
    }

    private static void Disconnect(string message)
    {
        if(RaceNetwork.Manager!=null&&RaceNetwork.Manager.IsListening)RaceNetwork.Manager.Shutdown();
        RaceNetwork.Seats=Array.Empty<ulong>();accepted.Clear();proposal="";loading=false;busy=false;note=message;
    }

    internal static void Gui()
    {
        if(!Enabled||!Menu)return;
        float left=Math.Max(8,(Screen.width-700)/2f),top=Math.Max(8,(Screen.height-520)/2f);
        GUI.Box(new Rect(left,top,700,510),"RIGHT RIGHT RIGHT / FOUR PLAYER RACE");
        GUI.Label(new Rect(left+20,top+35,660,50),"Porthole: host shares UDP 7787; friends approve it and join 127.0.0.1.\nLAN / VPN: friends enter the host's reachable IPv4 address.");
        GUI.Label(new Rect(left+20,top+95,100,25),"Host address");address=GUI.TextField(new Rect(left+125,top+95,205,28),address,45);
        GUI.Label(new Rect(left+345,top+95,45,25),"Port");portText=GUI.TextField(new Rect(left+390,top+95,75,28),portText,5);
        GUI.enabled=!busy&&(RaceNetwork.Manager==null||!RaceNetwork.Manager.IsListening);
        if(GUI.Button(new Rect(left+485,top+95,85,30),"HOST"))Connect(true);
        if(GUI.Button(new Rect(left+580,top+95,95,30),"JOIN"))Connect(false);
        GUI.enabled=true;
        if(GUI.Button(new Rect(left+20,top+140,150,28),"OPEN PORTHOLE"))Application.OpenURL("steam://run/4963920");
        if(GUI.Button(new Rect(left+180,top+140,150,28),"GET PORTHOLE"))Application.OpenURL("https://store.steampowered.com/app/4963920/");
        if(GUI.Button(new Rect(left+505,top+140,170,28),"DISCONNECT"))Disconnect("Disconnected. Host or join a race.");
        GUI.Label(new Rect(left+20,top+185,660,45),$"{RaceNetwork.Count}/4 players — {note}");
        GUI.Label(new Rect(left+20,top+232,660,35),"Join order: host = A driver / next = A navigator / next = B driver / last = B navigator");
        bool canChoose=RaceNetwork.Host&&AllAccepted&&!loading&&proposal.Length==0;
        GUI.Label(new Rect(left+20,top+270,660,25),canChoose?"All four connected. Host: choose a course.":"The host can choose a course when all four matching players are connected.");
        GUI.enabled=canChoose;
        for(int i=0;i<Mod.Stages.Length;i++)if(GUI.Button(new Rect(left+20+(i%2)*335,top+310+(i/2)*46,320,36),Mod.Stages[i].Name))Select(Mod.Stages[i]);
        GUI.enabled=true;
        GUI.Label(new Rect(left+20,top+455,660,35),"Porthole runs separately. Keep it open during the race. No Steam App ID or playtest needed.");
    }
}
