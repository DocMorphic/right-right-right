using RightRightRight;

void Require(bool condition,string message){if(!condition)throw new Exception(message);}
Require(RaceProtocol.Slot(new ulong[]{0,7,12,21},12)==2,"Remote driver must map to crew B.");
Require(RaceProtocol.Slot(new ulong[]{0,7,12,21},99)==-1,"Unknown senders must have no seat.");
Require(RaceProtocol.Newer(5,4)&&!RaceProtocol.Newer(4,5)&&!RaceProtocol.Newer(5,5),"Sequence/replay order.");
Require(RaceProtocol.Newer(0,uint.MaxValue),"Sequence wrap.");
Require(RaceProtocol.ValidInput(-1,1,75,-150),"Valid controls rejected.");
foreach(float value in new[]{float.NaN,float.PositiveInfinity,float.NegativeInfinity,1.01f,-1.01f})
    Require(!RaceProtocol.ValidInput(value,0,0,0),"Invalid throttle accepted.");
Require(!RaceProtocol.ValidInput(0,0,91,0)&&!RaceProtocol.ValidInput(0,0,0,161),"Invalid aim accepted.");
using(var writer=RaceProtocol.Writer(RaceProtocol.Kind.Input)) {
    writer.Write(42u);writer.Write(.5f);using var reader=RaceProtocol.Reader(RaceProtocol.Bytes(writer),out var kind);
    Require(kind==RaceProtocol.Kind.Input&&reader.ReadUInt32()==42&&reader.ReadSingle()==.5f,"Packet round trip.");
}
foreach(var packet in new[]{Array.Empty<byte>(),new byte[6],new byte[RaceProtocol.MaxPacket+1]}) {
    bool rejected=false;try{using var reader=RaceProtocol.Reader(packet,out _);}catch(InvalidDataException){rejected=true;}
    Require(rejected,"Invalid packet accepted.");
}
Console.WriteLine("PASS: seat ownership, unknown senders, replay/order/wrap, finite bounded controls, packet framing and size limits.");
