@echo off
setlocal
set "ROOT=%~dp0"
if exist "%ROOT%.tools\node\node.exe" (
  set "PATH=%ROOT%.tools\node;%PATH%"
)
cd /d "%ROOT%"

REM Stop a previous Doraemon instance for this project, then start fresh
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { $_.CommandLine -match 'neko-window' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

call npm start
