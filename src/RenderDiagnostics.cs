using UnityEngine;

namespace RightRightRight;

// Explicit local diagnostics only; no capture or gameplay mutation.
internal static class RenderDiagnostics
{
    private static readonly bool Enabled=Environment.GetCommandLineArgs().Contains("--rrr-render-diagnostics");
    private static float next;
    private static int repaints;

    internal static void Tick()
    {
        if(!Enabled||Time.realtimeSinceStartup<next)return;
        next=Time.realtimeSinceStartup+2;
        Mod.Log.Msg($"RENDER_HEARTBEAT frame={Time.frameCount} repaint={repaints} size={Screen.width}x{Screen.height} focused={Application.isFocused} backend={SystemInfo.graphicsDeviceType}");
    }

    internal static void Gui()
    {
        if(Enabled&&Event.current!=null&&Event.current.type==EventType.Repaint)repaints++;
    }
}
