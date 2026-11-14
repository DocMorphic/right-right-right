using UnityEngine;

namespace RightRightRight;

internal static class GuiFonts
{
    private static Font? font;
    private static GUISkin? skin;
    private static bool failed;

    internal static void Apply()
    {
        if (failed) return;
        try
        {
            if (font == null)
            {
                // This font includes its actual TTF data in resources.assets.
                // Unity's default LegacyRuntime placeholder has no usable data
                // under Wine, even when its legacy HasCharacter check succeeds.
                font = Resources.FindObjectsOfTypeAll<Font>().FirstOrDefault(f => f.name == "LiberationSans");
                if (font == null || !font.HasCharacter('A'))
                    throw new InvalidDataException("The embedded UI font is unavailable.");
                UnityEngine.Object.DontDestroyOnLoad(font);
                Mod.Log.Msg("UI_FONT_PASS: embedded LiberationSans loaded; system fonts are not required.");
            }
            var current = GUI.skin;
            if (skin == current && current.font == font) return;
            current.font = font;
            foreach (var style in new[] { current.box, current.label, current.button, current.toggle,
                current.window, current.textField, current.textArea }) style.font = font;
            foreach (var style in current.customStyles) style.font = font;
            skin = current;
        }
        catch (Exception error)
        {
            failed = true;
            Mod.Log.Error("Could not load the embedded UI font: " + error.Message);
        }
    }
}
