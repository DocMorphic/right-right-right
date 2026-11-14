$ErrorActionPreference = 'Stop'
$setup = Join-Path $PSScriptRoot 'local\friend-installer\RightRightRight-Setup.exe'
if (!(Test-Path -LiteralPath $setup)) {
    throw 'The complete setup EXE has not been built in this checkout. Follow docs/INSTALLER.md to build it, then run Setup.cmd. Players only need RightRightRight-Setup.exe.'
}
Start-Process -FilePath $setup
