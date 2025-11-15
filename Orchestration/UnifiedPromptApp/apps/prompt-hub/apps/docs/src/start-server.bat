@echo off
echo 🚀 Prompt Library Development Server
echo =====================================
echo.

REM Check if PowerShell is available
powershell -Command "Get-Host" >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ PowerShell is required but not found
    echo 💡 Please ensure PowerShell is installed and in your PATH
    pause
    exit /b 1
)

REM Run the PowerShell script with browser opening
echo 🔍 Starting development server with port checking...
echo.
powershell -ExecutionPolicy Bypass -File "start-dev-server.ps1" -OpenBrowser

pause
