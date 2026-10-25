using Microsoft.Win32;
using System.Text.RegularExpressions;

namespace RightRightRight.Setup;

internal static class GameFinder
{
    public static bool Valid(string folder) => new[] { "LeftLeftLEFT.exe", "GameAssembly.dll", "LeftLeftLEFT_Data/level3" }.All(f => File.Exists(Path.Combine(folder, f)));
    public static string? Find()
    {
        if (!OperatingSystem.IsWindows()) return null;
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var registry in new[] { Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam"), Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Valve\Steam") })
        {
            using (registry)
            {
                var value = registry?.GetValue("SteamPath") ?? registry?.GetValue("InstallPath");
                if (value is string path) roots.Add(path);
            }
        }
        roots.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam"));
        var libraries = new HashSet<string>(roots, StringComparer.OrdinalIgnoreCase);
        foreach (var root in roots)
        {
            var file = Path.Combine(root, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(file)) continue;
            foreach (Match match in Regex.Matches(File.ReadAllText(file), "\"path\"\\s*\"([^\"]+)\""))
                libraries.Add(match.Groups[1].Value.Replace(@"\\", @"\"));
        }
        foreach (var library in libraries)
        {
            string name = "Left! Left! LEFT! Playtest";
            var manifest = Path.Combine(library, "steamapps", "appmanifest_5425110.acf");
            if (File.Exists(manifest))
            {
                var match = Regex.Match(File.ReadAllText(manifest), "\"installdir\"\\s*\"([^\"]+)\"");
                if (match.Success && Path.GetFileName(match.Groups[1].Value) == match.Groups[1].Value) name = match.Groups[1].Value;
            }
            var game = Path.Combine(library, "steamapps", "common", name);
            if (Valid(game)) return Path.GetFullPath(game);
        }
        return null;
    }
}
