using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using RightRightRight.Setup;

internal static class Program
{
    internal const string Version = "0.3.0-alpha.5";
    internal static void Log(string message)
    {
        string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RightRightRight", "Logs");
        Directory.CreateDirectory(folder);
        File.AppendAllText(Path.Combine(folder, "setup.log"), DateTimeOffset.Now.ToString("O") + " " + message + Environment.NewLine);
    }
    [STAThread]
    private static int Main(string[] args)
    {
        // Publisher diagnostics only. Normal double-click installation has no
        // command line, downloads, SDK setup or playtest lookup.
        if (args.Length == 2 && args[0] == "--verify-bundle") return VerifyBundle(args[1]);
        Log("Starting standalone installer " + Version);
        ApplicationConfiguration.Initialize();
        using var instance = new Mutex(true, "Local\\RightRightRight-Setup", out bool first);
        if (!first) { MessageBox.Show("Right Right Right setup is already running."); return 0; }
        Application.Run(new SetupWindow());
        return 0;
    }

    private static int VerifyBundle(string report)
    {
        string folder = Path.Combine(Path.GetTempPath(), "rrr-setup-verification-" + Guid.NewGuid().ToString("N"));
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var zip = assembly.GetManifestResourceStream("player.zip") ?? throw new InvalidDataException("Missing bundled game.");
            using var hash = new StreamReader(assembly.GetManifestResourceStream("player.sha256")!);
            if (!Convert.ToHexString(SHA256.HashData(zip)).Equals(hash.ReadToEnd().Trim(), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Embedded archive checksum mismatch.");
            zip.Position = 0;
            PortablePackage.Extract(zip, folder);
            int count = PortablePackage.Verify(Path.Combine(folder, "player"), Version);
            File.WriteAllText(report, System.Text.Json.JsonSerializer.Serialize(new { Passed = true, Files = count, Version, SteamOrPlaytestRequired = false }));
            return 0;
        }
        catch (Exception error)
        {
            File.WriteAllText(report, System.Text.Json.JsonSerializer.Serialize(new { Passed = false, Error = error.Message }));
            return 1;
        }
        finally { if (Directory.Exists(folder)) Directory.Delete(folder, true); }
    }
}

internal sealed class SetupWindow : Form
{
    private readonly Label status = new() { AutoSize = false, Dock = DockStyle.Top, Height = 68, TextAlign = ContentAlignment.MiddleLeft };
    private readonly ProgressBar progress = new() { Dock = DockStyle.Top, Height = 22 };
    private readonly CancellationTokenSource cancellation = new();
    private bool installing = true;

    internal SetupWindow()
    {
        Text = "Right Right Right — Setup";
        ClientSize = new Size(480, 158);
        Padding = new Padding(24);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Controls.Add(progress);
        Controls.Add(status);
        status.Text = "Installing the complete game…";
        Shown += async (_, _) =>
        {
            var updates = new Progress<(string message, int percent)>(p => { status.Text = p.message; progress.Value = Math.Clamp(p.percent, 0, 100); });
            try
            {
                string game = await Task.Run(() => Install(updates, cancellation.Token));
                installing = false;
                Program.Log("Installation verified; launching " + game);
                Process.Start(new ProcessStartInfo(game) { WorkingDirectory = Path.GetDirectoryName(game)!, UseShellExecute = true });
                Close();
            }
            catch (OperationCanceledException) { installing = false; Close(); }
            catch (Exception error)
            {
                Program.Log(error.ToString());
                installing = false;
                status.Text = "Setup could not finish. " + error.Message;
                progress.Visible = false;
                var close = new Button { Text = "Close", Dock = DockStyle.Bottom, Height = 30 };
                close.Click += (_, _) => Close();
                Controls.Add(close);
            }
        };
        FormClosing += (_, e) =>
        {
            if (!installing) return;
            cancellation.Cancel();
            status.Text = "Stopping setup…";
            e.Cancel = true;
        };
    }

    private static string Install(IProgress<(string, int)> updates, CancellationToken cancel)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var zip = assembly.GetManifestResourceStream("player.zip") ?? throw new InvalidDataException("Bundled game is missing.");
        using var checksumStream = assembly.GetManifestResourceStream("player.sha256") ?? throw new InvalidDataException("Bundled checksum is missing.");
        using var reader = new StreamReader(checksumStream);
        string checksum = reader.ReadToEnd().Trim();
        updates.Report(("Checking the bundled game…", 0));
        if (!Convert.ToHexString(SHA256.HashData(zip)).Equals(checksum, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The setup download is damaged. Download it again.");
        zip.Position = 0;
        string versions = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RightRightRight", "versions");
        string target = Path.Combine(versions, Program.Version);
        Directory.CreateDirectory(versions);
        string marker = Path.Combine(target, "installer-payload.sha256");
        if (File.Exists(marker) && File.ReadAllText(marker).Trim() == checksum)
        {
            try
            {
                PortablePackage.Verify(Path.Combine(target, "player"), Program.Version, p => updates.Report(("Checking the installed game…", p)), cancel);
                string existing = Path.Combine(target, "player", "RightRightRight.exe");
                Shortcuts(existing);
                return existing;
            }
            catch (InvalidDataException) { /* Repair to a fresh directory, retaining the old copy. */ }
            catch (IOException) { }
            catch (System.Text.Json.JsonException) { }
        }
        string stage = Path.Combine(versions, ".install-" + Guid.NewGuid().ToString("N"));
        try
        {
            PortablePackage.Extract(zip, stage, p => updates.Report(("Installing game files…", p * 60 / 100)), cancel);
            PortablePackage.Verify(Path.Combine(stage, "player"), Program.Version, p => updates.Report(("Verifying game files…", 60 + p * 35 / 100)), cancel);
            Program.Log("All bundled game files extracted and verified.");
            File.WriteAllText(Path.Combine(stage, "installer-payload.sha256"), checksum);
            cancel.ThrowIfCancellationRequested();
            // Keep an older/damaged installation recoverable until the new one is complete.
            string? backup = null;
            if (Directory.Exists(target))
            {
                backup = target + ".previous-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss") + "-" + Guid.NewGuid().ToString("N")[..6];
                Directory.Move(target, backup);
            }
            try { Directory.Move(stage, target); }
            catch { if (backup != null) Directory.Move(backup, target); throw; }
            string game = Path.Combine(target, "player", "RightRightRight.exe");
            updates.Report(("Creating your game shortcut…", 98));
            Shortcuts(game);
            updates.Report(("Starting Right Right Right…", 100));
            return game;
        }
        finally { if (Directory.Exists(stage)) Directory.Delete(stage, true); }
    }

    private static void Shortcuts(string game)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell") ?? throw new IOException("Windows shortcuts are unavailable.");
        dynamic shell = Activator.CreateInstance(shellType)!;
        try
        {
            foreach (string folder in new[] { Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.Programs) })
            {
                dynamic shortcut = shell.CreateShortcut(Path.Combine(folder, "Right Right Right.lnk"));
                try
                {
                    shortcut.TargetPath = game;
                    shortcut.WorkingDirectory = Path.GetDirectoryName(game)!;
                    shortcut.Description = "Right Right Right — two-player co-op and four-player racing";
                    shortcut.Save();
                }
                finally { Marshal.FinalReleaseComObject(shortcut); }
            }
        }
        finally { Marshal.FinalReleaseComObject(shell); }
    }
}
