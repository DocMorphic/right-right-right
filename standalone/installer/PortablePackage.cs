using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;

namespace RightRightRight.Setup;

public static class PortablePackage
{
    public static string SafePath(string root, string relative)
    {
        relative = relative.Replace('\\', '/');
        var parts = relative.Split('/');
        if (string.IsNullOrWhiteSpace(relative) || relative.StartsWith('/') ||
            parts.Any(p => p is "" or "." or ".." || p.Contains(':') || p.Contains('\0')))
            throw new InvalidDataException("Invalid package path.");
        root = Path.GetFullPath(root);
        string target = Path.GetFullPath(Path.Combine(root, Path.Combine(parts)));
        if (!target.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Package path escapes its destination.");
        return target;
    }

    public static void Extract(Stream source, string destination, Action<int>? progress = null, CancellationToken cancel = default)
    {
        if (Directory.Exists(destination)) throw new IOException("Extraction destination already exists.");
        using var zip = new ZipArchive(source, ZipArchiveMode.Read, leaveOpen: true);
        // Validate the complete directory before writing even the first entry.
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in zip.Entries)
        {
            string name = entry.FullName.Replace('\\', '/');
            if (!name.StartsWith("RightRightRight/", StringComparison.Ordinal) ||
                ((entry.ExternalAttributes >> 16) & 0xf000) == 0xa000)
                throw new InvalidDataException("Unexpected archive layout or symbolic link.");
            name = name["RightRightRight/".Length..].TrimEnd('/');
            if (name.Length == 0) continue;
            SafePath(destination, name);
            if (!names.Add(name)) throw new InvalidDataException("Duplicate package path.");
        }
        Directory.CreateDirectory(destination);
        int done = 0;
        foreach (var entry in zip.Entries)
        {
            cancel.ThrowIfCancellationRequested();
            string name = entry.FullName.Replace('\\', '/')["RightRightRight/".Length..];
            if (name.TrimEnd('/').Length == 0) continue;
            string path = SafePath(destination, name.TrimEnd('/'));
            if (name.EndsWith('/')) Directory.CreateDirectory(path);
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                using var input = entry.Open();
                using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write);
                input.CopyTo(output);
            }
            done++;
            progress?.Invoke(done * 100 / Math.Max(1, zip.Entries.Count));
        }
    }

    public static int Verify(string player, string version, Action<int>? progress = null, CancellationToken cancel = default)
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(player, "package-manifest.json")));
        var root = manifest.RootElement;
        if (root.GetProperty("Format").GetInt32() != 1 || root.GetProperty("Files").ValueKind != JsonValueKind.Object)
            throw new InvalidDataException("Invalid package manifest.");
        var files = root.GetProperty("Files").EnumerateObject().ToArray();
        if (files.Length == 0) throw new InvalidDataException("Empty package manifest.");
        int done = 0;
        foreach (var file in files)
        {
            cancel.ThrowIfCancellationRequested();
            string expected = file.Value.GetString() ?? "";
            if (expected.Length != 64 || expected.Any(c => !Uri.IsHexDigit(c))) throw new InvalidDataException("Invalid file checksum.");
            using var input = File.OpenRead(SafePath(player, file.Name));
            if (!Convert.ToHexString(SHA256.HashData(input)).Equals(expected, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Package file is damaged: " + file.Name);
            done++;
            progress?.Invoke(done * 100 / files.Length);
        }
        using var config = JsonDocument.Parse(File.ReadAllText(Path.Combine(player, "rrr-distribution.json")));
        var settings = config.RootElement;
        if (settings.GetProperty("Format").GetInt32() != 1 || settings.GetProperty("State").GetString() != "direct" ||
            settings.GetProperty("SteamAppId").ValueKind != JsonValueKind.Null || settings.GetProperty("ContentVersion").GetString() != version)
            throw new InvalidDataException("This installer requires the standalone game without a Steam/playtest dependency.");
        foreach (string file in new[] { "RightRightRight.exe", "GameRuntime.exe", "GameAssembly.dll", "UnityPlayer.dll", "version.dll", "Mods/RightRightRight.dll" })
            if (!File.Exists(SafePath(player, file))) throw new InvalidDataException("Missing game component: " + file);
        if (!Directory.Exists(Path.Combine(player, "dotnet")) || !Directory.Exists(Path.Combine(player, "GameRuntime_Data")))
            throw new InvalidDataException("Game runtime or assets are missing.");
        return done;
    }
}
