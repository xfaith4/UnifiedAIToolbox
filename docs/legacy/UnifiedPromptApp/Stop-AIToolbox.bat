@echo off
REM ========================================
REM  AI Toolbox - Stop Services
REM ========================================

echo.
echo ================================================
echo   Stopping AI Toolbox Services
echo ================================================
echo.

echo Checking for running services...

REM Find and kill processes on port 5173 (React Dashboard)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173"') do (
    echo Stopping Dashboard (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

REM Find and kill processes on port 8000 (FastAPI)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000"') do (
    echo Stopping API (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo ================================================
echo   All services stopped
echo ================================================
echo.
pause
