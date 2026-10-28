using RightRightRight.Distribution;

void Check(bool value,string message){if(!value)throw new Exception(message);}
void Reject(Action action){try{action();}catch(InvalidDataException){return;}catch(InvalidOperationException){return;}throw new Exception("Expected rejection.");}
foreach(uint id in new uint[]{0,480,5425110})Reject(()=>new DistributionConfig{State="configured",SteamAppId=id}.RequireAppId());
Reject(()=>new DistributionConfig().RequireAppId());
Reject(()=>new DistributionConfig{State="configured"}.RequireAppId());
Reject(()=>new DistributionConfig{Format=2}.Validate());
Reject(()=>new DistributionConfig{State="pending-steam",SteamAppId=1}.Validate());
Reject(()=>new DistributionConfig{ContentVersion="wrong"}.Validate());
new DistributionConfig{State="direct"}.Validate();
Reject(()=>new DistributionConfig{State="direct",SteamAppId=123456}.Validate());
Reject(()=>new DistributionConfig{State="direct"}.RequireAppId());
// This is configuration parsing only. It never initializes Steam or claims
// ownership/access to the numeric fixture application.
Check(new DistributionConfig{State="configured",SteamAppId=123456}.RequireAppId()==123456,"Configured identity was lost.");
Console.WriteLine("PASS: pending setup fails clearly, original/sample IDs rejected, format/content checked, configured identity preserved.");
