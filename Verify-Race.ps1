param([int]$TimeoutSeconds=150,[string]$BasePlayer='',[switch]$Portable,[switch]$Direct,[switch]$Flow,[switch]$Proxy)
$ErrorActionPreference='Stop'
$testRoot=Join-Path $PSScriptRoot $(if($Proxy){'local\direct-proxy-test'}elseif($Direct){'local\direct-test'}elseif($Portable){'local\portable-test'}else{'local\race-test'})
if($Proxy -and !$Direct){throw 'UDP proxy verification requires -Direct.'}
New-Item -ItemType Directory -Path $testRoot -Force|Out-Null
$proxyProcess=$null
$runs=@()
try {
if($Proxy){
    $proxyScript=Join-Path $PSScriptRoot 'tools\verify_udp_proxy.py'
    $proxyReport=Join-Path $testRoot 'udp-proxy.json'
    $proxyProcess=Start-Process -FilePath (Join-Path $PSScriptRoot 'local\.venv-py312\Scripts\python.exe') -WindowStyle Hidden -PassThru -ArgumentList @($proxyScript,'--report',$proxyReport)
}
if(!$BasePlayer){$BasePlayer=Join-Path $PSScriptRoot 'local\playable'}
if($Portable -and !(Test-Path -LiteralPath (Join-Path $BasePlayer 'rrr-distribution.json'))){throw 'Portable verification requires a bundled portable base player.'}
$manifest=Join-Path $testRoot 'processes.json'
if(Test-Path -LiteralPath $manifest) {
    foreach($record in (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json)) {
        $old=Get-Process -Id $record.Id -ErrorAction SilentlyContinue
        if($old -and $old.Path -eq $record.Path -and $old.Path.StartsWith($testRoot+'\',[StringComparison]::OrdinalIgnoreCase)){Stop-Process -Id $old.Id}
    }
}
$runs=@()
foreach($name in @('host','client1','client2','client3')) {
    $folder=Join-Path $testRoot $name
    if(!(Test-Path -LiteralPath (Join-Path $folder 'LeftLeftLEFT.exe'))) {
        New-Item -ItemType Directory -Path $folder -Force|Out-Null
        robocopy $BasePlayer $folder /E /R:0 /W:0 /XF Latest.log /NFL /NDL /NJH /NJS /NP|Out-Null
        if($LASTEXITCODE-ge 8){throw ('Could not prepare isolated player: '+$name)}
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'src\bin\Release\net6.0\RightRightRight.dll') -Destination (Join-Path $folder 'Mods\RightRightRight.dll')
    if($Direct){Copy-Item -LiteralPath (Join-Path $BasePlayer 'rrr-distribution.json') -Destination (Join-Path $folder 'rrr-distribution.json')}
    $role=if($name -eq 'host'){'host'}else{'client'}
    $log=Join-Path $PSScriptRoot ('local\race-'+$name+'.log')
    $arguments=@('-batchmode','-nographics','--melonloader.hideconsole','-logFile',('"'+$log+'"'))
    if($Direct){$arguments+='--rrr-direct-verify';if($name-eq 'host'){$arguments+='--rrr-direct-host'};if($Flow){$arguments+='--rrr-direct-flow'}else{$arguments+='--rrr-race-verify'}}else{$arguments+=@('--rrr-lan='+$role,'--rrr-race-verify')}
    if($Proxy-and $name-ne 'host'){$arguments+=('--rrr-port='+(7787+[int]$name.Substring(6)))}
    $process=Start-Process -FilePath (Join-Path $folder 'LeftLeftLEFT.exe') -WorkingDirectory $folder -WindowStyle Hidden -PassThru -ArgumentList $arguments
    $runs+=@{Name=$name;Id=$process.Id;Path=(Join-Path $folder 'LeftLeftLEFT.exe');Process=$process;Folder=$folder}
}
$runs|Select-Object Id,Path|ConvertTo-Json|Set-Content -LiteralPath $manifest
$deadline=(Get-Date).AddSeconds($TimeoutSeconds)
    foreach($run in $runs) {
        $remaining=[Math]::Max(1,[int]($deadline-(Get-Date)).TotalMilliseconds)
        if(!$run.Process.WaitForExit($remaining)){throw ('Timed out: '+$run.Name)}
        $run.Process.Refresh()
        if($run.Process.ExitCode -ne 0){throw ('Failed: '+$run.Name+' exit '+$run.Process.ExitCode+'; inspect its MelonLoader/Latest.log')}
        $loader=Get-Content -LiteralPath (Join-Path $run.Folder 'MelonLoader\Latest.log') -Raw
        $expected=if($Flow){'DIRECT_FLOW_PASS'}else{'RACE_VERIFY_PASS client='}
        if($loader-notmatch $expected){throw ('No completed verification in current log: '+$run.Name)}
        if($Portable -and ($loader-notmatch 'PORTABLE_IDENTITY state=pending-steam' -or $loader-match 'RACE_STEAM_CAPACITY_PASS')){throw ('Portable test did not use the independent local-transport candidate: '+$run.Name)}
    }
    $reportFile=if($Flow){'UserData\RightRightRight\direct-flow.json'}else{'UserData\RightRightRight\race-verification.json'}
    $reports=@($runs|ForEach-Object {Get-Content -LiteralPath (Join-Path $_.Folder $reportFile) -Raw|ConvertFrom-Json})
    if($reports.Count-ne 4 -or ($reports|Where-Object {!$_.Pass}).Count-gt 0){throw 'Not all four processes passed.'}
    $reports|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $testRoot 'results.json')
    if($Proxy){$proxyData=Get-Content -LiteralPath $proxyReport -Raw|ConvertFrom-Json;foreach($portRecord in $proxyData.PSObject.Properties){if($portRecord.Value.Up-lt 100-or $portRecord.Value.Down-lt 100){throw 'UDP proxy did not carry enough bidirectional traffic'}}}
    if($Flow){Write-Output 'PASS: four direct players, matching course/seed handshake, readiness, restart, return to lobby, and no Steam initialization.'}
    else {Write-Output 'PASS: four connected players, two independently driven cars, physical invincible car impacts, tablet stealing/drop, door guards, mud/wipe, fatal trees, finish timing, and replicated client results.'}
} finally {
    if($proxyProcess-and !$proxyProcess.HasExited){Stop-Process -Id $proxyProcess.Id}
    foreach($run in $runs) {if(!$run.Process.HasExited){$current=Get-Process -Id $run.Id -ErrorAction SilentlyContinue;if($current -and $current.Path-eq $run.Path){Stop-Process -Id $current.Id}}}
}
