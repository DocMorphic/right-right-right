$ErrorActionPreference = 'Stop'
$playerPath = Join-Path $PSScriptRoot 'local\playable'
if (!(Test-Path -LiteralPath (Join-Path $playerPath 'Mods\RightRightRight.dll'))) {
    throw 'Run Setup.ps1 first.'
}
Start-Process -FilePath (Join-Path $playerPath 'LeftLeftLEFT.exe') -WorkingDirectory $playerPath -WindowStyle Normal -ArgumentList @('--melonloader.hideconsole')
