@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup.ps1" %*
set "setupExit=%errorlevel%"
if not "%setupExit%"=="0" echo Setup failed. See the message above.
pause
exit /b %setupExit%
