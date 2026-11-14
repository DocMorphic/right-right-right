$ErrorActionPreference = 'Stop'
$installed = Join-Path $env:LOCALAPPDATA 'RightRightRight\versions\0.3.0-alpha.5\player\RightRightRight.exe'
if (Test-Path -LiteralPath $installed) {
    Start-Process -FilePath $installed -WorkingDirectory (Split-Path $installed -Parent)
}
else { & (Join-Path $PSScriptRoot 'Setup.ps1') }
