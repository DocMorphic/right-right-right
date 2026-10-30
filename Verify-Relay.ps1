param(
    [Parameter(Mandatory=$true)][string]$BasePlayer,
    [switch]$Fixture,
    [string]$RelayConfig='',
    [switch]$Flow,
    [int]$TimeoutSeconds=160
)
$ErrorActionPreference='Stop'
if(!$Fixture -and !$RelayConfig){throw 'Choose -Fixture or supply the public -RelayConfig for a live Unity test.'}
if($Fixture -and $RelayConfig){throw 'Choose a fixture test or a live project, not both.'}
$testRoot=Join-Path $PSScriptRoot $(if($Fixture){'local\relay-fixture-test'}else{'local\relay-live-test'})
New-Item -ItemType Directory -Path $testRoot -Force|Out-Null
$codeFile=Join-Path $testRoot 'room-code.txt'
if(Test-Path -LiteralPath $codeFile){Remove-Item -LiteralPath $codeFile}
$runs=@();$fixtureProcess=$null
try {
    if($Fixture){
        $fixtureProcess=Start-Process -FilePath (Join-Path $PSScriptRoot 'local\.venv-py312\Scripts\python.exe') -WindowStyle Hidden -PassThru -ArgumentList @((Join-Path $PSScriptRoot 'tools\verify_relay_fixture.py'),'--report',(Join-Path $testRoot 'fixture.json'))
        $ready=$false
        for($i=0;$i-lt 40;$i++){
            try{$health=Invoke-RestMethod 'http://127.0.0.1:17887/health';if($health.Fixture){$ready=$true;break}}catch{}
            Start-Sleep -Milliseconds 100
        }
        if(!$ready){throw 'Loopback Relay fixture did not start.'}
    }
    foreach($name in @('host','client1','client2','client3')){
        $folder=Join-Path $testRoot $name
        if(!(Test-Path -LiteralPath (Join-Path $folder 'LeftLeftLEFT.exe'))){
            New-Item -ItemType Directory -Path $folder -Force|Out-Null
            robocopy $BasePlayer $folder /E /R:0 /W:0 /XF Latest.log /NFL /NDL /NJH /NJS /NP|Out-Null
            if($LASTEXITCODE-ge 8){throw ('Could not prepare isolated player: '+$name)}
        }
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'src\bin\Release\net6.0\RightRightRight.dll') -Destination (Join-Path $folder 'Mods\RightRightRight.dll')
        @{Format=1;State='direct';SteamAppId=$null;ContentVersion='0.3.0-alpha.3'}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $folder 'rrr-distribution.json')
        if($Fixture){
            @{Format=1;ProjectId='11111111-1111-4111-8111-111111111111';EnvironmentName='production';Region=''}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $folder 'rrr-relay.json')
        }else{Copy-Item -LiteralPath $RelayConfig -Destination (Join-Path $folder 'rrr-relay.json')}
        $log=Join-Path $testRoot ($name+'-unity.log')
        $arguments=@('-batchmode','-nographics','--melonloader.hideconsole','-logFile',('"'+$log+'"'),'--rrr-relay-verify')
        if($Fixture){$arguments+='--rrr-relay-fixture=http://127.0.0.1:17887/'}
        if($Flow){$arguments+='--rrr-direct-flow'}else{$arguments+='--rrr-race-verify'}
        if($name-eq 'host'){$arguments+=@('--rrr-direct-host',('--rrr-relay-code-file='+$codeFile))}
        else{$arguments+=('--rrr-room='+$roomCode)}
        $process=Start-Process -FilePath (Join-Path $folder 'LeftLeftLEFT.exe') -WorkingDirectory $folder -WindowStyle Hidden -PassThru -ArgumentList $arguments
        $runs+=@{Name=$name;Process=$process;Path=(Join-Path $folder 'LeftLeftLEFT.exe');Folder=$folder}
        if($name-eq 'host'){
            $deadline=(Get-Date).AddSeconds(60)
            while(!(Test-Path -LiteralPath $codeFile)){
                if($process.HasExited -or (Get-Date)-gt $deadline){throw 'Host did not create a bound Relay room. Inspect its MelonLoader/Latest.log.'}
                Start-Sleep -Milliseconds 200
            }
            $roomCode=(Get-Content -LiteralPath $codeFile -Raw).Trim()
            if($roomCode-notmatch '^[A-Z0-9]{6,12}$'){throw 'Host returned an invalid room code.'}
        }
    }
    $deadline=(Get-Date).AddSeconds($TimeoutSeconds)
    foreach($run in $runs){
        $remaining=[Math]::Max(1,[int]($deadline-(Get-Date)).TotalMilliseconds)
        if(!$run.Process.WaitForExit($remaining)){throw ('Timed out: '+$run.Name)}
        $run.Process.Refresh()
        if($run.Process.ExitCode-ne 0){throw ('Failed '+$run.Name+'; inspect its MelonLoader/Latest.log.')}
        $loader=Get-Content -LiteralPath (Join-Path $run.Folder 'MelonLoader\Latest.log') -Raw
        $expected=if($Flow){'DIRECT_FLOW_PASS'}else{'RACE_VERIFY_PASS client='}
        if($loader-notmatch $expected -or $loader-notmatch 'RELAY_CONNECTED'){throw ('Relay verification incomplete: '+$run.Name)}
        if(!$Fixture -and $loader-notmatch 'RELAY_CONNECTED host=(True|False) secure=True'){throw 'Live Relay test did not use DTLS.'}
    }
    $reportFile=if($Flow){'UserData\RightRightRight\direct-flow.json'}else{'UserData\RightRightRight\race-verification.json'}
    $reports=@($runs|ForEach-Object {Get-Content -LiteralPath (Join-Path $_.Folder $reportFile) -Raw|ConvertFrom-Json})
    if($reports.Count-ne 4 -or ($reports|Where-Object {!$_.Pass}).Count-gt 0){throw 'Not all four Relay players passed.'}
    $reports|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $testRoot $(if($Flow){'flow-results.json'}else{'gameplay-results.json'}))
    if($Fixture){
        $counts=Get-Content -LiteralPath (Join-Path $testRoot 'fixture.json') -Raw|ConvertFrom-Json
        if($counts.ValidHmac-lt 4-or $counts.Forwarded-lt 100-or $counts.Join-ne 3-or $counts.JoinCode-ne 1){throw 'Fixture did not carry authenticated Relay traffic for all four players.'}
        Write-Output 'PASS: four native Relay players via loopback REST/UDP fixture. Unity service, DTLS and internet connectivity remain untested.'
    }else{Write-Output 'PASS: four native players via Unity Relay and DTLS, with room-code allocation/join.'}
}finally{
    foreach($run in $runs){if(!$run.Process.HasExited){$current=Get-Process -Id $run.Process.Id -ErrorAction SilentlyContinue;if($current-and $current.Path-eq $run.Path){Stop-Process -Id $current.Id}}}
    if($fixtureProcess-and !$fixtureProcess.HasExited){Stop-Process -Id $fixtureProcess.Id}
}
