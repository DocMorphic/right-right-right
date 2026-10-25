param([string]$DotnetPath = '', [string]$PythonPath = '', [string]$GamePath = '')
$ErrorActionPreference = 'Stop'
if (!$DotnetPath) { $DotnetPath = Join-Path $PSScriptRoot 'local\tools\dotnet\dotnet.exe' }
if (!$PythonPath) { $PythonPath = Join-Path $PSScriptRoot 'local\.venv-py312\Scripts\python.exe' }
$GamePath = & (Join-Path $PSScriptRoot 'tools\find_game.ps1') -GamePath $GamePath
& $PythonPath (Join-Path $PSScriptRoot 'tools\make_player_delta.py') --source $GamePath
if ($LASTEXITCODE -ne 0) { throw 'Scene delta build failed.' }
& $DotnetPath build (Join-Path $PSScriptRoot 'src\RightRightRight.csproj') -c Release --nologo
if ($LASTEXITCODE -ne 0) { throw 'Mod build failed.' }
& $DotnetPath publish (Join-Path $PSScriptRoot 'installer\RightRightRight.Setup.csproj') -c Release -o (Join-Path $PSScriptRoot 'local\friend-installer') --nologo
if ($LASTEXITCODE -ne 0) { throw 'Friend installer publish failed.' }
Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'local\friend-installer\RightRightRight-Setup.exe') -Algorithm SHA256
