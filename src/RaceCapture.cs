using MelonLoader;
using Il2Cpp;
using UnityEngine;
using Object=UnityEngine.Object;
using Il2CppInterop.Runtime;
using Il2CppInterop.Runtime.InteropTypes.Arrays;
using System.Reflection;

namespace RightRightRight;

// Explicit developer-only capture through Unity's renderer; no desktop input.
internal static class RaceCapture
{
    internal static CabinSeat? SeatOverride;
    private static unsafe byte[] Encode(Texture2D pixels)
    {
        ImageConversion.EncodeToPNG_Injected(Object.MarshalledUnityObject.Marshal(pixels),out var blob);
        // The generated generic wrapper constructs abstract Il2CppArrayBase<byte>.
        // Invoke its native unmarshal, then wrap the result with the concrete type.
        var store=typeof(UnityEngine.Bindings.BlittableArrayWrapper).GetNestedTypes(BindingFlags.NonPublic)
            .First(t=>t.Name.StartsWith("MethodInfoStoreGeneric_Unmarshal_")).MakeGenericType(typeof(byte));
        var method=(IntPtr)store.GetField("Pointer",BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic)!.GetValue(null)!;
        IntPtr result=IntPtr.Zero,error=IntPtr.Zero;IntPtr* args=stackalloc IntPtr[1];args[0]=(IntPtr)(&result);
        IL2CPP.il2cpp_runtime_invoke(method,(IntPtr)(&blob),(void**)args,ref error);
        Il2CppInterop.Runtime.Il2CppException.RaiseExceptionIfNecessary(error);
        return new Il2CppStructArray<byte>(result).ToArray();
    }
    private static void Save(Camera camera,string filename)
    {
        var target=new RenderTexture(960,540,24,RenderTextureFormat.ARGB32);
        var before=camera.targetTexture;var active=RenderTexture.active;
        var pixels=new Texture2D(960,540,TextureFormat.RGBA32,false);
        try {
            camera.targetTexture=target;camera.Render();RenderTexture.active=target;
            pixels.ReadPixels(new Rect(0,0,960,540),0,0);pixels.Apply();
            File.WriteAllBytes(filename,Encode(pixels));
        }
        finally {camera.targetTexture=before;RenderTexture.active=active;Object.Destroy(pixels);target.Release();Object.Destroy(target);}
    }
    internal static void Start(RaceRuntime race)
    {
        string folder=RaceNetwork.Arg("--rrr-capture-dir=");
        if(folder.Length>0)MelonCoroutines.Start(Capture(race,folder));
    }
    private static System.Collections.IEnumerator Capture(RaceRuntime race,string folder)
    {
        Directory.CreateDirectory(folder);yield return new WaitForSecondsRealtime(2);
        var camera=race.View;if(camera==null)throw new InvalidDataException("Capture camera missing.");
        yield return new WaitForEndOfFrame();Save(camera,System.IO.Path.Combine(folder,"driver.png"));
        yield return new WaitForSecondsRealtime(1);
        var layers=race.Cars.SelectMany(c=>c.Car.GetComponentsInChildren<Renderer>(true)).Select(r=>(Object:r.gameObject,Layer:r.gameObject.layer)).ToArray();
        foreach(var layer in layers)layer.Object.layer=0;
        var position=(race.Cars[0].Body.position+race.Cars[1].Body.position)*.5f;
        var forward=race.Cars[0].Car.transform.forward;
        camera.transform.SetParent(null,true);
        camera.transform.SetPositionAndRotation(position+forward*10+Vector3.up*4.5f,Quaternion.LookRotation(-forward*10-Vector3.up*3.5f));
        camera.cullingMask=~(1<<LayerMask.NameToLayer(TabletMinimap.MinimapLayerName));
        foreach(var child in camera.GetComponentsInChildren<Camera>(true))if(child.Pointer!=camera.Pointer)child.enabled=false;
        yield return new WaitForSecondsRealtime(.5f);yield return new WaitForEndOfFrame();
        Save(camera,System.IO.Path.Combine(folder,"two-cars.png"));
        yield return new WaitForSecondsRealtime(1);
        foreach(var layer in layers)layer.Object.layer=layer.Layer;
        camera.transform.SetParent(race.Cars[0].NavigatorEye,false);camera.transform.localPosition=Vector3.zero;camera.transform.localRotation=Quaternion.Euler(35,0,0);
        foreach(var child in camera.GetComponentsInChildren<Camera>(true))child.enabled=true;
        race.ApplySeatVisibility(race.Cars[0],CabinSeat.Passenger);
        SeatOverride=CabinSeat.Passenger;
        foreach(var pad in race.Tablets)pad.Map.SetLocalSeat(CabinSeat.Passenger);
        yield return new WaitForSecondsRealtime(.5f);yield return new WaitForEndOfFrame();
        foreach(var pad in race.Tablets) {
            var m=pad.Map;
            Mod.Log.Msg($"RACE_MAP_DIAGNOSTIC carrier={pad.Carrier} privacy={m._driverPrivacy} screenOn={m.screenRenderer?.enabled} mat={m.screenRenderer?.sharedMaterial?.name} texture={m.screenRenderer?.sharedMaterial?.mainTexture?.name} expected={m._rt?.GetInstanceID()} actual={m.screenRenderer?.sharedMaterial?.mainTexture?.GetInstanceID()} camMask={m._mapCam?.cullingMask} ribbon={m._roadRibbon?.vertexCount} timer={m._timerText?.text}");
            if(m._mapCam!=null)Save(m._mapCam,System.IO.Path.Combine(folder,$"map-{pad.Carrier}.png"));
        }
        Save(camera,System.IO.Path.Combine(folder,"navigator.png"));
        yield return new WaitForSecondsRealtime(1);
        Mod.Log.Msg("RACE_CAPTURE_COMPLETE "+folder);Application.Quit(0);
    }
}
