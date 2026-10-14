@echo off
setlocal
cd /d "%~dp0"
title Kamino
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Kamino needs Node.js. Opening the download page...
  echo Install the "LTS" version, then double-click this file again.
  start https://nodejs.org
  pause
  exit /b 1
)
node start.mjs %*
echo.
echo Kamino stopped. Press any key to close this window.
pause >nul
