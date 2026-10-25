param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'
$probe = "import json,struct,sys; print(json.dumps({'executable':sys.executable,'version':list(sys.version_info[:3]),'bits':struct.calcsize('P')*8}))"

function Read-PythonInfo([string]$Executable) {
    try {
        $raw = & $Executable -c $probe 2>$null
        if ($LASTEXITCODE -eq 0) { return ($raw | ConvertFrom-Json) }
    }
    catch { }
    return $null
}

if ($PythonPath) {
    $info = Read-PythonInfo $PythonPath
    if (!$info) { throw ('Cannot run Python at: ' + $PythonPath) }
    if ($info.version[0] -ne 3 -or $info.version[1] -ne 12 -or $info.bits -ne 64) {
        throw ('Setup requires Python 3.12 (64-bit). The selected interpreter is ' + ($info.version -join '.') + ' (' + $info.bits + '-bit). Install 3.12 alongside your existing Python, then rerun setup.')
    }
    return $info
}

# Prefer the Windows launcher, even when `python` on PATH is a newer release.
$launcher = Get-Command py.exe -ErrorAction SilentlyContinue
if ($launcher) {
    try {
        $selected = & $launcher.Source -3.12 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $selected) {
            $info = Read-PythonInfo ([string]$selected)
            if ($info -and $info.version[0] -eq 3 -and $info.version[1] -eq 12 -and $info.bits -eq 64) { return $info }
        }
    }
    catch { }
}

$candidates = @()
if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe' }
if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Python312\python.exe' }
$onPath = Get-Command python.exe -ErrorAction SilentlyContinue
if ($onPath) { $candidates += $onPath.Source }
foreach ($candidate in $candidates) {
    if (!(Test-Path -LiteralPath $candidate)) { continue }
    $info = Read-PythonInfo $candidate
    if ($info -and $info.version[0] -eq 3 -and $info.version[1] -eq 12 -and $info.bits -eq 64) { return $info }
}
throw 'Python 3.12 (64-bit) was not found. Install it from https://www.python.org/downloads/release/python-31210/ and rerun setup. Python 3.15 is not supported by the pinned dependencies. You can keep other Python versions installed.'
