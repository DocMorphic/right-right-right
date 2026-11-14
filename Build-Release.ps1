param([string]$PythonPath = '', [string]$DotnetPath = '')
$ErrorActionPreference = 'Stop'
if (!$PythonPath) { $PythonPath = Join-Path $PSScriptRoot '.venv-build\Scripts\python.exe' }
$output = Join-Path $PSScriptRoot ('local\builds\windows-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$buildArgs = @((Join-Path $PSScriptRoot 'tools\build_from_release.py'), '--output', $output)
$installerArgs = @((Join-Path $PSScriptRoot 'tools\build_installer.py'), '--package', ($output + '.zip'))
if ($DotnetPath) { $buildArgs += @('--dotnet', $DotnetPath); $installerArgs += @('--dotnet', $DotnetPath) }
& $PythonPath @buildArgs
if ($LASTEXITCODE -ne 0) { throw 'Standalone game build failed.' }
& $PythonPath @installerArgs
if ($LASTEXITCODE -ne 0) { throw 'Complete installer build failed.' }
