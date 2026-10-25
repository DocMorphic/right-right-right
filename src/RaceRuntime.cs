using System.Text;
using HarmonyLib;
using Il2Cpp;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.InputSystem;
using Object=UnityEngine.Object;

namespace RightRightRight;

internal sealed class RaceRuntime
{
    internal static RaceRuntime? Active;
    internal sealed class Crew
    {
        internal GoofyCarController Car=null!; internal Rigidbody Body=null!;
        internal CabinDoor Door=null!; internal WindshieldMud Mud=null!;
        internal Transform DriverEye=null!, NavigatorEye=null!;
        internal Transform DriverLap=null!, NavigatorLap=null!;
        internal Quaternion DriverRest,NavigatorRest;
        internal float DoorAngle,DoorVelocity,NextDoor=14,TurnHold,MudAmount,Finish=-1,StoppedAt=-1,Jolt;
        internal bool Open,Dead; internal int Progress;
        internal Vector3 LastPosition;
        internal Vector3 TargetPosition,Velocity; internal Quaternion TargetRotation;
    }
    internal sealed class Pad
    {
        internal CabinHoldable Native=null!; internal Rigidbody Body=null!;
        internal TabletMinimap Map=null!; internal Collider[] Colliders=Array.Empty<Collider>();
        internal int Holder=-1,Carrier; internal bool InCabin=true;
        internal Vector3 TargetPosition,Velocity; internal Quaternion TargetRotation;
    }
    internal struct InputState { internal float Throttle,Steer,Pitch,Yaw,Arrived; internal RaceProtocol.Buttons Buttons; internal uint Sequence,ActionSequence; }
    internal readonly Crew[] Cars=new Crew[2];
    internal readonly Pad[] Tablets=new Pad[2];
    internal readonly InputState[] Inputs=new InputState[4];
    internal readonly HashSet<ulong> Ready=new();
    private readonly Dictionary<(IntPtr,int),float> mudReady=new();
    private readonly Dictionary<IntPtr,float> nextMapFrame=new();
    internal StageController Controller=null!; internal List<Vector3> Path=null!;
    internal float RoadWidth,Elapsed,Countdown=-1;
    internal bool Started,Ended;
    internal bool Disconnected;
    internal uint Epoch,SnapshotSequence,LastSnapshot,InputSequence,ActionSequence;
    internal int InputPackets,SnapshotPackets,Impacts,Steals,DoorEvents,TreeDeaths;
    internal float NextSend,NextReady;
    private float lastSnapshotTime, nextImpact;
    private Camera? view;
    internal Camera? View=>view;
    private int viewSlot=-2;
    private Vector3 lastShake;
    private readonly List<(Renderer Renderer,bool Enabled)> hiddenHead=new();
    private float lookPitch,lookYaw;
    private RaceProtocol.Buttons lastActions;
    private readonly CourseGeometry.Rng random=new(9211);
    internal static System.Collections.IEnumerator Create()
    {
        yield return new WaitForSeconds(2);
        try
        {
            var race=new RaceRuntime();
            race.Build(); Active=race;RaceCapture.Start(race);
            Mod.Log.Msg($"RACE_SCENE_READY cars=2 tablets=2 host={RaceNetwork.Host} width={race.RoadWidth}");
        }
        catch(Exception ex) { Mod.Log.Error("Race setup failed: "+ex); if(RaceNetwork.Verify) Application.Quit(11); }
    }

