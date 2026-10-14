@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24, then open this launcher again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing Kamino's dependencies. This may take a few minutes.
  call npm ci
  if errorlevel 1 (
    echo Installation failed. Check your connection and try again.
    pause
    exit /b 1
  )
)
echo Open http://localhost:8080 after the server is ready.
echo Keep this window open while using Kamino. Press Ctrl+C to stop.
call npm run dev
pause
