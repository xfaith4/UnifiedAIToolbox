@echo off
REM ========================================
REM  AI Toolbox - Single Click Launcher
REM ========================================

echo.
echo ================================================
echo   AI Toolbox - Unified Prompt Hub
echo ================================================
echo.

REM Change to the script directory
cd /d "%~dp0"

echo [1/3] Checking if services are already running...
netstat -ano | findstr ":5173" >nul 2>&1
if %errorlevel% equ 0 (
    echo    Dashboard already running on port 5173
    echo    Opening browser...
    start http://localhost:5173
    goto :end
)

echo    Services not running. Starting now...
echo.

echo [2/3] Launching AI Toolbox services...
echo    - React Dashboard (port 5173)
echo    - FastAPI Backend (port 8000)
echo.

REM Launch PowerShell script in a new window
start "AI Toolbox" pwsh.exe -NoExit -ExecutionPolicy Bypass -Command "& '.\LaunchUnifiedToolbox.ps1' -SkipInstall"

REM Wait for services to start
echo [3/3] Waiting for services to initialize...
timeout /t 8 /nobreak >nul

echo    Opening browser...
start http://localhost:5173

echo.
echo ================================================
echo   AI Toolbox is now running!
echo ================================================
echo.
echo   Dashboard:  http://localhost:5173
echo   API:        http://localhost:8000
echo.
echo   Close the PowerShell window to stop services
echo ================================================
echo.

:end
pause