    private void Build()
    {
        Controller=Object.FindObjectsOfType<StageController>().First(); Controller.enabled=false;
        var hazards=StageHazards.Active ?? throw new InvalidDataException("Race road has not been built.");
        Path=hazards.Path; RoadWidth=RaceNetwork.Width;
        if(RaceNetwork.Host) { RaceNetwork.Seats=RaceNetwork.ConnectedIds(); Epoch=(uint)Environment.TickCount; Ready.Add(0); }
        var original=Controller.car;
        foreach(var binder in Object.FindObjectsOfType<CabinOccupantBinder>()) { binder.Attach(); binder.enabled=false; }
        var nativePad=Object.FindObjectsOfType<CabinHoldable>().First();
        var padNetwork=nativePad.GetComponent<NetworkObject>();if(padNetwork!=null)padNetwork.AutoObjectParentSync=false;
        var carNetwork=original.GetComponent<NetworkObject>();if(carNetwork!=null)carNetwork.AutoObjectParentSync=false;
        // The native tablet starts outside the car hierarchy. Reparent before cloning
        // so Unity remaps the cabin, anchor and physics references for crew B.
        nativePad.transform.SetParent(original.transform,true);
        var bridge=original.GetComponent<NetworkCarBridge>();
        Mod.Log.Msg($"RACE_SOURCE root={original.name}; camera={bridge.cabinCamera.name}; tablet={nativePad.name}; driver={bridge.driverName}; nav={bridge.navigatorName}");
        foreach(var camera in Object.FindObjectsOfType<Camera>())
            Mod.Log.Msg($"RACE_CAMERA {camera.name} parent={camera.transform.parent?.name} local={camera.transform.localPosition}");
        original.gameObject.SetActive(false);
        var duplicate=Object.Instantiate(original.gameObject); duplicate.name="RRR_Car_B";
        foreach(var network in duplicate.GetComponentsInChildren<NetworkBehaviour>(true))
            if(network is NetworkCarBridge || network.GetType().FullName!.Contains("NetworkTransform")) Object.DestroyImmediate(network);
        foreach(var network in duplicate.GetComponentsInChildren<NetworkObject>(true)) Object.DestroyImmediate(network);
        original.gameObject.SetActive(true);
        duplicate.SetActive(true);
        Cars[0]=MakeCrew(original,0); Cars[1]=MakeCrew(duplicate.GetComponent<GoofyCarController>(),1);
        for(int team=0;team<2;team++)
        {
            var car=Cars[team];
            var tablet=car.Car.GetComponentsInChildren<CabinHoldable>(true).First(); tablet.enabled=false;
            var pad=new Pad { Native=tablet, Body=tablet.GetComponent<Rigidbody>(), Map=tablet.GetComponent<TabletMinimap>(), Carrier=team, Holder=team*2+1 };
            pad.Colliders=tablet.GetComponentsInChildren<Collider>(true).ToArray(); Tablets[team]=pad;
            foreach(var collider in pad.Colliders)collider.gameObject.layer=0;
            Physics.IgnoreLayerCollision(0,GameObject.Find("RRR_Road").layer,false);
            pad.Native.transform.SetParent(null,true);
            pad.Map.car=car.Car.transform; pad.Map._carBridge=null;
            pad.Body.isKinematic=true;
            var right=Vector3.Cross(Vector3.up,StageBuilder.Direction(Path,8));
            car.Body.position=Path[8]+right*(team==0?-2.3f:2.3f)+Vector3.up*.75f;
            car.Body.rotation=Quaternion.LookRotation(StageBuilder.Direction(Path,8)); car.Car.transform.SetPositionAndRotation(car.Body.position,car.Body.rotation);
            car.LastPosition=car.TargetPosition=car.Body.position; car.TargetRotation=car.Body.rotation;
            car.Body.isKinematic=!RaceNetwork.Host; car.Car.enabled=RaceNetwork.Host; car.Car.SetGridHold(true);
            car.Door.enabled=false; car.Mud.enabled=false;
        }
        foreach(var pad in Tablets) foreach(var collider in pad.Colliders) foreach(var car in Cars)
            foreach(var other in car.Car.GetComponentsInChildren<Collider>(true)) Physics.IgnoreCollision(collider,other,true);
        // Native limb/cabin proxy bodies live outside the car hierarchy. Their
        // closed-shell collision otherwise cages a loose tablet even with the
        // visible door open. The closed-door bounds guard remains authoritative.
        var proxies=Object.FindObjectsOfType<CabinBodyBlock>().Select(b=>b._body)
            .Concat(Object.FindObjectsOfType<CabinShell>().Select(s=>s._shell)).Where(b=>b!=null).ToArray();
        foreach(var pad in Tablets) foreach(var collider in pad.Colliders) foreach(var proxy in proxies)
            foreach(var other in proxy.GetComponentsInChildren<Collider>(true)) Physics.IgnoreCollision(collider,other,true);
        Mod.Log.Msg("RACE_CABIN_PROXIES tablet collision exclusions="+proxies.Length);
        var a=Cars[0].Car.GetComponentsInChildren<Collider>(true); var b=Cars[1].Car.GetComponentsInChildren<Collider>(true);
        foreach(var first in a) foreach(var second in b) Physics.IgnoreLayerCollision(first.gameObject.layer,second.gameObject.layer,false);
        foreach(var grabber in Object.FindObjectsOfType<CabinGrabber>()) grabber.enabled=false;
        foreach(var finish in Object.FindObjectsOfType<StageFinishLine>()) finish.enabled=false;
        foreach(var start in Object.FindObjectsOfType<StageStartPoint>()) start.enabled=false;
        foreach(var camera in Object.FindObjectsOfType<Camera>()) if(camera.targetTexture==null) { camera.enabled=false; var audio=camera.GetComponent<AudioListener>(); if(audio!=null) audio.enabled=false; }
        foreach(var look in Object.FindObjectsOfType<DriverMouseLook>()) look.enabled=false;
        Controller._phase=StageController.Phase.Racing; Controller._runTime=0;
        Physics.SyncTransforms();
    }

    private Crew MakeCrew(GoofyCarController car,int team)
    {
        Mod.Log.Msg($"RACE_COMPONENTS crew={team} pads={car.GetComponentsInChildren<CabinHoldable>(true).Length} doors={car.GetComponentsInChildren<CabinDoor>(true).Length} mud={car.GetComponentsInChildren<WindshieldMud>(true).Length}");
        var bridge=car.GetComponent<NetworkCarBridge>();
        var nativeTablet=car.GetComponentsInChildren<CabinHoldable>(true).First();
        var driverHead=car.GetComponentsInChildren<Transform>(true).FirstOrDefault(t=>t.name=="Driver");
        // Original eye helpers also include rig-specific names; the hold anchors
        // identify each seat without depending on globally named characters.
        var driverEye=car.GetComponentsInChildren<DriverMouseLook>(true).Select(l=>l.transform).FirstOrDefault();
        var driverCharacter=car.GetComponentsInChildren<Transform>(true).FirstOrDefault(t=>t.name=="Driver") ?? car.GetComponentsInChildren<Transform>(true).FirstOrDefault(t=>t.name==bridge?.driverName);
        var navCharacter=car.GetComponentsInChildren<Transform>(true).FirstOrDefault(t=>t.name=="Navigator") ?? car.GetComponentsInChildren<Transform>(true).FirstOrDefault(t=>t.name==bridge?.navigatorName);
        Transform Eye(Transform? character,Transform fallback)
        {
            if(character!=null) { var head=CabinOccupantBinder.FindHeadBone(character); if(head!=null) { var eye=CabinOccupantBinder.FindEyeAnchor(head); if(eye!=null) return eye; return head; } }
            return fallback;
        }
        var crew=new Crew { Car=car, Body=car.GetComponent<Rigidbody>(), Door=car.GetComponentsInChildren<CabinDoor>(true).First(),
            Mud=car.GetComponentsInChildren<WindshieldMud>(true).First(), DriverLap=nativeTablet.driverAnchor, NavigatorLap=nativeTablet.passengerAnchor };
        crew.DriverEye=Eye(driverCharacter,driverEye??crew.DriverLap); crew.NavigatorEye=Eye(navCharacter,crew.NavigatorLap);
        if(crew.DriverEye==crew.DriverLap||crew.NavigatorEye==crew.NavigatorLap)throw new InvalidDataException("Original occupants were not attached to crew "+team);
        crew.DriverRest=Head(crew.DriverEye).localRotation;crew.NavigatorRest=Head(crew.NavigatorEye).localRotation;
        foreach(var binder in car.GetComponentsInChildren<CabinOccupantBinder>(true)) binder.enabled=false;
        if(bridge!=null) bridge.enabled=false;
        foreach(var crash in car.GetComponentsInChildren<CarCrash>(true)) crash.enabled=RaceNetwork.Host;
        Mod.Log.Msg($"RACE_CREW {team}: driverEye={crew.DriverEye.name}; navEye={crew.NavigatorEye.name}; door={crew.Door.door?.name}; pad={nativeTablet.name}");
        return crew;
    }
    private static Transform Head(Transform eye)=>eye.name=="Head"?eye:eye.parent;

