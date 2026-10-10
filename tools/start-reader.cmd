@echo off
rem atelier reader launcher - double-click safe, all paths derived at runtime
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo [atelier] node not found in PATH. Install Node.js ^(https://nodejs.org^) first.
  pause
  exit /b 1
)
node reader\server.mjs
pause
