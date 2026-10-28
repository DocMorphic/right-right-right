using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using RightRightRight.Distribution;

string root=AppContext.BaseDirectory;
string logFolder=Path.Combine(root,"Logs");
Directory.CreateDirectory(logFolder);
string logFile=Path.Combine(logFolder,"launcher.log");
void Report(string message) {
    Console.WriteLine(message);
    File.AppendAllText(logFile,$"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
}
try {
    Report("Right Right Right / portable four-player build");
    var config=DistributionConfig.Read(Path.Combine(root,DistributionConfig.FileName));
    if(args.Contains("--verify-package")) {
        using var manifest=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"package-manifest.json")));
        var files=manifest.RootElement.GetProperty("Files");int done=0;
        foreach(var file in files.EnumerateObject()) {
            string path=Path.GetFullPath(Path.Combine(root,file.Name));
            if(!path.StartsWith(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Package contains an invalid path.");
            using var stream=File.OpenRead(path);
            string actual=Convert.ToHexString(SHA256.HashData(stream));
            if(!actual.Equals(file.Value.GetString(),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Package file is missing or damaged: "+file.Name);
            if(++done%100==0)Report($"Verified {done} files...");
        }
        Report($"PACKAGE_PASS: {done} bundled files; Steam state={config.State}.");
        return 0;
    }
    uint appId=config.RequireAppId();
    if(args.Contains("--check-config")) {Report("CONFIG_PASS: separate Steam App ID configured; account access is not tested by this check.");return 0;}
    string game=Path.Combine(root,"LeftLeftLEFT.exe");
    foreach(string file in new[]{"LeftLeftLEFT.exe","GameAssembly.dll","UnityPlayer.dll","version.dll","Mods/RightRightRight.dll","UserData/RightRightRight/stages.json"})
        if(!File.Exists(Path.Combine(root,file)))throw new FileNotFoundException("Incomplete portable download: "+file);
    var start=new ProcessStartInfo(game) {WorkingDirectory=root,UseShellExecute=false};
    start.Environment["SteamAppId"]=appId.ToString();start.Environment["SteamGameId"]=appId.ToString();
    start.ArgumentList.Add("--melonloader.hideconsole");
    // Steam supplies +connect_lobby on cold-start invites. Forward arguments as
    // separate values; never concatenate a shell command or lose invite data.
    foreach(var arg in args)start.ArgumentList.Add(arg);
    Report("Starting game. Steam must be running under an account with access to this app.");
    using var process=Process.Start(start)??throw new IOException("Could not start the bundled player.");
    Report("Game process started. Diagnostics: player/MelonLoader/Latest.log and Logs/launcher.log.");
    return 0;
}
catch(Exception ex) {
    Report("Could not launch: "+ex.Message);
    if(!args.Any(a=>a.StartsWith("--"))) {Console.WriteLine("Press Enter to close.");Console.ReadLine();}
    return 1;
}
