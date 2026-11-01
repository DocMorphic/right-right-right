namespace RightRightRight;

// Host-owned lobby setting. A running scene captures its array sizes from this
// setting after every peer acknowledges the selected mode/course/seed.
internal static class SessionMode
{
    internal static int Players { get; private set; } = 2;
    internal static int Cars => Players / 2;
    internal static string Name => Players == 2 ? "2 PLAYER CO-OP" : "4 PLAYER RACE";
    internal static bool Valid(int players) => players is 2 or 4;
    internal static string Acknowledgment(string proposal) => $"{Players}|{proposal}";
    internal static bool TrySelect(int players, int connected)
    {
        if (!Valid(players) || connected < 0 || connected > players) return false;
        Players = players;
        return true;
    }
}
