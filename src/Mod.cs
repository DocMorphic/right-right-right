using HarmonyLib;
using MelonLoader;
using MelonLoader.Utils;
using Il2Cpp;
using Il2CppTMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using Object = UnityEngine.Object;

[assembly: MelonInfo(typeof(RightRightRight.Mod), "Right, Right, Right", "0.1.0", "DocMorphic")]
[assembly: MelonGame("Stellux Interactive", "LeftLeftLEFT")]

namespace RightRightRight;

public sealed class Mod : MelonMod
{
    internal static StageDefinition[] Stages = Array.Empty<StageDefinition>();
    internal static MelonLogger.Instance Log = null!;
    public override void OnInitializeMelon()
    {
        Log = LoggerInstance;
        Stages = StageDefinition.Read(Path.Combine(MelonEnvironment.UserDataDirectory, "RightRightRight", "stages.json"));
        Log.Msg($"Loaded {Stages.Length} additional stage definitions.");
    }

    [HarmonyPatch(typeof(MainMenu), "Start")]
    private static class MenuPatch
    {
        static void Prefix(MainMenu __instance)
        {
            try
            {
                var template = __instance.maps[0].button;
                foreach (var stage in Stages)
                {
                    var go = Object.Instantiate(template.gameObject, template.transform.parent);
                    go.name = stage.Scene;
                    var button = go.GetComponent<Button>();
                    button.onClick.RemoveAllListeners();
                    __instance.maps.Add(new MainMenu.MapEntry { displayName = stage.Name, sceneName = stage.Scene, button = button });
                }
                for (int i = 0; i < __instance.maps.Count; i++)
                {
                    var entry = __instance.maps[i];
                    var layout = entry.button.GetComponent<LayoutElement>();
                    layout.minHeight = 64; layout.preferredHeight = 64;
                    var labels = entry.button.GetComponentsInChildren<TMP_Text>(true);
                    foreach (var label in labels)
                    {
                        var rect = label.GetComponent<RectTransform>();
                        rect.anchorMin = new Vector2(0, 0); rect.anchorMax = new Vector2(1, 1);
                        rect.anchoredPosition = new Vector2(10, 0); rect.sizeDelta = new Vector2(-40, -10);
                        label.enableAutoSizing = true; label.fontSize = 24; label.fontSizeMin = 16; label.fontSizeMax = 24;
                        if (label.gameObject.name != "Label") label.gameObject.SetActive(false);
                        else { label.text = entry.displayName; label.alignment = TextAlignmentOptions.MidlineLeft; label.margin = Vector4.zero; }
                    }
                    var thumb = entry.button.transform.Find("Thumb");
                    if (thumb != null) thumb.gameObject.SetActive(false);
                    var cursor = entry.button.transform.Find("Cursor");
                    if (cursor != null) cursor.gameObject.SetActive(false);
                }
                foreach (var label in Object.FindObjectsOfType<TMP_Text>(true))
                    if (label.text.Contains("Left! Left! LEFT!"))
                    {
                        label.text = label.text.Replace("Left! Left! LEFT!", "Right! Right! RIGHT!");
                        label.fontSize *= .72f;
                    }
                    else if (label.text == "PICK A STAGE") label.text = "PICK A STAGE / SCROLL";
                Log.Msg($"Stage menu contains {__instance.maps.Count} stages.");
            }
            catch (Exception ex) { Log.Error($"Menu setup failed: {ex}"); }
        }
    }

    [HarmonyPatch(typeof(StageController), "Awake")]
    private static class StagePatch
    {
        static void Prefix(StageController __instance)
        {
            var name = SceneManager.GetActiveScene().name;
            var stage = Stages.FirstOrDefault(s => s.Scene == name);
            if (stage == null) return;
            try { StageBuilder.Build(stage, __instance); }
            catch (Exception ex)
            {
                Log.Error($"Stage {name} failed: {ex}");
                if (Environment.GetCommandLineArgs().Contains("--rrr-verify")) Application.Quit(2);
            }
        }
    }

    public override void OnSceneWasInitialized(int buildIndex, string sceneName)
    {
        var args = Environment.GetCommandLineArgs();
        var target = args.FirstOrDefault(a => a.StartsWith("--rrr-stage="))?.Split('=')[1];
        if (sceneName == "Menu" && target != null)
        {
            Log.Msg($"Test launch: {target}");
            MelonCoroutines.Start(LaunchTest(target));
        }
    }

    private static System.Collections.IEnumerator LaunchTest(string target)
    {
        yield return new WaitForSeconds(3);
        NetSession.Ensure().LoadMap(target);
    }
}
