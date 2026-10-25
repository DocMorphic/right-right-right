param(
    [string]$GamePath = 'C:\Program Files (x86)\Steam\steamapps\common\Left! Left! LEFT! Playtest',
    [string]$PythonPath = 'python'
)
$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$toolsPath = Join-Path $repoRoot 'local\tools'
$playerPath = Join-Path $repoRoot 'local\playable'
New-Item -ItemType Directory -Path $toolsPath -Force | Out-Null

function Check-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE" }
}

& $PythonPath -m venv (Join-Path $repoRoot 'local\.venv')
Check-Exit 'Python environment creation'
$venvPython = Join-Path $repoRoot 'local\.venv\Scripts\python.exe'
& $venvPython -m pip install -r (Join-Path $repoRoot 'requirements.txt')
Check-Exit 'Python dependencies'
& $venvPython (Join-Path $repoRoot 'tools\prepare_build.py') --source $GamePath --destination $playerPath
Check-Exit 'Player preparation'

$loaderArchive = Join-Path $toolsPath 'melonloader.zip'
if (!(Test-Path -LiteralPath $loaderArchive)) {
    Invoke-WebRequest 'https://github.com/LavaGang/MelonLoader/releases/download/v0.7.3/MelonLoader.x64.zip' -OutFile $loaderArchive
}
if ((Get-FileHash -LiteralPath $loaderArchive -Algorithm SHA256).Hash -ne '5B2B2F3D1CD42B59EC886C5BDC2663EDAE87A0097A4F4A8F58C0965A99DDA416') {
    throw 'MelonLoader archive hash mismatch.'
}
Expand-Archive -LiteralPath $loaderArchive -DestinationPath $playerPath -Force

$installer = Join-Path $toolsPath 'dotnet-install.ps1'
if (!(Test-Path -LiteralPath $installer)) {
    Invoke-WebRequest 'https://dot.net/v1/dotnet-install.ps1' -OutFile $installer
}
& $installer -Version 8.0.426 -InstallDir (Join-Path $toolsPath 'dotnet') -NoPath
& $installer -Runtime dotnet -Version 6.0.36 -InstallDir (Join-Path $playerPath 'dotnet') -NoPath

Write-Host 'Generating game interop assemblies. The first run can take several minutes.'
$bootstrap = Start-Process -FilePath (Join-Path $playerPath 'LeftLeftLEFT.exe') -WorkingDirectory $playerPath -WindowStyle Hidden -ArgumentList @(
    '-batchmode', '-nographics', '-quit', '--melonloader.hideconsole', '-logFile', ('"' + (Join-Path $repoRoot 'local\bootstrap.log') + '"')
) -PassThru
$bootstrap.WaitForExit()
if (!(Test-Path -LiteralPath (Join-Path $playerPath 'MelonLoader\Il2CppAssemblies\Assembly-CSharp.dll'))) {
    throw 'Interop generation failed. Inspect local\playable\MelonLoader\Latest.log.'
}
& (Join-Path $toolsPath 'dotnet\dotnet.exe') build (Join-Path $repoRoot 'src\RightRightRight.csproj') -c Release --nologo
Check-Exit 'Mod build'
New-Item -ItemType Directory -Path (Join-Path $playerPath 'Mods') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'src\bin\Release\net6.0\RightRightRight.dll') -Destination (Join-Path $playerPath 'Mods\RightRightRight.dll')
Write-Host 'Ready. Run Play.ps1 to start Right, Right, Right.'
