import AppKit
import CryptoKit
import Foundation

struct LaunchFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

final class GameRunner {
    let bundle: Bundle
    let base: URL
    let engine: URL
    let wine: URL
    let server: URL
    let log: FileHandle
    var process: Process?
    var stopped = false
    var environment: [String: String]

    init(bundle: Bundle = .main) throws {
        self.bundle = bundle
        guard let contentVersion = bundle.object(forInfoDictionaryKey: "RRRContentVersion") as? String,
              let enginePath = bundle.object(forInfoDictionaryKey: "RRREnginePath") as? String,
              let winePath = bundle.object(forInfoDictionaryKey: "RRRWinePath") as? String else {
            throw LaunchFailure(message: "The game app is incomplete. Download it again.")
        }
        let testRoot = CommandLine.arguments.first(where: { $0.hasPrefix("--rrr-mac-test-root=") })
        if let testRoot = testRoot, CommandLine.arguments.contains("--rrr-relay-verify") {
            base = URL(fileURLWithPath: String(testRoot.dropFirst("--rrr-mac-test-root=".count)), isDirectory: true)
        } else {
            base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("RightRightRight/Mac/" + contentVersion, isDirectory: true)
        }
        engine = bundle.bundleURL.appendingPathComponent("Contents/" + enginePath, isDirectory: true)
        wine = engine.appendingPathComponent(winePath)
        server = wine.deletingLastPathComponent().appendingPathComponent("wineserver")
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let logs = base.appendingPathComponent("Logs", isDirectory: true)
        try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
        let logURL = logs.appendingPathComponent("mac-launcher.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        log = try FileHandle(forWritingTo: logURL)
        var env = ProcessInfo.processInfo.environment.filter { key, _ in
            !key.hasPrefix("CX_") && !key.hasPrefix("WINE") && !key.hasPrefix("DYLD_")
        }
        env["WINEPREFIX"] = base.appendingPathComponent("Prefix", isDirectory: true).path
        env["WINEDEBUG"] = "-all"
        env["WINEMSYNC"] = "0"
        env["WINEDLLOVERRIDES"] = "version=n,b;mscoree,mshtml="
        env["WINESERVER"] = server.path
        environment = env
    }

    func write(_ message: String) {
        try? log.write(contentsOf: Data((ISO8601DateFormatter().string(from: Date()) + " " + message + "\n").utf8))
    }

    @discardableResult
    func run(_ executable: URL, _ arguments: [String], directory: URL? = nil) throws -> Int32 {
        if stopped { throw LaunchFailure(message: "Launch cancelled.") }
        let child = Process()
        child.executableURL = executable
        child.arguments = arguments
        child.environment = environment
        child.currentDirectoryURL = directory
        child.standardInput = FileHandle.nullDevice
        child.standardOutput = log
        child.standardError = log
        process = child
        try child.run()
        child.waitUntilExit()
        process = nil
        return child.terminationStatus
    }

    func verify(_ player: URL) throws {
        let data = try Data(contentsOf: player.appendingPathComponent("package-manifest.json"))
        guard let manifest = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              manifest["Format"] as? Int == 1, let files = manifest["Files"] as? [String: String], !files.isEmpty else {
            throw LaunchFailure(message: "The bundled game manifest is invalid.")
        }
        for (name, expected) in files {
            let file = player.appendingPathComponent(name).standardizedFileURL
            guard !name.contains("\\"), !name.split(separator: "/").contains(".."),
                  file.path.hasPrefix(player.standardizedFileURL.path + "/"), expected.count == 64 else {
                throw LaunchFailure(message: "The bundled game has an invalid file path.")
            }
            let handle = try FileHandle(forReadingFrom: file)
            defer { try? handle.close() }
            var sha = SHA256()
            while let bytes = try handle.read(upToCount: 1_048_576), !bytes.isEmpty { sha.update(data: bytes) }
            let actual = sha.finalize().map { String(format: "%02x", $0) }.joined()
            guard actual == expected.lowercased() else {
                throw LaunchFailure(message: "A game file is damaged. Download the game app again.")
            }
        }
        write("PACKAGE_PASS: \(files.count) files verified")
    }

    func start(progress: @escaping (String) -> Void) throws -> Int32 {
        let fm = FileManager.default
        guard fm.isExecutableFile(atPath: wine.path), fm.isExecutableFile(atPath: server.path),
              let resources = bundle.resourceURL,
              let expected = bundle.object(forInfoDictionaryKey: "RRRPayloadSHA256") as? String else {
            throw LaunchFailure(message: "The bundled Mac runtime is missing. Download the app again.")
        }
        let installed = base.appendingPathComponent("Game", isDirectory: true)
        let marker = installed.appendingPathComponent("payload.sha256")
        let player = installed.appendingPathComponent("RightRightRight/player", isDirectory: true)
        let current = (try? String(contentsOf: marker, encoding: .utf8)) == expected
        if !current || !fm.fileExists(atPath: player.appendingPathComponent("GameRuntime.exe").path) {
            progress("Preparing Right Right Right…")
            let payload = resources.appendingPathComponent("Game.zip")
            let data = try Data(contentsOf: payload, options: .mappedIfSafe)
            let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            guard digest == expected else { throw LaunchFailure(message: "The game download is damaged. Download it again.") }
            let stage = base.appendingPathComponent(".game-" + UUID().uuidString, isDirectory: true)
            defer { try? fm.removeItem(at: stage) }
            guard try run(URL(fileURLWithPath: "/usr/bin/ditto"), ["-x", "-k", payload.path, stage.path]) == 0 else {
                throw LaunchFailure(message: "The game files could not be prepared.")
            }
            try verify(stage.appendingPathComponent("RightRightRight/player", isDirectory: true))
            try expected.write(to: stage.appendingPathComponent("payload.sha256"), atomically: true, encoding: .utf8)
            var backup: URL?
            if fm.fileExists(atPath: installed.path) {
                let previous = base.appendingPathComponent("Game.previous-" + UUID().uuidString)
                try fm.moveItem(at: installed, to: previous)
                backup = previous
            }
            do { try fm.moveItem(at: stage, to: installed) }
            catch { if let backup = backup { try? fm.moveItem(at: backup, to: installed) }; throw error }
        }
        let prefixReady = base.appendingPathComponent("prefix-ready")
        if !fm.fileExists(atPath: prefixReady.path) {
            progress("Getting ready for your first game…")
            guard try run(wine, ["wineboot", "-u", "-r"]) == 0,
                  try run(wine, ["cmd", "/c", "ver"]) == 0 else {
                throw LaunchFailure(message: "The bundled runtime could not start. See the launch log for details.")
            }
            try Data().write(to: prefixReady)
        }
        progress("Starting Right Right Right…")
        var args = [player.appendingPathComponent("GameRuntime.exe").path, "--melonloader.hideconsole",
                    "--melonloader.disablestartscreen", "--melonloader.agfoffline", "-force-d3d11", "-screen-fullscreen", "0"]
        args += CommandLine.arguments.dropFirst().filter { !$0.hasPrefix("--rrr-mac-") }
        write("Starting bundled game with independent Mac runtime")
        let status = try run(wine, args, directory: player)
        write("Game exited with status \(status)")
        _ = try? run(server, ["-k"])
        return status
    }

    func cancel() {
        stopped = true
        if process?.isRunning == true { process?.terminate() }
        let stop = Process()
        stop.executableURL = server
        stop.arguments = ["-k"]
        stop.environment = environment
        stop.standardOutput = log
        stop.standardError = log
        try? stop.run()
    }
}

final class GameDelegate: NSObject, NSApplicationDelegate {
    var runner: GameRunner?
    var window: NSWindow?
    var label: NSTextField?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 160),
                           styleMask: [.titled, .closable], backing: .buffered, defer: false)
        win.title = "Right Right Right"
        win.center()
        let text = NSTextField(labelWithString: "Starting Right Right Right…")
        text.font = .systemFont(ofSize: 17, weight: .medium)
        text.frame = NSRect(x: 28, y: 80, width: 370, height: 30)
        let spinner = NSProgressIndicator(frame: NSRect(x: 28, y: 38, width: 26, height: 26))
        spinner.style = .spinning
        spinner.startAnimation(nil)
        win.contentView?.addSubview(text)
        win.contentView?.addSubview(spinner)
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        window = win
        label = text
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let runner = try GameRunner()
                self.runner = runner
                let status = try runner.start { status in DispatchQueue.main.async { self.label?.stringValue = status } }
                DispatchQueue.main.async {
                    if status != 0 { self.showError("The game stopped unexpectedly. Launch log: " + runner.base.appendingPathComponent("Logs/mac-launcher.log").path) }
                    NSApp.terminate(nil)
                }
            } catch {
                DispatchQueue.main.async { self.showError(error.localizedDescription); NSApp.terminate(nil) }
            }
        }
    }

    func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Right Right Right couldn’t start"
        alert.informativeText = message
        alert.addButton(withTitle: "Close")
        alert.runModal()
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        runner?.cancel()
        return .terminateNow
    }
}

if CommandLine.arguments.contains("--rrr-mac-headless") && CommandLine.arguments.contains("--rrr-relay-verify") {
    do {
        let runner = try GameRunner()
        exit(try runner.start { print($0) })
    } catch { fputs(error.localizedDescription + "\n", stderr); exit(1) }
} else {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let menu = NSMenu()
    let item = NSMenuItem()
    let submenu = NSMenu()
    submenu.addItem(withTitle: "Quit Right Right Right", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    item.submenu = submenu
    menu.addItem(item)
    app.mainMenu = menu
    let delegate = GameDelegate()
    app.delegate = delegate
    app.run()
}