    internal void Update()
    {
        if(Controller==null || RaceNetwork.Manager==null || !RaceNetwork.Manager.IsListening) return;
        AttachView();
        if(Time.realtimeSinceStartup>=NextReady && !RaceNetwork.Host && !Started && Epoch!=0)
        {
            NextReady=Time.realtimeSinceStartup+1;
            using var w=RaceProtocol.Writer(RaceProtocol.Kind.Ready); w.Write(Epoch); w.Write(CourseSession.ContentId); w.Write(CourseSession.CurrentSeed); RaceNetwork.Send(RaceProtocol.Bytes(w),true);
        }
        SampleInput();
        if(RaceNetwork.Host) HostUpdate(); else ClientUpdate();
        foreach(var pad in Tablets) UpdatePad(pad);
        for(int i=0;i<2;i++)
        {
            var crew=Cars[i];
            crew.Door.door.localRotation=crew.Door._doorRest*Quaternion.Euler(0,crew.Door.openSign*crew.DoorAngle,0);
            crew.Mud._mud=crew.MudAmount; crew.Mud._display=crew.MudAmount;
            crew.Mud.LateUpdate();
            crew.Jolt=Math.Max(0,crew.Jolt-Time.deltaTime*2);
        }
        Controller._runTime=Elapsed;
        Controller._countdownDigit=!Started?(Countdown<0?StageController.WaitingDigit:(byte)Math.Max(1,Math.Ceiling(Countdown))):Ended?StageController.FinishedDigit:StageController.RacingDigit;
        if(Time.realtimeSinceStartup>=NextSend)
        {
            NextSend=Time.realtimeSinceStartup+1f/25;
            if(RaceNetwork.Host) SendSnapshot(); else SendInput();
        }
        if(RaceNetwork.Host && Keyboard.current!=null && Keyboard.current.f8Key.wasPressedThisFrame) NetSession.Instance.RestartMap();
        RaceVerification.Tick(this);
    }

    private void HostUpdate()
    {
        if(!Ended && RaceNetwork.Count!=4) {
            Disconnected=true;foreach(var c in Cars)c.Car.SetGridHold(true);return;
        }
        if(Disconnected) {Disconnected=false;foreach(var c in Cars)if(!c.Dead&&c.Finish<0)c.Car.SetGridHold(!Started);}
        if(!Started && RaceNetwork.Seats.Length==4 && Ready.Count==4)
        {
            if(Countdown<0) { Countdown=5; Mod.Log.Msg("RACE_FOUR_READY: countdown started."); }
            Countdown=Math.Max(0,Countdown-Time.deltaTime);
            if(Countdown==0) { Started=true; foreach(var crew in Cars) crew.Car.SetGridHold(false); Mod.Log.Msg("RACE_GO"); }
        }
        if(Started && !Ended) Elapsed+=Time.deltaTime;
        for(int i=0;i<2;i++)
        {
            var c=Cars[i]; if(c.Dead || c.Finish>=0) continue;
            bool wipe=Inputs[i*2].Buttons.HasFlag(RaceProtocol.Buttons.Wipe)||Inputs[i*2+1].Buttons.HasFlag(RaceProtocol.Buttons.Wipe);
            if(wipe) c.MudAmount=Math.Max(0,c.MudAmount-Time.deltaTime/Math.Max(.5f,c.Mud.clearDuration));
            if(Started && Math.Abs(c.Car.SteerInput)>.45f && c.Car.SpeedKmh>16) c.TurnHold+=Time.deltaTime; else c.TurnHold=0;
            if(Started && Elapsed>c.NextDoor && c.TurnHold>.4f) { OpenDoor(i); c.NextDoor=Elapsed+random.Range(22,40); }
            if(c.Open)
            {
                c.DoorVelocity+=(Math.Abs(c.Car.SteerInput)*20+10-c.DoorVelocity*2)*Time.deltaTime;
                c.DoorAngle=Math.Clamp(c.DoorAngle+c.DoorVelocity*Time.deltaTime,8,90);
            }
            CheckProgress(i);
        }
        Ended=Cars.All(c=>c.Dead||c.Finish>=0);
    }

    private void ClientUpdate()
    {
        if(Started && !Ended) Elapsed+=Time.deltaTime;
        foreach(var c in Cars)
        {
            float stale=Time.realtimeSinceStartup-lastSnapshotTime;
            var predicted=c.TargetPosition+c.Velocity*Math.Clamp(stale,0,.08f);
            c.Body.position=Vector3.Lerp(c.Body.position,predicted,Math.Clamp(Time.deltaTime*18,0,1));
            c.Body.rotation=Quaternion.Slerp(c.Body.rotation,c.TargetRotation,Math.Clamp(Time.deltaTime*18,0,1));
        }
    }

