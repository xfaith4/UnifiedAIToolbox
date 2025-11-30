@echo off
REM Simple launcher that opens the HTML launch portal in the default browser
REM This provides a visual interface to start services and check status

setlocal

set "PORTAL_FILE=%~dp0launch-portal.html"

if not exist "%PORTAL_FILE%" (
    echo Error: Launch portal not found at %PORTAL_FILE%
    pause
    exit /b 1
)

echo Opening Unified AI Toolbox Launch Portal...
echo.
echo The portal will open in your default browser.
echo Use it to:
echo   - View service status
echo   - Launch services with appropriate commands
echo   - Access running services
echo.

start "" "%PORTAL_FILE%"

echo Portal opened successfully!
echo.
echo To launch services, use one of these commands:
echo   - ./launch.sh                (Bash - preflight + start API & dashboard)
echo   - docker compose up -d       (Docker)
echo.
pause
