@echo off
title SilkOS launcher
setlocal
set "RT=%LOCALAPPDATA%\SilkOS-runtime"
set "EXE=%RT%\node_modules\electron\dist\electron.exe"
cd /d "%~dp0"
if not exist package.json (
  echo ERROR: package.json not found.
  echo You probably ran this from inside the zip. Right-click the zip, choose Extract All, then run run.bat from the extracted folder.
  pause
  exit /b 1
)
if exist "%EXE%" goto run
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Opening the download page. Install the LTS version, restart this window, then run run.bat again.
  start https://nodejs.org
  pause
  exit /b 1
)
echo First run only: downloading Electron, about 100 MB. Please wait...
if not exist "%RT%" mkdir "%RT%"
> "%RT%\package.json" echo {"name":"silkos-runtime","version":"1.0.0","private":true}
pushd "%RT%"
call npm install electron@33 --no-audit --no-fund
popd
if not exist "%EXE%" (
  echo.
  echo ERROR: Electron failed to install. Check your internet connection and try again.
  pause
  exit /b 1
)
:run
start "" "%EXE%" "%~dp0."
exit /b 0