    private void AttachView()
    {
        int slot=RaceNetwork.LocalSlot; if(slot<0 || slot==viewSlot) return;
        viewSlot=slot; var crew=Cars[slot/2]; var eye=slot%2==0?crew.DriverEye:crew.NavigatorEye;
        view=Object.FindObjectsOfType<Camera>(true).FirstOrDefault(c=>c.targetTexture==null && c.name.Contains("Camera"));
        if(view==null) throw new InvalidDataException("Original cabin camera is missing.");
        view.transform.SetParent(eye,false); view.transform.localPosition=Vector3.zero; view.transform.localRotation=Quaternion.identity; view.enabled=true;
        var listener=view.GetComponent<AudioListener>(); if(listener!=null) listener.enabled=true;
        foreach(var childCamera in view.GetComponentsInChildren<Camera>(true)) childCamera.enabled=true;
        ApplySeatVisibility(crew,slot%2==0?CabinSeat.Driver:CabinSeat.Passenger);
        foreach(var renderer in Cars[1-slot/2].Car.GetComponentsInChildren<Renderer>(true)) renderer.gameObject.layer=0;
        Cursor.lockState=CursorLockMode.Locked;
        foreach(var pad in Tablets) pad.Map.SetLocalSeat(slot%2==0?CabinSeat.Driver:CabinSeat.Passenger);
        Mod.Log.Msg($"RACE_SEAT slot={slot} crew={slot/2} navigator={slot%2==1}");
    }
    internal void ApplySeatVisibility(Crew crew,CabinSeat seat)
    {
        foreach(var old in hiddenHead)if(old.Renderer!=null)old.Renderer.enabled=old.Enabled;hiddenHead.Clear();
        var head=Head(seat==CabinSeat.Driver?crew.DriverEye:crew.NavigatorEye);
        foreach(var renderer in head.GetComponentsInChildren<Renderer>(true)) {hiddenHead.Add((renderer,renderer.enabled));renderer.enabled=false;}
        int hidden=CabinHeadLayers.LayerForSeat(seat);
        foreach(var camera in view!.GetComponentsInChildren<Camera>(true)) {
            camera.cullingMask|=(1<<CabinHeadLayers.DriverHead)|(1<<CabinHeadLayers.NavigatorHead);
            camera.cullingMask&=~(1<<hidden);
        }
        Mod.Log.Msg($"RACE_LOCAL_HEAD_CULL seat={seat} pieces={hiddenHead.Count}");
    }

    private void SampleInput()
    {
        int slot=RaceNetwork.LocalSlot; if(slot<0) return;
        var keyboard=Keyboard.current;
        var input=new InputState { Arrived=Time.realtimeSinceStartup };
        if(keyboard!=null)
        {
            input.Throttle=(keyboard.wKey.isPressed?1:0)-(keyboard.sKey.isPressed?1:0);
            input.Steer=(keyboard.dKey.isPressed?1:0)-(keyboard.aKey.isPressed?1:0);
            if(keyboard.spaceKey.isPressed) input.Buttons|=RaceProtocol.Buttons.Handbrake;
            if(keyboard.cKey.isPressed) input.Buttons|=RaceProtocol.Buttons.Wipe;
            var actions=RaceProtocol.Buttons.None;
            if(keyboard.eKey.wasPressedThisFrame) actions|=RaceProtocol.Buttons.Grab;
            if(keyboard.gKey.wasPressedThisFrame) actions|=RaceProtocol.Buttons.Door;
            if(actions!=0) { lastActions=actions; ActionSequence++; }
        }
        if(keyboard!=null && keyboard.escapeKey.wasPressedThisFrame) Cursor.lockState=Cursor.lockState==CursorLockMode.Locked?CursorLockMode.None:CursorLockMode.Locked;
        if(Cursor.lockState==CursorLockMode.Locked && Mouse.current!=null) {
            var delta=Mouse.current.delta.ReadValue();lookYaw=Math.Clamp(lookYaw+delta.x*.12f,-150,150);lookPitch=Math.Clamp(lookPitch-delta.y*.12f,-65,75);
        }
        input.Pitch=lookPitch;input.Yaw=lookYaw;
        input.Buttons|=lastActions; input.ActionSequence=ActionSequence; input.Sequence=++InputSequence;
        RaceVerification.BotInput(this,slot,ref input);
        if(RaceNetwork.Host) AcceptInput(slot,input); else Inputs[slot]=input;
    }

    private void SendInput()
    {
        int slot=RaceNetwork.LocalSlot; if(slot<0 || Epoch==0) return;
        var i=Inputs[slot]; using var w=RaceProtocol.Writer(RaceProtocol.Kind.Input);
        w.Write(Epoch); w.Write(i.Sequence); w.Write(i.ActionSequence); w.Write(i.Throttle);w.Write(i.Steer);w.Write(i.Pitch);w.Write(i.Yaw);w.Write((byte)i.Buttons);
        RaceNetwork.Send(RaceProtocol.Bytes(w));
    }
    internal void AcceptInput(int slot,InputState input)
    {
        if(!RaceProtocol.Newer(input.Sequence,Inputs[slot].Sequence)) return;
        bool action=RaceProtocol.Newer(input.ActionSequence,Inputs[slot].ActionSequence);
        input.Arrived=Time.realtimeSinceStartup; Inputs[slot]=input; InputPackets++;
        if(action && !Cars[slot/2].Dead && Cars[slot/2].Finish<0) {
            if(input.Buttons.HasFlag(RaceProtocol.Buttons.Grab)) TogglePad(slot,input.Pitch,input.Yaw);
            if(input.Buttons.HasFlag(RaceProtocol.Buttons.Door)) { var c=Cars[slot/2]; c.Open=false;c.DoorAngle=0;c.DoorVelocity=0; }
        }
    }

    internal void Receive(ulong sender,byte[] packet)
    {
        using var r=RaceProtocol.Reader(packet,out var kind);
        if(kind==RaceProtocol.Kind.Snapshot) { if(!RaceNetwork.Host && sender==0) ReadSnapshot(r); return; }
        if(!RaceNetwork.Host) return;
        int slot=RaceProtocol.Slot(RaceNetwork.Seats,sender); if(slot<0) return;
        if(r.ReadUInt32()!=Epoch) return;
        if(kind==RaceProtocol.Kind.Ready)
        { if(r.ReadString()==CourseSession.ContentId && r.ReadInt32()==CourseSession.CurrentSeed && Ready.Add(sender)) Mod.Log.Msg("RACE_READY slot="+slot); return; }
        if(kind!=RaceProtocol.Kind.Input) return;
        var i=new InputState {Sequence=r.ReadUInt32(),ActionSequence=r.ReadUInt32(),Throttle=r.ReadSingle(),Steer=r.ReadSingle(),Pitch=r.ReadSingle(),Yaw=r.ReadSingle(),Buttons=(RaceProtocol.Buttons)r.ReadByte()};
        if(!RaceProtocol.ValidInput(i.Throttle,i.Steer,i.Pitch,i.Yaw)) return;
        AcceptInput(slot,i);
    }

