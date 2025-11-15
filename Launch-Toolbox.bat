@echo off
REM Launch UnifiedAIToolbox with proper working directory
setlocal

REM Set the working directory to the script location
cd /d "%~dp0"

REM Check if the executable exists
if not exist "apps\desktop\bin\Debug\net8.0-windows\OrchestrationDesktop.exe" (
    echo Error: Could not find OrchestrationDesktop.exe
    echo Please make sure you have built the solution in Visual Studio first.
    pause
    exit /b 1
)

echo Starting UnifiedAIToolbox...
start "" "apps\desktop\bin\Debug\net8.0-windows\OrchestrationDesktop.exe"

exit /b 0
