@echo off
setlocal
set "ROOT=%~dp0"
if exist "%ROOT%.tools\node\node.exe" (
  set "PATH=%ROOT%.tools\node;%PATH%"
)
cd /d "%ROOT%"
call npm start
