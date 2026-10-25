param(
    [string]$GamePath = '',
    [string]$PythonPath = '',
    [string]$DestinationPath = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$toolsPath = Join-Path $repoRoot 'local\tools'
$playerPath = if ($DestinationPath) { [IO.Path]::GetFullPath($DestinationPath) } else { Join-Path $repoRoot 'local\playable' }
New-Item -ItemType Directory -Path $toolsPath -Force | Out-Null

function Check-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE" }
}

if ($GamePath) {
    $GamePath = & (Join-Path $repoRoot 'tools\find_game.ps1') -GamePath $GamePath
}
else {
    try { $GamePath = & (Join-Path $repoRoot 'tools\find_game.ps1') }
    catch {
        Write-Host $_.Exception.Message
        Write-Host 'In Steam: right-click Left! Left! LEFT! Playtest > Manage > Browse local files. Copy the folder address.'
        $manualPath = Read-Host 'Paste the game folder here (Enter to cancel)'
        if (!$manualPath) { throw 'Setup cancelled. The original Steam playtest must be installed first.' }
        $GamePath = & (Join-Path $repoRoot 'tools\find_game.ps1') -GamePath $manualPath
    }
}
Write-Host ('Using game installation: ' + $GamePath)

$pythonInfo = & (Join-Path $repoRoot 'tools\find_python.ps1') -PythonPath $PythonPath
Write-Host ('Using Python ' + ($pythonInfo.version -join '.') + ' (64-bit): ' + $pythonInfo.executable)
# A version-specific environment avoids reusing a failed Python 3.15 environment.
& $pythonInfo.executable -m venv (Join-Path $repoRoot 'local\.venv-py312')
Check-Exit 'Python environment creation'
$venvPython = Join-Path $repoRoot 'local\.venv-py312\Scripts\python.exe'
& $venvPython -m pip install '--only-binary=UnityPy,lz4' -r (Join-Path $repoRoot 'requirements.txt')
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

$interopFile = Join-Path $playerPath 'MelonLoader\Il2CppAssemblies\Assembly-CSharp.dll'
if (!(Test-Path -LiteralPath $interopFile)) {
    Write-Host 'Generating game interop assemblies. The first run can take several minutes.'
    $bootstrap = Start-Process -FilePath (Join-Path $playerPath 'LeftLeftLEFT.exe') -WorkingDirectory $playerPath -WindowStyle Hidden -ArgumentList @(
        '-batchmode', '-nographics', '--melonloader.hideconsole', '-logFile', ('"' + (Join-Path $repoRoot 'local\bootstrap.log') + '"')
    ) -PassThru
    try {
        $deadline = [DateTime]::UtcNow.AddMinutes(10)
        $generated = $false
        $loaderLog = Join-Path $playerPath 'MelonLoader\Latest.log'
        while (!$bootstrap.HasExited -and [DateTime]::UtcNow -lt $deadline) {
            if ((Test-Path -LiteralPath $interopFile) -and (Test-Path -LiteralPath $loaderLog)) {
                $generated = (Get-Content -LiteralPath $loaderLog -Raw) -match 'Assembly Generation Successful!'
                if ($generated) { break }
            }
            Start-Sleep -Seconds 2
            $bootstrap.Refresh()
        }
        if (!$generated) { throw 'Interop generation failed. Inspect local\playable\MelonLoader\Latest.log.' }
    }
    finally {
        if (!$bootstrap.HasExited) { Stop-Process -Id $bootstrap.Id }
    }
}
& (Join-Path $toolsPath 'dotnet\dotnet.exe') build (Join-Path $repoRoot 'src\RightRightRight.csproj') -c Release --nologo ("-p:GameDir=" + $playerPath)
Check-Exit 'Mod build'
New-Item -ItemType Directory -Path (Join-Path $playerPath 'Mods') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'src\bin\Release\net6.0\RightRightRight.dll') -Destination (Join-Path $playerPath 'Mods\RightRightRight.dll')
Write-Host ('Ready: ' + $playerPath)
if (!$DestinationPath) { Write-Host 'Run Play.ps1 or double-click Play.cmd to start Right, Right, Right.' }
