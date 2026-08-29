@echo off
setlocal

rem Start the unmodified MarkText 0.19.1 source tree in this folder.
rem This launcher does not enable MyMarkText monitoring or test instrumentation.
set "ROOT=%~dp0"
set "APPDIR=%ROOT%packages\desktop"
set "ELECTRON="

for /d %%D in ("%ROOT%node_modules\.pnpm\electron@*") do (
  if exist "%%~fD\node_modules\electron\dist\electron.exe" (
    set "ELECTRON=%%~fD\node_modules\electron\dist\electron.exe"
  )
)

if not exist "%APPDIR%\out\main\index.js" (
  echo [Error] The original test build has not been created yet.
  echo Please run the original build first.
  pause
  exit /b 1
)

if not defined ELECTRON (
  echo [Error] Electron was not found under node_modules.
  echo Run pnpm install first, then try again.
  pause
  exit /b 1
)

cd /d "%APPDIR%"
start "Original MarkText 0.19.1" "%ELECTRON%" .
endlocal
