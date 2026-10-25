using System.Text.Json;
using Il2Cpp;
using MelonLoader.Utils;
using UnityEngine;

namespace RightRightRight;

// Verification-only fixture teleports set up contacts. Driving, interactions and
// replication still traverse the actual four-process network and native physics.
internal static class RaceVerification
{
    private static RaceRuntime? instance;
    private static readonly HashSet<string> checks=new();
    private static readonly Dictionary<string,bool> outcomes=new();
    private static Vector3[] starts=new Vector3[2];
    private static float begun,endedAt;
    private static bool failed,completed;
    internal static void BotInput(RaceRuntime r,int slot,ref RaceRuntime.InputState input)
    {
        if(!RaceNetwork.Verify)return;
        input.Throttle=r.Started&&r.Elapsed<3.5f&&slot%2==0?.65f:0;
        input.Steer=0;input.Buttons=RaceProtocol.Buttons.None;input.ActionSequence=0;
        if(slot==1)
        {
            uint action=r.Elapsed>=12.5f?4u:r.Elapsed>=10.5f?3u:r.Elapsed>=9.2f?2u:r.Elapsed>=7?1u:0;
            input.ActionSequence=action;if(action>0)input.Buttons|=RaceProtocol.Buttons.Grab;
            var delta=Quaternion.Inverse(r.Cars[0].Body.rotation)*(r.Tablets[1].Body.position-r.Cars[0].NavigatorEye.position);
            input.Pitch=Math.Clamp(-MathF.Atan2(delta.y,MathF.Sqrt(delta.x*delta.x+delta.z*delta.z))*Mathf.Rad2Deg,-65,75);
            input.Yaw=Math.Clamp(MathF.Atan2(delta.x,delta.z)*Mathf.Rad2Deg,-150,150);
            if(r.Elapsed>21&&r.Elapsed<24.5f)input.Buttons|=RaceProtocol.Buttons.Wipe;
        }
        if(slot==3&&r.Elapsed>=7.5f) {input.ActionSequence=1;input.Buttons|=RaceProtocol.Buttons.Grab;}
    }
    internal static void Tick(RaceRuntime r)
    {
        if(!RaceNetwork.Verify||completed)return;
        if(instance!=r) {instance=r;checks.Clear();outcomes.Clear();begun=Time.realtimeSinceStartup;endedAt=0;failed=false;starts=r.Cars.Select(c=>c.Body.position).ToArray();}
        try
        {
            if(!r.Started) { if(Time.realtimeSinceStartup-begun>45)throw new Exception("Four-player ready barrier timed out.");return; }
            Once(r,2,"tablet_maps",()=> {
                foreach(var p in r.Tablets)Mod.Log.Msg($"RACE_TABLET_DETAIL privacy={p.Map._driverPrivacy} timer={p.Map._timerText?.text} digit={r.Controller._countdownDigit} racingDigit={StageController.RacingDigit}");
                Check("tablet_maps",r.Tablets.All(p=>p.Map._mapCam!=null&&p.Map._rt!=null&&p.Map._roadRibbon.vertexCount>100&&p.Map._driverPrivacy==!RaceNetwork.Navigator&&p.Map._mapCam.cullingMask==(1<<p.Map._minimapLayer)));
            });
            if(r.Cars.Any(c=>c.Jolt>.2f))outcomes["cockpit_jolt"]=true;
            if(!RaceNetwork.Host)
            {
                if(r.Ended)
                {
                    if(endedAt==0)endedAt=Time.realtimeSinceStartup;
                    if(Time.realtimeSinceStartup-endedAt>1) {
                        Check("remote_state",r.SnapshotPackets>100 && r.Impacts>0 && r.Steals>0 && r.TreeDeaths==1 && r.Cars[1].Dead && r.Cars[0].Finish>25 && outcomes.ContainsKey("cockpit_jolt"));
                        Finish(r);
                    }
                }
                return;
            }
            Once(r,3.5f,"independent_driving",()=>Check("independent_driving",r.Ready.Count==4&&r.InputPackets>150&&Enumerable.Range(0,2).All(i=>Vector3.Distance(starts[i],r.Cars[i].Body.position)>2&&r.Cars[i].Car.GroundedFraction>.5f)));
            Once(r,4,"impact_fixture",()=> {
                var p=r.Path[30];var right=Vector3.Cross(Vector3.up,StageBuilder.Direction(r.Path,30));
                for(int i=0;i<2;i++) {r.Cars[i].Car.enabled=false;Pose(r,i,p+right*(i==0?-3.5f:3.5f),right*(i==0?1:-1),right*(i==0?6:-6));}
            });
            Once(r,6,"car_collision",()=> {
                Check("car_collision",r.Impacts>0&&!r.Cars.Any(c=>c.Dead));
                var deposit=StageHazards.Active!.Deposits[0];var side=deposit.transform.right;
                for(int i=0;i<2;i++) {r.Cars[i].Car.enabled=true;Pose(r,i,deposit.transform.position+side*(i==0?-2.3f:2.3f),deposit.transform.forward,deposit.transform.forward*2);}
            });
            Once(r,6.9f,"both_mud",()=> {
                Check("both_mud",r.Cars.All(c=>c.MudAmount>.1f));
                var p=r.Path[30];var f=StageBuilder.Direction(r.Path,30);var side=Vector3.Cross(Vector3.up,f);
                Pose(r,0,p,f,Vector3.zero);Pose(r,1,p+side*2.7f,f,Vector3.zero);
            });
            if(r.Elapsed>8.8f&&r.Elapsed<10.8f&&r.Tablets[1].Holder<0) {
                var p=r.Tablets[1];p.InCabin=true;p.Body.position=r.Cars[1].NavigatorLap.position+Vector3.up*.25f;p.Body.linearVelocity=Vector3.zero;
                r.Tablets[0].InCabin=false;r.Tablets[0].Body.position=r.Cars[0].Body.position-r.Cars[0].Car.transform.forward*8;
            }
            Once(r,9.9f,"closed_door_guard",()=>Check("closed_door_guard",r.Inputs[1].ActionSequence>=2&&r.Steals==0&&r.Tablets.All(p=>p.Holder<0)));
            Once(r,10,"open_for_steal",()=>{r.OpenDoor(1);r.Cars[1].DoorAngle=90;});
            Once(r,11.8f,"steal",()=>Check("steal",r.Steals==1&&r.Tablets[1].Holder==1&&r.Tablets[1].Carrier==0));
            Once(r,13,"loose_door",()=>{Check("navigator_drop",r.Tablets[1].Holder<0);r.OpenDoor(0);r.Cars[0].DoorAngle=90;});
            Once(r,14.5f,"fall_out",()=> {
                var p=r.Tablets[1];Mod.Log.Msg($"RACE_FALL_DETAIL local={r.Cars[0].Car.transform.InverseTransformPoint(p.Body.position)} velocity={p.Body.linearVelocity} cabin={p.InCabin} holder={p.Holder} kinematic={p.Body.isKinematic} constraints={p.Body.constraints} parent={p.Native.transform.parent?.name} joints={p.Native.GetComponents<Joint>().Length}");
                if(p.InCabin) foreach(var c in UnityEngine.Object.FindObjectsOfType<Collider>().Where(c=>!p.Colliders.Any(own=>own.Pointer==c.Pointer)).OrderBy(c=>(c.bounds.center-p.Body.position).sqrMagnitude).Take(8))Mod.Log.Msg($"RACE_NEAR_TABLET collider={c.name} body={c.attachedRigidbody?.name} root={c.transform.root.name} center={c.bounds.center} size={c.bounds.size}");
                Check("fall_out",!p.InCabin&&p.Holder<0&&!p.Body.isKinematic);
            });
            Once(r,15,"tree_fixture",()=> {
                var c=r.Cars[1];c.Car.enabled=false;
                var f=StageBuilder.Direction(r.Path,40);var side=Vector3.Cross(Vector3.up,f);
                Pose(r,1,r.Path[40],side,side*Math.Max(30,c.Car.GetComponent<CarCrash>().hardHitKmh/3.6f+8));
            });
            Once(r,17,"tree_fatal",()=>Check("tree_fatal",r.Cars[1].Dead&&!r.Cars[0].Dead&&r.TreeDeaths==1));
            Once(r,18,"early_finish_fixture",()=>FinishPose(r));
            Once(r,19.5f,"early_finish_guard",()=>Check("early_finish_guard",r.Cars[0].Finish<0));
            Once(r,20,"mud_for_wipe",()=>r.Cars[0].MudAmount=.8f);
            Once(r,24.8f,"remote_wipe",()=>Check("remote_wipe",r.Cars[0].MudAmount<.05f));
            Once(r,26,"finish_fixture",()=>FinishPose(r));
            if(r.Ended)
            {
                if(endedAt==0)endedAt=Time.realtimeSinceStartup;
                if(Time.realtimeSinceStartup-endedAt>3) {Check("finish_time",r.Cars[0].Finish>25&&r.Cars[1].Finish<0);Finish(r);}
            }
            if(r.Elapsed>33)throw new Exception("Race verification failed to finish.");
        }
        catch(Exception ex) {failed=true;Mod.Log.Error("RACE_VERIFY_FAIL: "+ex.Message);Finish(r);}
    }
    private static void FinishPose(RaceRuntime r)
    {
        int index=r.Path.Count-9;var f=StageBuilder.Direction(r.Path,index);Pose(r,0,r.Path[index]-f*2,f,f*7);
    }
    private static void Pose(RaceRuntime r,int team,Vector3 position,Vector3 forward,Vector3 velocity)
    {
        var c=r.Cars[team];c.Body.isKinematic=false;c.Body.position=position+Vector3.up*.8f;c.Body.rotation=Quaternion.LookRotation(forward);
        c.Body.linearVelocity=velocity;c.Body.angularVelocity=Vector3.zero;c.LastPosition=c.Body.position;Physics.SyncTransforms();
    }
    private static void Once(RaceRuntime r,float time,string name,Action run) {if(r.Elapsed>=time&&checks.Add(name))run();}
    private static void Check(string name,bool passed) {outcomes[name]=passed;Mod.Log.Msg($"RACE_CHECK_{(passed?"PASS":"FAIL")} {name}");if(!passed)throw new Exception(name);}
    private static void Finish(RaceRuntime r)
    {
        completed=true;
        string path=System.IO.Path.Combine(MelonEnvironment.UserDataDirectory,"RightRightRight","race-verification.json");
        File.WriteAllText(path,JsonSerializer.Serialize(new {Client=RaceNetwork.Manager.LocalClientId,Slot=RaceNetwork.LocalSlot,Host=RaceNetwork.Host,Pass=!failed,
            r.InputPackets,r.SnapshotPackets,r.Impacts,r.Steals,r.TreeDeaths,FinishA=r.Cars[0].Finish,FinishB=r.Cars[1].Finish,Checks=outcomes},new JsonSerializerOptions {WriteIndented=true}));
        Mod.Log.Msg("RACE_VERIFY_"+(failed?"FAIL":"PASS")+" client="+RaceNetwork.Manager.LocalClientId);Application.Quit(failed?20:0);
    }
}
