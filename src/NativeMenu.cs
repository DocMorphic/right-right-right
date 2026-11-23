using Il2CppInterop.Runtime.InteropTypes.Arrays;
using MelonLoader.Utils;
using UnityEngine;
using Object = UnityEngine.Object;

namespace RightRightRight;

// Shares the browser's original tablet artwork, palette and explicit Start
// action. Selecting a tile is local presentation; Select retains the native
// peer/content acknowledgment and scene-loading protocol.
internal static partial class DirectSession
{
    private static int menuStage;
    private static bool menuControls;

    internal static void Gui()
    {
        if (!Enabled || !Menu) return;
        NativeMenuSkin.Load();
        var matrix = GUI.matrix;
        var tint = GUI.color;
        bool enabled = GUI.enabled;
        try
        {
            GUI.color = Color.white;
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture,
                ScaleMode.StretchToFill, false, 0, NativeMenuSkin.Background, 0, 0);
            const float width = 1220, height = 820;
            float scale = Math.Min(Screen.width / width, Screen.height / height);
            GUI.matrix = Matrix4x4.TRS(new Vector3((Screen.width - width * scale) / 2,
                (Screen.height - height * scale) / 2, 0), Quaternion.identity, Vector3.one * scale);
            GUI.enabled = enabled && !advanced && !menuControls;
            DrawMenu();
            GUI.enabled = enabled;
            if (advanced || menuControls) DrawMenuControls();
        }
        finally { GUI.matrix = matrix; GUI.color = tint; GUI.enabled = enabled; }
    }

    private static void DrawMenu()
    {
        var n = NativeMenuSkin.Instance;
        n.Title(new Rect(35, 190, 610, 91));
        n.Art(new Rect(0, 285, 685, 395));
        n.Label(new Rect(90, 691, 140, 28), "DRIVER", 19, n.Muted);
        n.Label(new Rect(235, 691, 380, 28), "steers the wreck", 19, n.Gold);
        n.Label(new Rect(90, 725, 140, 28), "NAVIGATOR", 19, n.Muted);
        n.Label(new Rect(235, 725, 380, 28), "calls the turns", 19, n.Gold);

        n.Panel(new Rect(713, 45, 456, 746), n.Lip, 29);
        n.Panel(new Rect(713, 36, 456, 746), new Color(.61f, .31f, .075f), 29);
        n.Panel(new Rect(713, 30, 456, 746), n.Orange, 29);
        n.Label(new Rect(739, 39, 180, 18), "NAV-1350", 11, n.DarkOrange);
        n.Label(new Rect(956, 39, 185, 18), "RIGHT RIGHT RIGHT", 10, n.DarkOrange, TextAnchor.MiddleRight);
        n.Panel(new Rect(727, 66, 428, 674), n.Lip, 20);
        n.Panel(new Rect(734, 73, 414, 660), n.ScreenColor, 13);
        n.Route(new Rect(734, 73, 414, 660));
        n.Label(new Rect(752, 91, 245, 31), "MAIN MENU", 23, n.Heading);
        n.Label(new Rect(981, 94, 147, 26), SessionMode.Name, 11, n.Muted, TextAnchor.MiddleRight);
        n.Line(new Rect(752, 134, 378, 1));

        bool disconnected = RaceNetwork.Manager == null ||
            (!RaceNetwork.Manager.IsListening && !RaceNetwork.Manager.ShutdownInProgress);
        bool working = busy || RelaySession.Busy;
        bool canConnect = RelaySession.Available && disconnected && !working;
        bool canChoose = (disconnected || RaceNetwork.Host) && !working && !loading && proposal.Length == 0;
        n.Label(new Rect(752, 146, 378, 35), "Host a room, choose a mode, and share its code with your friends.", 14, n.Muted);
        if (n.Button(new Rect(752, 191, 378, 43), "HOST GAME", canConnect, false, 24)) RelaySession.Connect(true);
        RelaySession.EntryCode = n.Field(new Rect(752, 244, 244, 39), RelaySession.EntryCode, 12, canConnect, "ROOM CODE").ToUpperInvariant();
        if (n.Button(new Rect(1005, 244, 125, 39), "JOIN CODE", canConnect, false, 17)) RelaySession.Connect(false);
        if (RelaySession.RoomCode.Length > 0)
        {
            n.Label(new Rect(752, 290, 267, 29), "ROOM CODE: " + RelaySession.RoomCode, 20, n.Gold);
            if (n.Button(new Rect(1030, 290, 100, 29), "COPY CODE", true, false, 12))
            { GUIUtility.systemCopyBuffer = RelaySession.RoomCode; note = "Room code copied. Send it to your friends."; }
        }
        else n.Label(new Rect(752, 291, 378, 29), "One driver. One navigator. One way out.", 13, n.Muted);

        if (n.Button(new Rect(752, 331, 185, 38), "2 PLAYER CO-OP", canChoose && RaceNetwork.Count <= 2, SessionMode.Players == 2, 14)) ChangeMode(2);
        if (n.Button(new Rect(945, 331, 185, 38), "4 PLAYER RACE", canChoose, SessionMode.Players == 4, 14)) ChangeMode(4);
        n.Label(new Rect(752, 375, 378, 30), SessionMode.Players == 2 ? "One car: host drives, friend navigates." :
            "Two cars: A driver, A navigator, B driver, B navigator.", 12, n.Muted);
        n.Label(new Rect(752, 410, 250, 23), "CREW", 14, n.Heading);
        n.Label(new Rect(1030, 410, 100, 23), $"{RaceNetwork.Count} / {SessionMode.Players}", 17, n.Gold, TextAnchor.MiddleRight);
        var ids = RaceNetwork.Host ? RaceNetwork.ConnectedIds() : RaceNetwork.Seats;
        for (int i = 0; i < SessionMode.Players; i++)
        {
            float x = 752 + (i % 2) * 194, y = 441 + (i / 2) * 39;
            bool present = i < ids.Length;
            n.Panel(new Rect(x, y + 1, 2, 31), present ? n.Gold : n.Outline, 0);
            string seat = (i < 2 ? "A / " : "B / ") + (i % 2 == 0 ? "DRIVER" : "NAVIGATOR");
            string status = !present ? "WAITING..." : RaceNetwork.Manager != null && ids[i] == RaceNetwork.Manager.LocalClientId ? "YOU" : "CONNECTED";
            n.Label(new Rect(x + 10, y - 2, 171, 18), seat, 12, present ? n.Gold : n.Muted);
            n.Label(new Rect(x + 10, y + 15, 171, 18), status, 10, n.Muted);
        }
        n.Label(new Rect(752, 525, 174, 22), "PICK A STAGE", 14, n.Heading);
        string stageNote = disconnected ? "HOST A ROOM TO BEGIN" : !RaceNetwork.Host ? "THE HOST CHOOSES" :
            AllAccepted ? "CREW READY" : "WAITING FOR YOUR CREW";
        n.Label(new Rect(920, 525, 210, 22), stageNote, 10, n.Muted, TextAnchor.MiddleRight);
        menuStage = Math.Clamp(menuStage, 0, Math.Max(0, Mod.Stages.Length - 1));
        for (int i = 0; i < Mod.Stages.Length; i++)
            if (n.Button(new Rect(752 + (i % 2) * 194, 556 + (i / 2) * 38, 184, 32),
                Mod.Stages[i].Name, canChoose, menuStage == i && (disconnected || RaceNetwork.Host), 12)) menuStage = i;
        bool canStart = RaceNetwork.Host && AllAccepted && !loading && proposal.Length == 0 && Mod.Stages.Length > 0;
        if (n.Button(new Rect(752, 677, 378, 43), loading ? "STARTING..." : "START GAME", canStart, false, 28)) Select(Mod.Stages[menuStage]);
        // The note sits outside the screen so errors never overlap the six tiles.
        n.Label(new Rect(735, 791, 414, 28), !RelaySession.Available && disconnected ?
            RelaySession.SetupNote + " Open Controls for LAN / Advanced." : note, 11, n.Muted, TextAnchor.UpperCenter);
        if (n.Button(new Rect(740, 743, 100, 25), "CONTROLS", true, false, 11, true)) menuControls = true;
        n.Label(new Rect(850, 745, 176, 20), "FOREST RUN", 10, n.DarkOrange, TextAnchor.MiddleCenter);
        if ((!disconnected || working) && n.Button(new Rect(1044, 743, 90, 25), "LEAVE", true, false, 11, true))
            Disconnect("Disconnected. Host or join a game.");
    }

    private static void DrawMenuControls()
    {
        var n = NativeMenuSkin.Instance;
        n.Panel(new Rect(0, 0, 1220, 820), new Color(0, 0, 0, .72f), 0);
        n.Panel(new Rect(310, 166, 600, 480), n.Orange, 27);
        n.Panel(new Rect(323, 179, 574, 454), n.Lip, 18);
        n.Panel(new Rect(331, 187, 558, 438), n.ScreenColor, 12);
        n.Label(new Rect(354, 205, 512, 36), advanced ? "LAN / ADVANCED" : "CONTROLS", 26, n.Heading);
        bool disconnected = RaceNetwork.Manager == null || (!RaceNetwork.Manager.IsListening && !RaceNetwork.Manager.ShutdownInProgress);
        if (!advanced)
        {
            n.Label(new Rect(354, 260, 512, 245), "WASD / arrows   drive\nMouse           look around\nE               grab / drop tablet\nG               close door\nHold C          wipe the windshield\nSpace           handbrake\nF8              host retry", 20, n.Gold);
            if (n.Button(new Rect(354, 527, 512, 38), "LAN / ADVANCED", true, false, 16)) advanced = true;
        }
        else
        {
            n.Label(new Rect(354, 257, 512, 55), "Enter the host's IPv4 address and UDP port. For a remote LAN / VPN session, all players need the same network connection.", 15, n.Muted);
            n.Label(new Rect(354, 327, 330, 25), "HOST ADDRESS", 12, n.Muted);
            n.Label(new Rect(724, 327, 142, 25), "UDP PORT", 12, n.Muted);
            bool canConnect = disconnected && !busy && !RelaySession.Busy;
            address = n.Field(new Rect(354, 357, 350, 39), address, 45, canConnect);
            portText = n.Field(new Rect(724, 357, 142, 39), portText, 5, canConnect);
            if (n.Button(new Rect(354, 411, 248, 42), "HOST LAN", canConnect, false, 20)) Connect(true);
            if (n.Button(new Rect(618, 411, 248, 42), "JOIN LAN", canConnect, false, 20)) Connect(false);
            n.Label(new Rect(354, 468, 512, 45), note, 13, n.Muted);
            if (n.Button(new Rect(354, 527, 248, 38), "OPEN PORTHOLE", true, false, 14)) Application.OpenURL("steam://run/4963920");
            if (n.Button(new Rect(618, 527, 248, 38), "GET PORTHOLE", true, false, 14)) Application.OpenURL("https://store.steampowered.com/app/4963920/");
        }
        if (n.Button(new Rect(354, 578, 512, 31), "BACK TO MENU", true, false, 15)) { advanced = false; menuControls = false; }
    }
}

