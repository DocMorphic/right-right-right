namespace RightRightRight;

// Kept independent of Unity so protocol validation can be exercised without the game.
internal static class RaceProtocol
{
    internal const int Magic = 0x33525252;
    internal const byte Version = 1;
    internal const int MaxPacket = 8192;
    internal enum Kind : byte { Ready = 1, Input = 2, Snapshot = 3 }
    [Flags] internal enum Buttons : byte { None=0, Handbrake=1, Grab=2, Door=4, Wipe=8 }
    internal static int Slot(ulong[] seats, ulong sender) => Array.IndexOf(seats, sender);
    internal static bool ValidInput(float throttle, float steer, float pitch, float yaw) =>
        float.IsFinite(throttle) && float.IsFinite(steer) && float.IsFinite(pitch) && float.IsFinite(yaw)
        && Math.Abs(throttle) <= 1 && Math.Abs(steer) <= 1 && Math.Abs(pitch) <= 90 && Math.Abs(yaw) <= 160;
    internal static bool Newer(uint sequence, uint previous) => unchecked((int)(sequence-previous)) > 0;
    internal static BinaryWriter Writer(Kind kind)
    {
        var writer = new BinaryWriter(new MemoryStream()); writer.Write(Magic); writer.Write(Version); writer.Write((byte)kind); return writer;
    }
    internal static BinaryReader Reader(byte[] packet, out Kind kind)
    {
        if (packet.Length < 6 || packet.Length > MaxPacket) throw new InvalidDataException("Invalid race packet size.");
        var reader = new BinaryReader(new MemoryStream(packet, false));
        if (reader.ReadInt32() != Magic || reader.ReadByte() != Version) throw new InvalidDataException("Race protocol mismatch.");
        kind=(Kind)reader.ReadByte(); return reader;
    }
    internal static byte[] Bytes(BinaryWriter writer) { writer.Flush(); return ((MemoryStream)writer.BaseStream).ToArray(); }
}
