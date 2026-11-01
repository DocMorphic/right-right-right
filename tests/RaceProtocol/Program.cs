using RightRightRight;

void Require(bool condition,string message){if(!condition)throw new Exception(message);}
Require(SessionMode.Players==2&&SessionMode.Cars==1,"Standalone defaults to two-person co-op.");
Require(SessionMode.TrySelect(4,2)&&SessionMode.Cars==2,"Two connected players can expand their lobby.");
string fourAck=SessionMode.Acknowledgment("stage|seed");
Require(!SessionMode.TrySelect(2,4)&&SessionMode.Players==4,"Cannot discard occupied seats.");
Require(SessionMode.TrySelect(2,2)&&SessionMode.Acknowledgment("stage|seed")!=fourAck,"Mode switch must invalidate old ready acknowledgments.");
foreach(int value in new[]{0,1,3,5,255})Require(!SessionMode.TrySelect(value,0)&&SessionMode.Players==2,"Invalid mode rejected without changing state.");
Require(RaceProtocol.Slot(new ulong[]{0,9},9)==1&&RaceProtocol.Slot(new ulong[]{0,9},12)==-1,"Co-op role ownership.");
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