internal sealed class NativeMenuSkin
{
    internal static readonly Color Background = Hex(0x24211f);
    internal static NativeMenuSkin Instance = new();
    internal readonly Color Orange = Hex(0xed851f), Lip = Hex(0x241c17), ScreenColor = Hex(0x292617),
        Gold = Hex(0xdbb86b), Muted = Hex(0x99804d), Outline = Hex(0x665733), Heading = Hex(0xf48d1e), DarkOrange = Hex(0x94470d);
    private Font? mono, anton;
    private Texture2D? car, route, title;
    private float nextLoad;
    private bool reported;
    private readonly Dictionary<string, GUIStyle> styles = new();
    private static Color Hex(int rgb) => new((rgb >> 16 & 255) / 255f, (rgb >> 8 & 255) / 255f, (rgb & 255) / 255f);

    internal static void Load() => Instance.LoadAssets();
    private void LoadAssets()
    {
        if (Time.realtimeSinceStartup < nextLoad) return;
        nextLoad = Time.realtimeSinceStartup + 3;
        try
        {
            if (mono == null)
            {
                mono = Resources.FindObjectsOfTypeAll<Font>().FirstOrDefault(f => f.name == "ShareTechMono-Regular" && f.HasCharacter('A'))
                    ?? Resources.Load<Font>("Fonts/ShareTechMono-Regular");
                if (mono != null) { Object.DontDestroyOnLoad(mono); styles.Clear(); }
            }
            if (anton == null) anton = Resources.FindObjectsOfTypeAll<Font>().FirstOrDefault(f => f.name == "Anton-Regular" && f.HasCharacter('R'));
            foreach (var texture in Resources.FindObjectsOfTypeAll<Texture2D>())
            {
                if (texture.name == "ee") car = texture;
                if (texture.name == "TabletRoute") route = texture;
            }
            // Optional lossless original artwork prepared by export_web_assets.py.
            // It is a package input, never an embedded/committed licensed asset.
            string folder = Path.Combine(MelonEnvironment.UserDataDirectory, "RightRightRight", "UI");
            title ??= Sidecar(Path.Combine(folder, "MainMenuTitle.png"));
            car ??= Sidecar(Path.Combine(folder, "ee.png"));
            route ??= Sidecar(Path.Combine(folder, "TabletRoute.png"));
            if (car != null) Object.DontDestroyOnLoad(car);
            if (route != null) Object.DontDestroyOnLoad(route);
            if (!reported)
            {
                reported = true;
                Mod.Log.Msg($"NATIVE_TABLET_MENU_READY font={mono?.name ?? "LiberationSans fallback"} car={car != null} route={route != null} titleMask={title != null} anton={anton != null}");
            }
        }
        catch (Exception error) { if (!reported) { reported = true; Mod.Log.Warning("NATIVE_MENU_ASSETS: " + error.Message); } }
    }

