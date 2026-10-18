@echo off
setlocal
cd /d "%~dp0"
title PicHost Development

where node >nul 2>&1
if errorlevel 1 goto missing_node

where npm >nul 2>&1
if errorlevel 1 goto missing_npm

if exist "node_modules" goto dependencies_ready
echo Installing project dependencies...
call npm ci
if errorlevel 1 goto failed

:dependencies_ready
if exist ".env" goto env_ready
if not exist ".env.example" goto env_ready
copy /Y ".env.example" ".env" >nul

:env_ready
echo Starting PicHost development server...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://127.0.0.1:3000/'"
call npm run dev
if errorlevel 1 goto failed
exit /b 0

:missing_node
echo Node.js 22 or newer was not found.
pause
exit /b 1

:missing_npm
echo npm was not found. Check the Node.js installation.
pause
exit /b 1

:failed
echo PicHost failed to start. Check the error output above.
pause
exit /b 1