    private static void V(BinaryWriter w,Vector3 v) { w.Write(v.x);w.Write(v.y);w.Write(v.z); }
    private static Vector3 V(BinaryReader r)=>new(r.ReadSingle(),r.ReadSingle(),r.ReadSingle());
    private static void Q(BinaryWriter w,Quaternion q) { w.Write(q.x);w.Write(q.y);w.Write(q.z);w.Write(q.w); }
    private static Quaternion Q(BinaryReader r)=>new(r.ReadSingle(),r.ReadSingle(),r.ReadSingle(),r.ReadSingle());
    private void SendSnapshot()
    {
        if(RaceNetwork.Seats.Length!=4) return;
        using var w=RaceProtocol.Writer(RaceProtocol.Kind.Snapshot);
        w.Write(Epoch);w.Write(++SnapshotSequence);w.Write(CourseSession.CurrentSeed); foreach(var seat in RaceNetwork.Seats) w.Write(seat);
        w.Write(Started);w.Write(Ended);w.Write(Disconnected);w.Write((byte)Ready.Count);w.Write(Elapsed);w.Write(Countdown);w.Write(Impacts);w.Write(Steals);w.Write(DoorEvents);w.Write(TreeDeaths);
        foreach(var input in Inputs) {w.Write(input.Pitch);w.Write(input.Yaw);w.Write(input.Throttle);w.Write(input.Steer);w.Write((byte)input.Buttons);}
        foreach(var c in Cars) { V(w,c.Body.position);Q(w,c.Body.rotation);V(w,c.Body.linearVelocity);w.Write(c.Open);w.Write(c.DoorAngle);w.Write(c.MudAmount);w.Write(c.Dead);w.Write(c.StoppedAt);w.Write(c.Finish);w.Write(c.Progress);w.Write(c.Jolt); Q(w,c.Car.bodyVisual.localRotation);Q(w,c.Car.steeringWheel.localRotation); }
        foreach(var p in Tablets) { w.Write(p.Holder);w.Write(p.Carrier);V(w,p.Body.position);Q(w,p.Body.rotation);V(w,p.Body.isKinematic?Vector3.zero:p.Body.linearVelocity); }
        RaceNetwork.Send(RaceProtocol.Bytes(w));
    }
    private void ReadSnapshot(BinaryReader r)
    {
        int previousImpacts=Impacts;
        uint epoch=r.ReadUInt32(),seq=r.ReadUInt32();
        if(epoch==Epoch && !RaceProtocol.Newer(seq,LastSnapshot)) return;
        if(r.ReadInt32()!=CourseSession.CurrentSeed) return;
        var seats=new ulong[4];for(int i=0;i<4;i++) seats[i]=r.ReadUInt64();
        if(seats.Distinct().Count()!=4 || seats[0]!=0) return;
        RaceNetwork.Seats=seats;Epoch=epoch;LastSnapshot=seq;lastSnapshotTime=Time.realtimeSinceStartup;SnapshotPackets++;
        Started=r.ReadBoolean();Ended=r.ReadBoolean();Disconnected=r.ReadBoolean();int ready=r.ReadByte();Ready.Clear();foreach(var id in seats.Take(ready))Ready.Add(id);
        Elapsed=r.ReadSingle();Countdown=r.ReadSingle();Impacts=r.ReadInt32();Steals=r.ReadInt32();DoorEvents=r.ReadInt32();TreeDeaths=r.ReadInt32();
        for(int i=0;i<4;i++) {var input=Inputs[i];input.Pitch=r.ReadSingle();input.Yaw=r.ReadSingle();input.Throttle=r.ReadSingle();input.Steer=r.ReadSingle();input.Buttons=(RaceProtocol.Buttons)r.ReadByte();Inputs[i]=input;}
        foreach(var c in Cars) { c.TargetPosition=V(r);c.TargetRotation=Q(r);c.Velocity=V(r);c.Open=r.ReadBoolean();c.DoorAngle=r.ReadSingle();c.MudAmount=r.ReadSingle();c.Dead=r.ReadBoolean();c.StoppedAt=r.ReadSingle();c.Finish=r.ReadSingle();c.Progress=r.ReadInt32();c.Jolt=r.ReadSingle();c.Car.bodyVisual.localRotation=Q(r);c.Car.steeringWheel.localRotation=Q(r); }
        foreach(var p in Tablets) { p.Holder=r.ReadInt32();p.Carrier=r.ReadInt32();p.TargetPosition=V(r);p.TargetRotation=Q(r);p.Velocity=V(r); }
        for(int i=0;i<2;i++) {Cars[i].Car._throttleInput=Inputs[i*2].Throttle;Cars[i].Car._steerInput=Inputs[i*2].Steer;}
        if(Impacts>previousImpacts)foreach(var c in Cars)c.Car.GetComponent<CarCrash>().PlayImpact();
    }