    private static Texture2D? Sidecar(string file)
    {
        if (!File.Exists(file)) return null;
        var image = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        if (!ImageConversion.LoadImage(image, new Il2CppStructArray<byte>(File.ReadAllBytes(file)), true)) { Object.Destroy(image); return null; }
        image.name = Path.GetFileNameWithoutExtension(file);
        Object.DontDestroyOnLoad(image);
        return image;
    }

    internal void Panel(Rect rect, Color color, float radius)
    {
        var old = GUI.color; GUI.color = Color.white;
        GUI.DrawTexture(rect, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, color, 0, radius);
        GUI.color = old;
    }
    internal void Line(Rect rect) => Panel(rect, new Color(Outline.r, Outline.g, Outline.b, .65f), 0);
    private GUIStyle Style(int size, TextAnchor anchor, Color color, bool field = false)
    {
        string key = size + ":" + anchor + ":" + color + ":" + field;
        if (!styles.TryGetValue(key, out var style))
        {
            style = new GUIStyle()
            {
                font = mono ?? GUI.skin.font, fontSize = size, alignment = anchor,
                wordWrap = !field, padding = new RectOffset { left = field ? 11 : 0, right = field ? 11 : 0 },
                margin = new RectOffset(), richText = false
            };
            foreach (var state in new[] { style.normal, style.hover, style.active, style.focused,
                style.onNormal, style.onHover, style.onActive, style.onFocused })
            { state.background = null; state.textColor = color; }
            styles[key] = style;
        }
        return style;
    }
    internal void Label(Rect rect, string text, int size, Color color, TextAnchor anchor = TextAnchor.MiddleLeft) => GUI.Label(rect, text, Style(size, anchor, color));
    internal bool Button(Rect rect, string text, bool enabled = true, bool selected = false, int size = 16, bool bare = false)
    {
        bool previous = GUI.enabled, canUse = enabled && previous;
        bool hover = canUse && rect.Contains(Event.current.mousePosition);
        if (!bare)
        {
            Panel(rect, selected ? Hex(0xc69042) : hover ? Gold : canUse ? Outline : Hex(0x4a4028), 10);
            Panel(new Rect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2),
                selected ? Hex(0x3b3019) : hover ? Hex(0x38301b) : canUse ? Hex(0x1a180f) : Hex(0x211f13), 9);
        }
        GUI.enabled = canUse;
        bool clicked = GUI.Button(rect, text, Style(size, TextAnchor.MiddleCenter, canUse ? selected ? Hex(0xf3ce83) : Gold : Hex(0x80683d)));
        GUI.enabled = previous;
        return clicked;
    }
    internal string Field(Rect rect, string text, int maximum, bool enabled, string placeholder = "")
    {
        Panel(rect, Outline, 9);
        Panel(new Rect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2), Hex(0x1a180f), 8);
        bool previous = GUI.enabled; GUI.enabled = previous && enabled;
        string result = GUI.TextField(rect, text, maximum, Style(16, TextAnchor.MiddleLeft, Gold, true));
        GUI.enabled = previous;
        if (result.Length == 0 && placeholder.Length > 0) Label(new Rect(rect.x + 11, rect.y, rect.width - 22, rect.height), placeholder, 15, Hex(0x79643b));
        return result;
    }
    internal void Title(Rect rect)
    {
        if (title != null)
        {
            var old = GUI.color; GUI.color = Hex(0xcd3718);
            GUI.DrawTexture(rect, title, ScaleMode.ScaleToFit, true); GUI.color = old;
        }
        else
        {
            var style = Style(65, TextAnchor.MiddleCenter, Hex(0xcd3718));
            style.font = anton ?? mono ?? GUI.skin.font;
            GUI.Label(rect, "Right! Right! RIGHT!", style);
        }
    }
    internal void Art(Rect rect)
    {
        if (car != null) GUI.DrawTexture(rect, car, ScaleMode.ScaleToFit, true);
    }
    internal void Route(Rect rect)
    {
        if (route == null) return;
        var old = GUI.color; GUI.color = new Color(1, 1, 1, .055f);
        GUI.DrawTexture(rect, route, ScaleMode.ScaleToFit, true); GUI.color = old;
    }
}
