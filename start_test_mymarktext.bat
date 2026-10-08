@echo off
setlocal

rem Start the MyMarkText development build in this folder.
rem PERF_TESTING only loads locale files from this source tree. No monitoring
rem or user-operation logging exists in this reborn project.
set "ROOT=%~dp0"
set "APPDIR=%ROOT%packages\desktop"
set "ELECTRON="

rem The installed MyMarkText uses the same application identity. Running both
rem would make Windows forward this test launch to the installed (old) version.
tasklist /fi "imagename eq MyMarkText.exe" | find /i "MyMarkText.exe" >nul
if not errorlevel 1 (
  echo [Error] Please close the installed MyMarkText before starting the test build.
  echo Otherwise Windows will open the installed version instead of this test version.
  pause
  exit /b 1
)

for /d %%D in ("%ROOT%node_modules\.pnpm\electron@*") do (
  if exist "%%~fD\node_modules\electron\dist\electron.exe" (
    set "ELECTRON=%%~fD\node_modules\electron\dist\electron.exe"
  )
)

if not exist "%APPDIR%\out\main\index.js" (
  echo [Error] The test build has not been created yet.
  echo Please build the project first.
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
set "PERF_TESTING=true"
start "MyMarkText test" "%ELECTRON%" .
endlocal
