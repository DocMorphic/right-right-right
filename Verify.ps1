param([int]$TimeoutSeconds = 100)
$ErrorActionPreference = 'Stop'
$playerPath = Join-Path $PSScriptRoot 'local\playable'
$stages = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'levels\stages.json') -Raw | ConvertFrom-Json
$summary = @()
foreach ($stage in $stages) {
    $logPath = Join-Path $PSScriptRoot ('local\verify-' + $stage.Scene + '.log')
    $run = Start-Process -FilePath (Join-Path $playerPath 'LeftLeftLEFT.exe') -WorkingDirectory $playerPath -WindowStyle Hidden -PassThru -ArgumentList @(
        '-batchmode','-nographics','--melonloader.hideconsole','--rrr-legacy-coop',('--rrr-stage=' + $stage.Scene),'--rrr-seed=12345','--rrr-verify','-logFile',('"' + $logPath + '"')
    )
    if (!$run.WaitForExit($TimeoutSeconds * 1000)) {
        Stop-Process -Id $run.Id
        throw ('Timed out testing ' + $stage.Scene)
    }
    $run.Refresh()
    $loaderLog = Get-Content -LiteralPath (Join-Path $playerPath 'MelonLoader\Latest.log') -Raw
    if ($run.ExitCode -ne 0 -or $loaderLog -notmatch ('VERIFY_HAZARDS_PASS ' + $stage.Scene)) {
        throw ('Verification failed for ' + $stage.Scene + '. Inspect ' + $logPath + ' and MelonLoader\Latest.log.')
    }
    Copy-Item -LiteralPath (Join-Path $playerPath 'MelonLoader\Latest.log') -Destination (Join-Path $PSScriptRoot ('local\verify-' + $stage.Scene + '-loader.log'))
    $report = Get-Content -LiteralPath (Join-Path $playerPath ('UserData\RightRightRight\verification\' + $stage.Scene + '.json')) -Raw | ConvertFrom-Json
    $summary += $report
    Write-Output ('PASS ' + $stage.Scene + ': ' + [math]::Round($report.LengthMeters) + ' m; ' + $report.Hairpins + ' hairpins; collision, mud/wipe, door, rear and roadside trees passed.')
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'local\verification-summary.json')
