param([int]$TimeoutSeconds=90)
$ErrorActionPreference='Stop'
$folder=Join-Path $PSScriptRoot 'local\race-geometry\player'
if(!(Test-Path -LiteralPath (Join-Path $folder 'LeftLeftLEFT.exe'))) {
    New-Item -ItemType Directory -Path $folder -Force|Out-Null
    robocopy (Join-Path $PSScriptRoot 'local\playable') $folder /E /R:0 /W:0 /XF Latest.log /NFL /NDL /NJH /NJS /NP|Out-Null
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'src\bin\Release\net6.0\RightRightRight.dll') -Destination (Join-Path $folder 'Mods\RightRightRight.dll')
$reports=@()
foreach($stage in (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'levels\stages.json') -Raw|ConvertFrom-Json)) {
    $log=Join-Path $PSScriptRoot ('local\race-geometry-'+$stage.Scene+'.log')
    $run=Start-Process -FilePath (Join-Path $folder 'LeftLeftLEFT.exe') -WorkingDirectory $folder -WindowStyle Hidden -PassThru -ArgumentList @('-batchmode','-nographics','--melonloader.hideconsole',('--rrr-stage='+$stage.Scene),'--rrr-seed=12345','--rrr-verify','--rrr-race-lobby-check','-logFile',('"'+$log+'"'))
    if(!$run.WaitForExit($TimeoutSeconds*1000)){Stop-Process -Id $run.Id;throw ('Geometry test timed out: '+$stage.Scene)}
    $run.Refresh();$loader=Get-Content -LiteralPath (Join-Path $folder 'MelonLoader\Latest.log') -Raw
    if($run.ExitCode-ne 0 -or $loader-notmatch('VERIFY_GEOMETRY_PASS '+$stage.Scene) -or $loader-notmatch 'RACE_STEAM_CAPACITY_PASS max=4'){throw ('Race geometry or Steam lobby test failed: '+$stage.Scene)}
    $report=Get-Content -LiteralPath (Join-Path $folder ('UserData\RightRightRight\verification\'+$stage.Scene+'.json')) -Raw|ConvertFrom-Json
    $reports+=$report;Copy-Item -LiteralPath (Join-Path $folder 'MelonLoader\Latest.log') -Destination (Join-Path $PSScriptRoot ('local\race-geometry-'+$stage.Scene+'-loader.log'))
    Write-Output ('PASS '+$stage.Scene+': wider road/nav mesh, '+$report.CollisionChecks+' road probes, '+$report.TreeGapChecks+' tree sweeps, four-member Steam lobby and native lobby assignment.')
}
$reports|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'local\race-geometry\results.json')
