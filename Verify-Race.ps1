param([int]$TimeoutSeconds=150,[string]$BasePlayer='',[switch]$Portable)
$ErrorActionPreference='Stop'
$testRoot=Join-Path $PSScriptRoot $(if($Portable){'local\portable-test'}else{'local\race-test'})
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
    $role=if($name -eq 'host'){'host'}else{'client'}
    $log=Join-Path $PSScriptRoot ('local\race-'+$name+'.log')
    $process=Start-Process -FilePath (Join-Path $folder 'LeftLeftLEFT.exe') -WorkingDirectory $folder -WindowStyle Hidden -PassThru -ArgumentList @('-batchmode','-nographics','--melonloader.hideconsole',('--rrr-lan='+$role),'--rrr-race-verify','-logFile',('"'+$log+'"'))
    $runs+=@{Name=$name;Id=$process.Id;Path=(Join-Path $folder 'LeftLeftLEFT.exe');Process=$process;Folder=$folder}
}
$runs|Select-Object Id,Path|ConvertTo-Json|Set-Content -LiteralPath $manifest
$deadline=(Get-Date).AddSeconds($TimeoutSeconds)
try {
    foreach($run in $runs) {
        $remaining=[Math]::Max(1,[int]($deadline-(Get-Date)).TotalMilliseconds)
        if(!$run.Process.WaitForExit($remaining)){throw ('Timed out: '+$run.Name)}
        $run.Process.Refresh()
        if($run.Process.ExitCode -ne 0){throw ('Failed: '+$run.Name+' exit '+$run.Process.ExitCode+'; inspect its MelonLoader/Latest.log')}
        $loader=Get-Content -LiteralPath (Join-Path $run.Folder 'MelonLoader\Latest.log') -Raw
        if($loader-notmatch 'RACE_VERIFY_PASS client='){throw ('No completed verification in current log: '+$run.Name)}
        if($Portable -and ($loader-notmatch 'PORTABLE_IDENTITY state=pending-steam' -or $loader-match 'RACE_STEAM_CAPACITY_PASS')){throw ('Portable test did not use the independent local-transport candidate: '+$run.Name)}
    }
    $reports=@($runs|ForEach-Object {Get-Content -LiteralPath (Join-Path $_.Folder 'UserData\RightRightRight\race-verification.json') -Raw|ConvertFrom-Json})
    if($reports.Count-ne 4 -or ($reports|Where-Object {!$_.Pass}).Count-gt 0){throw 'Not all four processes passed.'}
    $reports|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $testRoot 'results.json')
    Write-Output 'PASS: four connected players, two independently driven cars, physical invincible car impacts, tablet stealing/drop, door guards, mud/wipe, fatal trees, finish timing, and replicated client results.'
} finally {
    foreach($run in $runs) {if(!$run.Process.HasExited){$current=Get-Process -Id $run.Id -ErrorAction SilentlyContinue;if($current -and $current.Path-eq $run.Path){Stop-Process -Id $current.Id}}}
}
