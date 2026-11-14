using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using RightRightRight.Setup;

const string Version = "0.3.0-alpha.5";
int checks = 0;
void Check(bool ok, string message) { if (!ok) throw new Exception(message); checks++; Console.WriteLine("PASS " + message); }
void Reject(Action action, string message) { bool rejected = false; try { action(); } catch (InvalidDataException) { rejected = true; } Check(rejected, message); }
MemoryStream Zip(params (string name, string content)[] entries)
{
    var memory = new MemoryStream();
    using (var zip = new ZipArchive(memory, ZipArchiveMode.Create, true))
        foreach (var (name, content) in entries) { using var writer = new StreamWriter(zip.CreateEntry(name).Open()); writer.Write(content); }
    memory.Position = 0;
    return memory;
}
string work = Path.Combine(Path.GetTempPath(), "rrr-installer-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(work);
try
{
    foreach (var path in new[] { "../outside", "nested/../../outside", "C:/outside", "\\\\server\\share", "/absolute", "nested\\..\\outside" })
        Reject(() => PortablePackage.SafePath(work, path), "reject escaping path " + path);
    using (var zip = Zip(("RightRightRight/first.txt", "safe"), ("RightRightRight/../outside.txt", "unsafe")))
        Reject(() => PortablePackage.Extract(zip, Path.Combine(work, "bad")), "reject traversal before extracting any files");
    Check(!Directory.Exists(Path.Combine(work, "bad")), "invalid archive leaves destination untouched");
    using (var zip = Zip(("RightRightRight/A.txt", "one"), ("RightRightRight/a.txt", "two")))
        Reject(() => PortablePackage.Extract(zip, Path.Combine(work, "duplicate")), "reject Windows case-insensitive duplicate names");
    var data = new Dictionary<string, string>();
    foreach (string file in new[] { "RightRightRight.exe", "GameRuntime.exe", "GameAssembly.dll", "UnityPlayer.dll", "version.dll", "Mods/RightRightRight.dll", "dotnet/runtime.txt", "GameRuntime_Data/scene" }) data[file] = "fixture: " + file;
    data["rrr-distribution.json"] = JsonSerializer.Serialize(new { Format = 1, State = "direct", SteamAppId = (uint?)null, ContentVersion = Version });
    string Manifest()
    {
        var hashes = data.ToDictionary(x => x.Key, x => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(x.Value))));
        return JsonSerializer.Serialize(new { Format = 1, Files = hashes });
    }
    var entries = data.Select(x => ("RightRightRight/player/" + x.Key, x.Value)).Append(("RightRightRight/player/package-manifest.json", Manifest())).ToArray();
    string destination = Path.Combine(work, "valid");
    using (var zip = Zip(entries)) PortablePackage.Extract(zip, destination);
    string player = Path.Combine(destination, "player");
    Check(PortablePackage.Verify(player, Version) == data.Count, "complete bundled fixture verifies without a playtest or external installation");
    File.WriteAllText(Path.Combine(player, "GameAssembly.dll"), "damaged");
    Reject(() => PortablePackage.Verify(player, Version), "damaged game bytes fail manifest verification");
    File.WriteAllText(Path.Combine(player, "GameAssembly.dll"), data["GameAssembly.dll"]);
    data["rrr-distribution.json"] = JsonSerializer.Serialize(new { Format = 1, State = "configured", SteamAppId = 5425110, ContentVersion = Version });
    File.WriteAllText(Path.Combine(player, "rrr-distribution.json"), data["rrr-distribution.json"]);
    File.WriteAllText(Path.Combine(player, "package-manifest.json"), Manifest());
    Reject(() => PortablePackage.Verify(player, Version), "reject packages that still depend on the original Steam playtest");
    if (args.Length == 1) Check(PortablePackage.Verify(args[0], Version) >= 638, "real standalone package verifies with the installer's own verifier");
    Console.WriteLine($"RESULT {checks}/{checks} installer checks passed");
}
finally { Directory.Delete(work, true); }
