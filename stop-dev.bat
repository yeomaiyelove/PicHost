@echo off
setlocal
cd /d "%~dp0"
title PicHost Development - Stop

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev.ps1"
if errorlevel 3 goto foreign_process
if errorlevel 2 goto not_running
if errorlevel 1 goto failed
exit /b 0

:not_running
exit /b 0

:foreign_process
pause
exit /b 1

:failed
echo Failed to stop the PicHost development server.
pause
exit /b 1
