using HarmonyLib;
using Il2Cpp;
using Il2CppSteamworks;
using MelonLoader;
using MelonLoader.Utils;
using RightRightRight.Distribution;

namespace RightRightRight;

// Optional portable distribution identity. Existing playtest-based installations
// have no configuration file and retain their original startup behavior.
internal static class SteamDistribution
{
    internal static DistributionConfig? Config;
    private static bool HasManifest()=>File.Exists(Path.Combine(Directory.GetParent(MelonEnvironment.UserDataDirectory)!.FullName,DistributionConfig.FileName));

    internal static void Initialize()
    {
        string root=Directory.GetParent(MelonEnvironment.UserDataDirectory)!.FullName;
        string path=Path.Combine(root,DistributionConfig.FileName);
        if(!File.Exists(path))return;
        Config=DistributionConfig.Read(path);
        if(!RaceNetwork.Lan&&!Config.Direct) Config.RequireAppId();
        Mod.Log.Msg($"PORTABLE_IDENTITY state={Config.State}; app={Config.SteamAppId}; no Steam installation lookup");
    }

    [HarmonyPatch(typeof(SteamClient),nameof(SteamClient.Init))]
    private static class InitPatch
    {
        static bool Prepare()=>HasManifest();
        static void Prefix(ref uint appid) {if(Config!=null)appid=Config.RequireAppId();}
        static void Postfix() {
            if(Config!=null && SteamClient.IsValid && SteamClient.AppId.Value!=Config.RequireAppId())
                throw new InvalidOperationException("Steam initialized with the wrong application identity.");
        }
    }

    [HarmonyPatch(typeof(SteamClient),nameof(SteamClient.RestartAppIfNecessary))]
    private static class RestartPatch
    {
        static bool Prepare()=>HasManifest();
        static void Prefix(ref uint appid) {if(Config!=null)appid=Config.RequireAppId();}
    }

    [HarmonyPatch(typeof(SteamLobby),"TryInitSteam")]
    private static class LocalVerificationPatch
    {
        static bool Prepare()=>HasManifest();
        static bool Prefix(ref string error,ref bool __result)
        {
            if(Config==null||!RaceNetwork.LocalTransport)return true;
            error="Portable local-transport verification: Steam is not initialized.";
            __result=false;return false;
        }
        static void Postfix(ref string error,ref bool __result)
        {
            if(Config==null||RaceNetwork.LocalTransport||SteamClient.IsValid)return;
            __result=false;
            error="Steam could not initialize Right Right Right. Keep Steam running and ensure this account has access to the configured application.";
        }
    }
}
