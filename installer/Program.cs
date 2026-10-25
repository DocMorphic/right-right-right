using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using RightRightRight.Setup;

if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Windows x64 is required.");
bool unattended = args.Contains("--install-only") || args.Contains("--check-only");
string? Arg(string flag) { int i = Array.IndexOf(args, flag); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
byte[] Resource(string name)
{
    using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name) ?? throw new Exception("Missing installer payload: " + name);
    using var memory = new MemoryStream(); stream.CopyTo(memory); return memory.ToArray();
}
string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
try
{
    Console.WriteLine("Right, Right, Right 0.2.0 - install / update / play");
    string target = Path.GetFullPath(Arg("--destination") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RightRightRight", "player"));
    string marker = Path.Combine(target, "rrr-install.json");
    byte[] mod = Resource("mod.dll"), stages = Resource("stages.json");
    string packId = Hash(mod.Concat(stages).ToArray());
    string installedMod = Path.Combine(target, "Mods", "RightRightRight.dll"), installedStages = Path.Combine(target, "UserData", "RightRightRight", "stages.json");
    if (!unattended && File.Exists(marker) && File.Exists(installedMod) && File.Exists(installedStages)
        && JsonDocument.Parse(File.ReadAllText(marker)).RootElement.GetProperty("PackId").GetString() == packId
        && Hash(File.ReadAllBytes(installedMod)) == Hash(mod) && Hash(File.ReadAllBytes(installedStages)) == Hash(stages))
    {
        Launch(target); return 0;
    }
    string? source = Arg("--source") ?? GameFinder.Find();
    if (source == null || !GameFinder.Valid(source))
    {
        if (unattended) throw new Exception("Playtest not found. Supply --source with its Steam installation folder.");
        Console.WriteLine("In Steam: right-click Left! Left! LEFT! Playtest > Manage > Browse local files.");
        Console.Write("Paste the game folder address: "); source = Console.ReadLine()?.Trim().Trim('"');
    }
    if (string.IsNullOrWhiteSpace(source) || !GameFinder.Valid(source)) throw new Exception("The original Steam playtest must be installed first.");
    source = Path.GetFullPath(source);
    if (target.Equals(source, StringComparison.OrdinalIgnoreCase) || target.StartsWith(source + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
        || source.StartsWith(target + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("The copy must be outside the original game folder.");
    Console.WriteLine("Found original game: " + source);
    using var supported = JsonDocument.Parse(Resource("supported.json"));
    foreach (var item in supported.RootElement.GetProperty("Files").EnumerateObject())
        if (Hash(File.ReadAllBytes(Path.Combine(source, item.Name))) != item.Value.GetString())
            throw new Exception("Unsupported original game build. This pack requires Steam build 26172243. File: " + item.Name);
    var patched = ApplyDelta(File.ReadAllBytes(Path.Combine(source, "LeftLeftLEFT_Data", "globalgamemanagers")), Resource("delta.json"));
    if (args.Contains("--check-only")) { Console.WriteLine("CHECK_PASS: source hashes and local scene-table patch verified."); return 0; }
    foreach (var process in Process.GetProcessesByName("LeftLeftLEFT"))
    {
        try { if (process.MainModule?.FileName?.StartsWith(target + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) == true)
            throw new IOException("Close Right, Right, Right before updating it."); }
        catch (System.ComponentModel.Win32Exception) { }
    }
    Directory.CreateDirectory(target); Console.WriteLine("Copying original player to: " + target); CopyDirectory(source, target);
    string data = Path.Combine(target, "LeftLeftLEFT_Data"); File.WriteAllBytes(Path.Combine(data, "globalgamemanagers"), patched);
    using var definitions = JsonDocument.Parse(stages);
    for (int i = 0; i < definitions.RootElement.GetArrayLength(); i++) File.Copy(Path.Combine(source, "LeftLeftLEFT_Data", "level1"), Path.Combine(data, "level" + (4 + i)), true);
    Directory.CreateDirectory(Path.GetDirectoryName(installedMod)!); Directory.CreateDirectory(Path.GetDirectoryName(installedStages)!);
    File.WriteAllBytes(installedMod, mod); File.WriteAllBytes(installedStages, stages);
    var cache = Path.Combine(Path.GetDirectoryName(target)!, "downloads"); Directory.CreateDirectory(cache);
    using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
    await DownloadExtract(client, "https://github.com/LavaGang/MelonLoader/releases/download/v0.7.3/MelonLoader.x64.zip", Path.Combine(cache, "MelonLoader-0.7.3.zip"),
        "5b2b2f3d1cd42b59ec886c5bdc2663edae87a0097a4f4a8f58c0965a99dda416", target, false);
    await DownloadExtract(client, "https://builds.dotnet.microsoft.com/dotnet/Runtime/6.0.36/dotnet-runtime-6.0.36-win-x64.zip", Path.Combine(cache, "dotnet-6.0.36.zip"),
        "935db5c6cee19f2c016e67168bfae7b491044735de76c673abb3b125dd325fd5e779d7efe12ba80178d46689ae70a25e558a3fa846417d44c5f4ca256e7f4bf2", Path.Combine(target, "dotnet"), true);
    File.WriteAllText(marker, JsonSerializer.Serialize(new { Version = "0.2.0", PackId = packId, InstalledAt = DateTimeOffset.UtcNow }));
    var self = Environment.ProcessPath!; var launcher = Path.Combine(target, "RightRightRight.exe");
    if (!self.Equals(launcher, StringComparison.OrdinalIgnoreCase)) File.Copy(self, launcher, true);
    File.WriteAllText(Path.Combine(target, "Play.cmd"), "@echo off\r\ncd /d \"%~dp0\"\r\nstart \"\" \"LeftLeftLEFT.exe\" --melonloader.hideconsole\r\n");
    if (!args.Contains("--no-shortcut")) CreateShortcut(launcher, target);
    Console.WriteLine("INSTALL_PASS: Ready. Keep Steam running; both friends need this version.");
    Console.WriteLine("First launch generates game bindings automatically and may take a few minutes.");
    if (!unattended) Launch(target);
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine("Setup could not finish: " + ex.Message);
    if (!unattended) { Console.WriteLine("Press Enter to close."); Console.ReadLine(); }
    return 1;
}

static void Launch(string target) => Process.Start(new ProcessStartInfo(Path.Combine(target, "LeftLeftLEFT.exe"), "--melonloader.hideconsole") { WorkingDirectory = target, UseShellExecute = true });
static void CopyDirectory(string source, string destination)
{
    Directory.CreateDirectory(destination);
    foreach (var path in Directory.EnumerateFiles(source)) File.Copy(path, Path.Combine(destination, Path.GetFileName(path)), true);
    foreach (var dir in Directory.EnumerateDirectories(source))
    {
        if ((File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0) continue;
        CopyDirectory(dir, Path.Combine(destination, Path.GetFileName(dir)));
    }
}
static byte[] ApplyDelta(byte[] source, byte[] json)
{
    using var delta = JsonDocument.Parse(json); var root = delta.RootElement;
    if (!Convert.ToHexString(SHA256.HashData(source)).Equals(root.GetProperty("SourceSha256").GetString(), StringComparison.OrdinalIgnoreCase)) throw new Exception("Scene table source hash mismatch.");
    using var output = new MemoryStream();
    foreach (var op in root.GetProperty("Operations").EnumerateArray())
    {
        if (op.TryGetProperty("Data", out var data)) output.Write(data.GetBytesFromBase64());
        else output.Write(source, op.GetProperty("Copy").GetInt32(), op.GetProperty("Length").GetInt32());
    }
    var result = output.ToArray();
    if (!Convert.ToHexString(SHA256.HashData(result)).Equals(root.GetProperty("TargetSha256").GetString(), StringComparison.OrdinalIgnoreCase)) throw new Exception("Scene table output hash mismatch.");
    return result;
}
static async Task DownloadExtract(HttpClient client, string url, string archive, string hash, string destination, bool sha512)
{
    bool Matches() => File.Exists(archive) && Convert.ToHexString(sha512 ? SHA512.HashData(File.ReadAllBytes(archive)) : SHA256.HashData(File.ReadAllBytes(archive))).Equals(hash, StringComparison.OrdinalIgnoreCase);
    if (!Matches())
    {
        Console.WriteLine("Downloading " + Path.GetFileName(archive));
        using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead); response.EnsureSuccessStatusCode();
        await using (var file = File.Create(archive)) await response.Content.CopyToAsync(file);
    }
    if (!Matches()) throw new Exception("Download hash mismatch: " + archive);
    Directory.CreateDirectory(destination); ZipFile.ExtractToDirectory(archive, destination, true);
}
static void CreateShortcut(string launcher, string target)
{
    if (!OperatingSystem.IsWindows()) return;
    try
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell"); if (shellType == null) return;
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic shortcut = shell.CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Right Right Right.lnk"));
        shortcut.TargetPath = launcher; shortcut.WorkingDirectory = target; shortcut.Save();
    }
    catch { Console.WriteLine("Desktop shortcut could not be created; launch " + launcher); }
}
