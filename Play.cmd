@echo off
if not exist "%~dp0local\playable\Mods\RightRightRight.dll" (
  echo Run Setup.ps1 first.
  pause
  exit /b 1
)
cd /d "%~dp0local\playable"
start "" "LeftLeftLEFT.exe" --melonloader.hideconsole