    private void UpdatePad(Pad pad)
    {
        var c=Cars[pad.Carrier];
        pad.Native.car=c.Car.transform;pad.Native._carBody=c.Body;
        pad.Native.driverAnchor=c.DriverLap;pad.Native.passengerAnchor=c.NavigatorLap;
        pad.Map.car=c.Car.transform;
        if(pad.Holder>=0)
        {
            var anchor=pad.Holder%2==0?c.DriverLap:c.NavigatorLap;
            pad.Body.isKinematic=true; foreach(var collider in pad.Colliders) collider.enabled=false;
            pad.Body.position=anchor.position;pad.Body.rotation=anchor.rotation;pad.InCabin=true;
        }
        else
        {
            foreach(var collider in pad.Colliders) collider.enabled=true;
            pad.Body.isKinematic=!RaceNetwork.Host;
            if(!RaceNetwork.Host) { pad.Body.position=Vector3.Lerp(pad.Body.position,pad.TargetPosition,Math.Clamp(Time.deltaTime*20,0,1));pad.Body.rotation=pad.TargetRotation; }
            else if(pad.InCabin)
            {
                var local=c.Car.transform.InverseTransformPoint(pad.Body.position);var center=pad.Native.cabinCenterLocal;var ext=pad.Native.cabinExtentsLocal;
                if(c.Open && c.DoorAngle>30)
                {
                    float side=Math.Sign(c.Car.transform.InverseTransformPoint(c.NavigatorLap.position).x);
                    pad.Body.AddForce((c.Car.transform.right*side*7+c.Car.transform.up*2)*Time.deltaTime,ForceMode.VelocityChange);
                    if(Math.Abs(local.x-center.x)>ext.x || Math.Abs(local.z-center.z)>ext.z) pad.InCabin=false;
                }
                else {
                    local.x=Math.Clamp(local.x,center.x-ext.x,center.x+ext.x);local.y=Math.Clamp(local.y,center.y-ext.y,center.y+ext.y);local.z=Math.Clamp(local.z,center.z-ext.z,center.z+ext.z);
                    pad.Body.position=c.Car.transform.TransformPoint(local);
                }
            }
        }
    }

    internal bool TogglePad(int slot,float pitch,float yaw)
    {
        var own=Tablets.FirstOrDefault(p=>p.Holder==slot);
        if(own!=null) { Drop(own);return true; }
        var crew=Cars[slot/2];var eye=slot%2==0?crew.DriverEye:crew.NavigatorEye;
        var aim=crew.Body.rotation*Quaternion.Euler(pitch,yaw,0)*Vector3.forward;
        var candidate=Tablets.Where(p=>p.Holder<0 && (p.Carrier==slot/2 || !p.InCabin || Cars[p.Carrier].Open && Cars[p.Carrier].DoorAngle>30))
            .Where(p=>Vector3.Distance(eye.position,p.Body.position)<3 && Vector3.Dot(aim,(p.Body.position-eye.position).normalized)>.35f)
            .OrderBy(p=>Vector3.Distance(eye.position,p.Body.position)).FirstOrDefault();
        if(candidate==null) return false;
        bool stolen=candidate.Carrier!=slot/2;candidate.Holder=slot;candidate.Carrier=slot/2;candidate.InCabin=true;
        if(stolen) { Steals++;Mod.Log.Msg("RACE_TABLET_STOLEN slot="+slot); }
        return true;
    }
    internal void Drop(Pad pad)
    {
        var c=Cars[pad.Carrier];pad.Native.car=c.Car.transform;pad.Native._carBody=c.Body;
        pad.Native.ForceDrop();pad.Native.enabled=false;
        pad.Holder=-1;pad.Body.isKinematic=false;pad.Body.constraints=RigidbodyConstraints.None;pad.Body.WakeUp();pad.Body.linearVelocity=c.Body.GetPointVelocity(pad.Body.position);
        if(c.Open) pad.Body.linearVelocity+=c.Car.transform.right*Math.Sign(c.Car.transform.InverseTransformPoint(c.NavigatorLap.position).x)*2.5f+c.Car.transform.up*3.5f;
    }
    internal void OpenDoor(int team)
    {
        var c=Cars[team];if(c.Open) return;c.Open=true;c.DoorAngle=10;c.DoorVelocity=100;DoorEvents++;
        Mod.Log.Msg("RACE_DOOR_OPEN crew="+team);
        foreach(var p in Tablets.Where(p=>p.Carrier==team && p.Holder<0))
            p.Body.linearVelocity=c.Body.GetPointVelocity(p.Body.position)+c.Car.transform.right*Math.Sign(c.Car.transform.InverseTransformPoint(c.NavigatorLap.position).x)*2.5f+c.Car.transform.up*3.5f;
    }

