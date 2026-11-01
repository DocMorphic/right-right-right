using System.Text.Json;
using Il2Cpp;
using MelonLoader.Utils;
using UnityEngine;

namespace RightRightRight;

// Explicit --rrr-race-verify only: native one-car gameplay through two real peers.
internal static class CoopVerification
{
    private static RaceRuntime? instance;
    private static readonly HashSet<string> checks=new();
    private static readonly Dictionary<string,bool> outcomes=new();
    private static int round;
    private static float began,endedAt,finishTime;
    private static Vector3 start;
    private static bool done,restarting;

    internal static void BotInput(RaceRuntime r,int slot,ref RaceRuntime.InputState input)
    {
        input.Throttle=r.Started&&r.Elapsed<3.5f&&slot==0?.65f:0;
        input.Steer=0;input.Buttons=RaceProtocol.Buttons.None;input.ActionSequence=0;
        if(slot==1&&r.Elapsed>=7){input.ActionSequence=1;input.Buttons=RaceProtocol.Buttons.Grab;}
        if(slot==1&&r.Elapsed>=18){input.ActionSequence=2;input.Buttons=RaceProtocol.Buttons.Door;}
        if(slot==1&&r.Elapsed>21&&r.Elapsed<24.5f)input.Buttons|=RaceProtocol.Buttons.Wipe;
    }

    internal static void Tick(RaceRuntime r)
    {
        if(done)return;
        if(instance!=r){instance=r;round++;checks.Clear();began=Time.realtimeSinceStartup;endedAt=0;restarting=false;start=r.Cars[0].Body.position;}
        try {
            if(!r.Started){if(Time.realtimeSinceStartup-began>45)throw new Exception("Co-op ready barrier timed out.");return;}
            Once(r,1,"one_car_two_seats",()=>Check("one_car_two_seats",r.PlayerCount==2&&r.Cars.Length==1&&r.Tablets.Length==1&&r.Ready.Count==2&&RaceNetwork.Seats.Length==2&&
                UnityEngine.Object.FindObjectsOfType<GoofyCarController>().Length==1&&!Il2CppSteamworks.SteamClient.IsValid));
            Once(r,2,"navigator_map",()=>Check("navigator_map",r.Tablets[0].Map._roadRibbon.vertexCount>100&&r.Tablets[0].Map._driverPrivacy==!RaceNetwork.Navigator));
            if(!RaceNetwork.Host) {
                if(r.Ended){
                    if(endedAt==0)endedAt=Time.realtimeSinceStartup;
                    if(round==1)finishTime=r.Cars[0].Finish;
                    if(round==2&&Time.realtimeSinceStartup-endedAt>1){Check("replicated_tree_failure",r.Cars[0].Dead&&r.TreeDeaths==1&&finishTime>25&&r.SnapshotPackets>30);Finish(r,true,"");}
                }
                return;
            }
            Once(r,3.5f,"driving",()=>Check("driving",Vector3.Distance(start,r.Cars[0].Body.position)>2&&r.Cars[0].Car.GroundedFraction>.5f&&r.InputPackets>60));
            if(round==1){
                Once(r,4,"mud_crossing",()=>{var d=StageHazards.Active!.Deposits[0];Pose(r,d.transform.position,d.transform.forward,d.transform.forward*2);});
                Once(r,5.5f,"mud",()=>Check("mud",r.Cars[0].MudAmount>.1f));
                Once(r,6,"door_open",()=>{Pose(r,r.Path[30],StageBuilder.Direction(r.Path,30),Vector3.zero);r.OpenDoor(0);r.Cars[0].DoorAngle=90;});
                Once(r,8,"remote_drop",()=>Check("remote_drop",r.Tablets[0].Holder<0&&r.Inputs[1].ActionSequence>=1));
                Once(r,10,"tablet_falls",()=>Check("tablet_falls",!r.Tablets[0].InCabin&&!r.Tablets[0].Body.isKinematic));
                Once(r,17,"early_finish",()=>FinishPose(r));
                Once(r,19.5f,"remote_door",()=>Check("remote_door",!r.Cars[0].Open&&r.Cars[0].DoorAngle<1&&r.Inputs[1].ActionSequence>=2&&r.Cars[0].Finish<0));
                Once(r,20,"mud_for_wipe",()=>r.Cars[0].MudAmount=.8f);
                Once(r,24.8f,"remote_wipe",()=>Check("remote_wipe",r.Cars[0].MudAmount<.05f));
                Once(r,26,"finish",()=>FinishPose(r));
                if(r.Ended){
                    if(endedAt==0){endedAt=Time.realtimeSinceStartup;finishTime=r.Cars[0].Finish;Check("shared_finish",finishTime>25&&!r.Cars[0].Dead);}
                    if(Time.realtimeSinceStartup-endedAt>3&&!restarting){restarting=true;DirectSession.Restart();}
                }
            }
            else if(round==2){
                Once(r,5,"tree_contact",()=>{var c=r.Cars[0];c.Car.enabled=false;var f=StageBuilder.Direction(r.Path,40);var side=Vector3.Cross(Vector3.up,f);Pose(r,r.Path[40],side,side*Math.Max(30,c.Car.GetComponent<CarCrash>().hardHitKmh/3.6f+8));});
                if(r.Ended){
                    if(endedAt==0){endedAt=Time.realtimeSinceStartup;Check("tree_ends_coop",r.Cars[0].Dead&&r.TreeDeaths==1&&finishTime>25);}
                    if(Time.realtimeSinceStartup-endedAt>3)Finish(r,true,"");
                }
            }
            if(r.Elapsed>35)throw new Exception("Co-op run failed to end.");
        }
        catch(Exception ex){Finish(r,false,ex.Message);}
    }

    private static void Pose(RaceRuntime r,Vector3 p,Vector3 f,Vector3 velocity)
    {
        var c=r.Cars[0];c.Body.isKinematic=false;c.Body.position=p+Vector3.up*.8f;c.Body.rotation=Quaternion.LookRotation(f);
        c.Body.linearVelocity=velocity;c.Body.angularVelocity=Vector3.zero;c.LastPosition=c.Body.position;Physics.SyncTransforms();
    }
    private static void FinishPose(RaceRuntime r){int i=r.Path.Count-9;var f=StageBuilder.Direction(r.Path,i);Pose(r,r.Path[i]-f*2,f,f*7);}
    private static void Once(RaceRuntime r,float time,string key,Action action){if(r.Elapsed>=time&&checks.Add(key))action();}
    private static void Check(string key,bool pass){outcomes[key]=pass;if(!pass)throw new Exception(key);Mod.Log.Msg("COOP_CHECK_PASS "+key);}
    private static void Finish(RaceRuntime r,bool pass,string error)
    {
        done=true;
        File.WriteAllText(Path.Combine(MelonEnvironment.UserDataDirectory,"RightRightRight","race-verification.json"),JsonSerializer.Serialize(new {Pass=pass,Client=RaceNetwork.Manager.LocalClientId,Slot=RaceNetwork.LocalSlot,Players=r.PlayerCount,Cars=r.Cars.Length,Tablets=r.Tablets.Length,Rounds=round,FinishTime=finishTime,TreeDeaths=r.TreeDeaths,Checks=outcomes,Error=error}));
        Mod.Log.Msg("RACE_VERIFY_"+(pass?"PASS":"FAIL")+" client="+RaceNetwork.Manager.LocalClientId+" co-op "+error);Application.Quit(pass?0:24);
    }
}
