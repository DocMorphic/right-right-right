using System.Text.Json;
using Il2CppSteamworks;
using MelonLoader.Utils;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace RightRightRight;

// Developer-only lifecycle exercise; no scripted driving in normal sessions.
internal static class DirectFlowVerification
{
    private static RaceRuntime? last;
    private static int rounds;
    private static bool action,done;
    private static float began,returned;
    internal static bool FinishedRounds=>rounds>=2;
    internal static void Tick()
    {
        if(!RaceNetwork.Args.Contains("--rrr-direct-flow")||done)return;
        if(began==0)began=Time.realtimeSinceStartup;
        try {
            if(Time.realtimeSinceStartup-began>110)throw new Exception("Direct lifecycle timed out.");
            var race=RaceRuntime.Active;
            if(race!=null&&race!=last){last=race;rounds++;action=false;Mod.Log.Msg("DIRECT_FLOW_ROUND "+rounds);}
            if(race!=null&&race.Started&&race.Elapsed>1&&!action) {
                if(RaceNetwork.Seats.Length!=4||SteamClient.IsValid||race.Ready.Count!=4)throw new Exception("Invalid direct race readiness/Steam state.");
                if(RelaySession.Active&&DirectSession.RelayStatus()!=Unity.Networking.Transport.Relay.RelayConnectionStatus.Established)throw new Exception("Relay binding was lost between rounds.");
                action=true;
                if(RaceNetwork.Host){if(rounds==1)DirectSession.Restart();else if(rounds==2)DirectSession.ReturnToLobby();}
            }
            if(rounds>=2&&SceneManager.GetActiveScene().name=="Menu"&&RaceNetwork.Count==4&&returned==0)returned=Time.realtimeSinceStartup;
            if(returned>0&&Time.realtimeSinceStartup-returned>(RaceNetwork.Host?4:2))Finish(true,"");
        }
        catch(Exception ex){Finish(false,ex.Message);}
    }
    private static void Finish(bool passed,string error)
    {
        done=true;var folder=Path.Combine(MelonEnvironment.UserDataDirectory,"RightRightRight");Directory.CreateDirectory(folder);
        File.WriteAllText(Path.Combine(folder,"direct-flow.json"),JsonSerializer.Serialize(new {Pass=passed,Rounds=rounds,ReturnedToLobby=returned>0,SteamInitialized=SteamClient.IsValid,Relay=RelaySession.Active,RoomCodePresent=RelaySession.RoomCode.Length>=6,Error=error}));
        Mod.Log.Msg("DIRECT_FLOW_"+(passed?"PASS":"FAIL")+" "+error);Application.Quit(passed?0:23);
    }
}
