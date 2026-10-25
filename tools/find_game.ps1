param(
    [string]$GamePath = '',
    [string[]]$SteamRoots = @()
)
$ErrorActionPreference = 'Stop'

function Test-GameFolder([string]$Folder) {
    foreach ($file in @('LeftLeftLEFT.exe', 'GameAssembly.dll', 'LeftLeftLEFT_Data\level3')) {
        if (!(Test-Path -LiteralPath (Join-Path $Folder $file) -PathType Leaf)) { return $false }
    }
    return $true
}

if ($GamePath) {
    $folder = [IO.Path]::GetFullPath($GamePath.Trim().Trim('"'))
    if (!(Test-GameFolder $folder)) {
        throw ('Game files were not found in: ' + $folder + '. In Steam, right-click Left! Left! LEFT! Playtest > Manage > Browse local files, then use that folder. The folder must contain LeftLeftLEFT.exe, GameAssembly.dll and LeftLeftLEFT_Data.')
    }
    return $folder
}

if ($SteamRoots.Count -eq 0) {
    foreach ($key in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')) {
        $entry = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
        if ($entry) {
            if ($entry.SteamPath) { $SteamRoots += $entry.SteamPath }
            if ($entry.InstallPath) { $SteamRoots += $entry.InstallPath }
        }
    }
    if (${env:ProgramFiles(x86)}) { $SteamRoots += Join-Path ${env:ProgramFiles(x86)} 'Steam' }
    if ($env:ProgramFiles) { $SteamRoots += Join-Path $env:ProgramFiles 'Steam' }
}

$libraries = New-Object 'System.Collections.Generic.List[string]'
foreach ($steamRoot in ($SteamRoots | Select-Object -Unique)) {
    $libraries.Add($steamRoot)
    foreach ($relative in @('steamapps\libraryfolders.vdf', 'config\libraryfolders.vdf')) {
        $vdf = Join-Path $steamRoot $relative
        if (!(Test-Path -LiteralPath $vdf -PathType Leaf)) { continue }
        $text = Get-Content -LiteralPath $vdf -Raw
        foreach ($match in [regex]::Matches($text, '"path"\s*"([^"]+)"|(?m)^\s*"\d+"\s*"([^"]+)"')) {
            $value = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
            $value = $value.Replace('\\', '\')
            if ([IO.Path]::IsPathRooted($value)) { $libraries.Add($value) }
        }
    }
}

foreach ($library in ($libraries | Select-Object -Unique)) {
    $apps = Join-Path $library 'steamapps'
    $manifest = Join-Path $apps 'appmanifest_5425110.acf'
    $installDir = 'Left! Left! LEFT! Playtest'
    if (Test-Path -LiteralPath $manifest -PathType Leaf) {
        $text = Get-Content -LiteralPath $manifest -Raw
        $match = [regex]::Match($text, '"installdir"\s*"([^"]+)"')
        if ($match.Success) {
            $candidate = $match.Groups[1].Value
            if ([IO.Path]::GetFileName($candidate) -ne $candidate) { continue }
            $installDir = $candidate
        }
    }
    $folder = Join-Path (Join-Path $apps 'common') $installDir
    if (Test-GameFolder $folder) { return [IO.Path]::GetFullPath($folder) }
}
throw 'Could not find the installed Left! Left! LEFT! Playtest in Steam libraries. Install it through Steam, or supply -GamePath with the folder opened by Steam > Manage > Browse local files.'