    internal int Team(Component component)
    {
        for(int i=0;i<2;i++) if(component.transform.IsChildOf(Cars[i].Car.transform)) return i;
        return -1;
    }
    internal void Collision(int team,Collision collision)
    {
        if(!RaceNetwork.Host || !Started || Cars[team].Dead) return;
        var header=collision.m_Header;
        float relative=(header.m_ThisBodyLinearVelocity-header.m_OtherBodyLinearVelocity).magnitude;
        int other=Team(collision.collider);
        if(other>=0 && other!=team)
        {
            if(relative<.5f||Time.realtimeSinceStartup<nextImpact) return;nextImpact=Time.realtimeSinceStartup+.15f;Impacts++;
            foreach(var c in Cars) { c.Jolt=Math.Clamp(relative*.12f,.1f,1);c.Car.GetComponent<CarCrash>().PlayImpact(); }
            Mod.Log.Msg("RACE_CAR_IMPACT relative="+relative);return;
        }
        bool tree=StageHazards.Active!.Trees.Any(c=>c.Pointer==collision.collider.Pointer) || collision.collider.GetComponentInParent<BreakableTree>()!=null;
        var crash=Cars[team].Car.GetComponent<CarCrash>();
        if(tree && Math.Max(crash._speedBefore,relative*3.6f)>=crash.hardHitKmh) MarkTreeDeath(team);
    }
    internal void MarkTreeDeath(int team)
    {
        var c=Cars[team];if(c.Dead)return;c.Dead=true;c.StoppedAt=Elapsed;c.Jolt=1;TreeDeaths++;
        c.Car.SetGridHold(true);c.Car.enabled=false;c.Body.linearVelocity=Vector3.zero;c.Body.isKinematic=true;
        Mod.Log.Msg("RACE_TREE_DNF crew="+team);
    }
    private void CheckProgress(int team)
    {
        var c=Cars[team];var position=c.Body.position;
        int nearest=0;float best=float.MaxValue;
        for(int i=0;i<Path.Count;i+=3) { float d=(Path[i]-position).sqrMagnitude;if(d<best) {best=d;nearest=i;} }
        c.Progress=Math.Max(c.Progress,nearest);
        int finishIndex=Path.Count-9;var forward=StageBuilder.Direction(Path,finishIndex);
        float before=Vector3.Dot(c.LastPosition-Path[finishIndex],forward),after=Vector3.Dot(position-Path[finishIndex],forward);
        var side=Vector3.Cross(Vector3.up,forward);
        if(Started && Elapsed>Controller.minFinishSeconds && c.Progress>Path.Count-60 && before<0 && after>=0 && Math.Abs(Vector3.Dot(position-Path[finishIndex],side))<RoadWidth*.5f && Math.Abs(position.y-Path[finishIndex].y)<3)
        { c.Finish=Elapsed;c.Car.SetGridHold(true);c.Body.linearVelocity=Vector3.zero;c.Body.isKinematic=true;Mod.Log.Msg($"RACE_FINISH crew={team} seconds={c.Finish}"); }
        c.LastPosition=position;
    }
    internal void LateUpdate()
    {
        if(Controller==null||Cars.Any(c=>c.DriverEye==null||c.NavigatorEye==null))return;
        for(int i=0;i<2;i++) {
            var c=Cars[i];NetworkCarBridge.ApplyHeadLook(Head(c.DriverEye),c.DriverRest,Inputs[i*2].Pitch,Inputs[i*2].Yaw);
            NetworkCarBridge.ApplyHeadLook(Head(c.NavigatorEye),c.NavigatorRest,Inputs[i*2+1].Pitch,Inputs[i*2+1].Yaw);
        }
        if(view==null)return;
        view.transform.localPosition-=lastShake;
        float j=Cars[RaceNetwork.LocalTeam].Jolt;
        lastShake=new Vector3(MathF.Sin(Time.time*47),MathF.Cos(Time.time*39),-MathF.Abs(MathF.Sin(Time.time*29)))*(.08f*j);
        view.transform.localPosition+=lastShake;
    }
    internal void Gui()
    {
        int slot=RaceNetwork.LocalSlot;
        var winner=Cars.Select((c,i)=>(c,i)).Where(x=>x.c.Finish>=0).OrderBy(x=>x.c.Finish).FirstOrDefault();
        var status=Disconnected?"PLAYER DISCONNECTED / RETURN TO LOBBY":!Started?(Countdown<0?$"WAITING FOR FOUR SEATS ({Ready.Count}/4)":$"START IN {Math.Ceiling(Countdown)}"):Ended?(winner.c==null?"BOTH CREWS DNF":$"WINNER: CREW {(winner.i==0?"A":"B")}"):$"RACE {Elapsed:F1}s";
        string CrewLine(int i) => $"CREW {(i==0?"A":"B")}: "+(Cars[i].Dead?"DNF / TREE":Cars[i].Finish>=0?$"FINISHED {Cars[i].Finish:F2}s":$"{Math.Min(100,Cars[i].Progress*100/Path.Count)}%");
        GUI.Box(new Rect(16,16,520,122),$"{status}\n{CrewLine(0)}     {CrewLine(1)}\nYOU: crew {(slot/2==0?"A":"B")} {(slot%2==0?"DRIVER":"NAVIGATOR")}\nE grab/drop tablet | G close door | hold C wipe | F8 host retry");
        if(RaceNetwork.Host&&GUI.Button(new Rect(16,145,170,28),"RETURN TO LOBBY"))NetSession.Instance.BackToMenu();
    }

