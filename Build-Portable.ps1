param(
    [uint32]$AppId=0,
    [switch]$PrepareOnly,
    [switch]$Direct,
    [string]$RelayConfig='',
    [string]$PlayerPath='',
    [string]$OutputPath='',
    [switch]$NoArchive
)
$ErrorActionPreference='Stop'
if(!$Direct -and !$PrepareOnly -and $AppId -in @(0,480,5425110)){throw 'Choose -Direct for multiplayer without a Steam App ID, or provide a separate -AppId.'}
if($Direct -and ($PrepareOnly -or $AppId-ne 0)){throw 'Direct mode does not use a Steam App ID or pending Steam setup.'}
if($PrepareOnly -and $AppId-ne 0){throw 'Choose -PrepareOnly or a configured -AppId.'}
if($RelayConfig -and !$Direct){throw '-RelayConfig requires -Direct.'}
if(!$PlayerPath){$PlayerPath=Join-Path $PSScriptRoot 'local\race-package\player'}
if(!$OutputPath){$OutputPath=Join-Path $PSScriptRoot ('local\portable\build-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
$dotnet=Join-Path $PSScriptRoot 'local\tools\dotnet\dotnet.exe'
$python=Join-Path $PSScriptRoot 'local\.venv-py312\Scripts\python.exe'
& $dotnet build (Join-Path $PSScriptRoot 'src\RightRightRight.csproj') -c Release --nologo
if($LASTEXITCODE-ne 0){throw 'Mod build failed.'}
$launcher=Join-Path $PSScriptRoot 'local\portable-launcher'
& $dotnet publish (Join-Path $PSScriptRoot 'standalone\RightRightRight.Launcher.csproj') -c Release -o $launcher --nologo
if($LASTEXITCODE-ne 0){throw 'Portable launcher build failed.'}
$packageArgs=@((Join-Path $PSScriptRoot 'tools\package_portable.py'),'--source',$PlayerPath,'--launcher',(Join-Path $launcher 'RightRightRight.exe'),'--output',$OutputPath)
if($Direct){$packageArgs+='--direct'}elseif(!$PrepareOnly){$packageArgs+=@('--app-id',"$AppId")}
if($NoArchive){$packageArgs+='--no-archive'}
if($RelayConfig){$packageArgs+=@('--relay-config',$RelayConfig)}
& $python @packageArgs
if($LASTEXITCODE-ne 0){throw 'Portable packaging failed.'}
