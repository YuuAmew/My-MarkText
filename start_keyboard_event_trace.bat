@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
  py -3 keyboard_event_trace.py
) else (
  python keyboard_event_trace.py
)

echo.
echo The trace has ended. Its output is saved in keyboard_event_trace.log.
pause