    [HarmonyPatch(typeof(GoofyCarController),"ReadInput")]
    private static class CarInputPatch
    {
        static bool Prefix(GoofyCarController __instance)
        {
            var r=Active;if(r==null)return true;int team=r.Team(__instance);if(team<0)return true;
            var i=r.Inputs[team*2];bool drive=RaceNetwork.Host&&r.Started&&!r.Cars[team].Dead&&r.Cars[team].Finish<0&&Time.realtimeSinceStartup-i.Arrived<.5f;
            __instance._throttleInput=drive?i.Throttle:0;__instance._steerInput=drive?i.Steer:0;__instance._handbrakeHeld=drive&&i.Buttons.HasFlag(RaceProtocol.Buttons.Handbrake);return false;
        }
    }
    [HarmonyPatch(typeof(GoofyCarController),"get_SpeedKmh")]
    private static class RemoteSpeedPatch {static bool Prefix(GoofyCarController __instance,ref float __result){var r=Active;if(r==null||RaceNetwork.Host)return true;int team=r.Team(__instance);if(team<0)return true;__result=r.Cars[team].Velocity.magnitude*3.6f;return false;}}
    [HarmonyPatch(typeof(CabinOccupantBinder),"Awake")]
    private static class CloneBinderPatch {static bool Prefix(CabinOccupantBinder __instance)=>!RaceNetwork.Enabled||!__instance.transform.root.name.StartsWith("RRR_Car_B");}
    private static Pad? PadFor(CabinHoldable native)=>Active?.Tablets.FirstOrDefault(p=>p.Native.Pointer==native.Pointer);
    private struct TimerState {internal bool Applied;internal float Time;internal byte Digit;}
    [HarmonyPatch(typeof(TabletMinimap),"LateUpdate")]
    private static class MapPatch
    {
        static bool Prefix(TabletMinimap __instance)
        {
            var r=Active;if(r==null||r.Controller==null||!r.Tablets.Any(p=>p.Map.Pointer==__instance.Pointer))return true;
            var seat=RaceCapture.SeatOverride??(RaceNetwork.Navigator?CabinSeat.Passenger:CabinSeat.Driver);
            __instance._driverPrivacy=seat==CabinSeat.Driver;__instance.ApplyPrivacy();__instance.FollowCar();__instance.UpdateTimerHud();
            if(__instance._mapCam!=null) {
                // The second native rig hides its layer from every existing camera,
                // including crew A's map camera. Restore each map-only mask.
                __instance._mapCam.cullingMask=1<<__instance._minimapLayer;
                __instance._mapCam.enabled=false;
                if(seat==CabinSeat.Passenger && SystemInfo.graphicsDeviceType!=UnityEngine.Rendering.GraphicsDeviceType.Null &&
                    (!r.nextMapFrame.TryGetValue(__instance.Pointer,out float next)||Time.realtimeSinceStartup>=next)) {
                    r.nextMapFrame[__instance.Pointer]=Time.realtimeSinceStartup+.04f;__instance._mapCam.Render();
                }
            }
            return false;
        }
    }
    [HarmonyPatch(typeof(TabletMinimap),"UpdateTimerHud")]
    private static class TimerPatch
    {
        static void Prefix(TabletMinimap __instance,out TimerState __state)
        {
            __state=default;var r=Active;if(r==null||r.Controller==null)return;var pad=r.Tablets.FirstOrDefault(p=>p.Map.Pointer==__instance.Pointer);if(pad==null)return;
            __state=new TimerState {Applied=true,Time=r.Controller._runTime,Digit=r.Controller._countdownDigit};
            var c=r.Cars[pad.Carrier];__instance._stage=r.Controller;__instance._carBridge=null;
            r.Controller._runTime=c.Dead?c.StoppedAt:c.Finish>=0?c.Finish:r.Elapsed;
            if(c.Dead)r.Controller._countdownDigit=StageController.CrashedDigit;else if(c.Finish>=0)r.Controller._countdownDigit=StageController.FinishedDigit;
        }
        static void Postfix(TimerState __state){if(__state.Applied&&Active!=null){Active.Controller._runTime=__state.Time;Active.Controller._countdownDigit=__state.Digit;}}
    }
    [HarmonyPatch(typeof(CabinHoldable),"FixedUpdate")]
    private static class PadFixedPatch {static bool Prefix(CabinHoldable __instance)=>PadFor(__instance)==null;}
    [HarmonyPatch(typeof(CabinHoldable),"LateUpdate")]
    private static class PadLatePatch {static bool Prefix(CabinHoldable __instance)=>PadFor(__instance)==null;}
    [HarmonyPatch(typeof(CabinHoldable),"get_IsHeldNow")]
    private static class PadHeldNowPatch {static bool Prefix(CabinHoldable __instance,ref bool __result){var p=PadFor(__instance);if(p==null)return true;__result=p.Holder>=0;return false;}}
    [HarmonyPatch(typeof(CabinHoldable),"get_HeldBy")]
    private static class PadHolderPatch {static bool Prefix(CabinHoldable __instance,ref CabinSeat __result){var p=PadFor(__instance);if(p==null)return true;__result=p.Holder%2==1?CabinSeat.Passenger:CabinSeat.Driver;return false;}}
    [HarmonyPatch(typeof(NavigatorTabletHandIk),"LateUpdate")]
    private static class HandsPatch
    {
        static bool Prefix(NavigatorTabletHandIk __instance)
        {
            var r=Active;if(r==null)return true;int team=r.Team(__instance);if(team<0)return true;
            var pad=r.Tablets.FirstOrDefault(p=>p.Holder==team*2+1);
            if(pad==null) {
                if(__instance._idleCaptured) {
                    NavigatorTabletHandIk.RestoreRestPose(__instance.leftShoulder,__instance.leftUpperArm,__instance.leftLowerArm,__instance.leftWrist,__instance._idleL);
                    NavigatorTabletHandIk.RestoreRestPose(__instance.rightShoulder,__instance.rightUpperArm,__instance.rightLowerArm,__instance.rightWrist,__instance._idleR);
                }
                return false;
            }
            if(__instance.tablet==null||__instance.tablet.Pointer!=pad.Native.Pointer) {__instance.tablet=pad.Native;__instance.ResolveGrips();}
            return true;
        }
    }
    [HarmonyPatch(typeof(CarCrash),"OnCollisionEnter")]
    private static class CrashPatch { static bool Prefix(CarCrash __instance,Collision collision) { var r=Active;if(r==null)return true;int team=r.Team(__instance);if(team<0)return true;r.Collision(team,collision);return false;} }
    [HarmonyPatch(typeof(StageController),"Update")]
    private static class StageUpdatePatch { static bool Prefix()=>!RaceNetwork.Enabled; }
    [HarmonyPatch(typeof(StageController),"NotifyFinished")]
    private static class FinishPatch { static bool Prefix()=>!RaceNetwork.Enabled; }
    [HarmonyPatch(typeof(StageController),"NotifyCrashed")]
    private static class DeathPatch { static bool Prefix()=>!RaceNetwork.Enabled; }
    [HarmonyPatch(typeof(NetworkCarBridge),"FixedUpdate")]
    private static class BridgeFixedPatch { static bool Prefix()=>!RaceNetwork.Enabled; }
    [HarmonyPatch(typeof(NetworkCarBridge),"Update")]
    private static class BridgeUpdatePatch { static bool Prefix()=>!RaceNetwork.Enabled; }
    [HarmonyPatch(typeof(NetworkCarBridge),"LateUpdate")]
    private static class BridgeLatePatch { static bool Prefix()=>!RaceNetwork.Enabled; }
    [HarmonyPatch(typeof(NetworkCarBridge),"OnNetworkSpawn")]
    private static class BridgeSpawnPatch { static bool Prefix()=>!RaceNetwork.Enabled; }
    [HarmonyPatch(typeof(MudDepositTrigger),"OnTriggerEnter")]
    private static class MudPatch
    {
        static bool Prefix(MudDepositTrigger __instance,Collider other)
        { var r=Active;if(r==null)return true;if(!RaceNetwork.Host)return false;int team=r.Team(other);if(team<0)return false;
            var key=(__instance.Pointer,team);
            if(r.Started && (!r.mudReady.TryGetValue(key,out float until)||Time.time>=until)) {r.Cars[team].MudAmount=Math.Clamp(r.Cars[team].MudAmount+__instance.amount,0,1);r.mudReady[key]=Time.time+__instance.cooldown;}return false; }
    }
}
