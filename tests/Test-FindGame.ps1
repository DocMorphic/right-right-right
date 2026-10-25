$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$finder = Join-Path $root 'tools\find_game.ps1'
$fixture = Join-Path $root ('local\discovery-test-' + [guid]::NewGuid().ToString('N'))
$steam = Join-Path $fixture 'Steam'
$library = Join-Path $fixture 'Library With Spaces'
$gameName = 'Actually Installed Playtest'
$game = Join-Path $library ('steamapps\common\' + $gameName)
New-Item -ItemType Directory -Path (Join-Path $steam 'steamapps'),(Join-Path $game 'LeftLeftLEFT_Data') -Force | Out-Null
foreach ($file in @('LeftLeftLEFT.exe','GameAssembly.dll','LeftLeftLEFT_Data\level3')) {
    Set-Content -LiteralPath (Join-Path $game $file) -Value ''
}
$vdf = @'
"libraryfolders"
{
    "1"
    {
        "path" "__LIBRARY__"
    }
}
'@
$vdf.Replace('__LIBRARY__', $library.Replace('\','\\')) | Set-Content -LiteralPath (Join-Path $steam 'steamapps\libraryfolders.vdf')
('"AppState" { "appid" "5425110" "installdir" "' + $gameName + '" }') | Set-Content -LiteralPath (Join-Path $library 'steamapps\appmanifest_5425110.acf')
$found = & $finder -SteamRoots @($steam)
if ($found -ne [IO.Path]::GetFullPath($game)) { throw ('Secondary library was not discovered: ' + $found) }
Write-Output 'PASS: configured secondary library, spaces, escaped VDF paths and manifest install directory.'

$found = & $finder -GamePath ('"' + $game + '"')
if ($found -ne [IO.Path]::GetFullPath($game)) { throw 'Quoted manual path failed.' }
Write-Output 'PASS: copied folder address with surrounding quotes.'

$rejected = $false
try { & $finder -GamePath (Join-Path $fixture 'Missing') | Out-Null }
catch { $rejected = $_.Exception.Message -match 'Game files were not found' }
if (!$rejected) { throw 'Missing manual game folder did not produce the correct diagnostic.' }
Write-Output 'PASS: missing files reported as a location error.'

$empty = Join-Path $fixture 'Empty Steam'
New-Item -ItemType Directory -Path $empty -Force | Out-Null
$rejected = $false
try { & $finder -SteamRoots @($empty) | Out-Null }
catch { $rejected = $_.Exception.Message -match 'Install it through Steam' }
if (!$rejected) { throw 'Absent installation did not produce installation instructions.' }
Write-Output 'PASS: absent playtest produces install/manual-path instructions.'
