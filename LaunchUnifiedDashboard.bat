@echo off
setlocal

rem Ensure we run from the repo root (where this file lives)
cd /d "%~dp0"

rem Quick prerequisite: PowerShell availability
where powershell >nul 2>&1
if errorlevel 1 (
  echo PowerShell is required but not found on PATH.
  exit /b 1
)

set API_URL=http://localhost:8000/health
set DASHBOARD_URL=http://localhost:5173
set PORTAL_URL=http://localhost:3000
set PORTAL_ALT=http://localhost:3001

echo === Unified AI Toolbox - Preflight Checks ===

call :checkService "%API_URL%" "Prompt API" 15 || goto :fail
call :checkService "%PORTAL_URL%" "Web Portal" 10
if errorlevel 1 (
  echo Web Portal not responding on %PORTAL_URL%. Trying %PORTAL_ALT%...
  call :checkService "%PORTAL_ALT%" "Web Portal (alt)" 10 || goto :fail
  set PORTAL_URL=%PORTAL_ALT%
)
call :checkService "%DASHBOARD_URL%" "Dashboard" 20 || goto :fail

echo All services are healthy. Opening dashboard...
start "" "%DASHBOARD_URL%"
goto :eof

:checkService
powershell -NoLogo -NoProfile -Command ^
  "& { param($Url,$Name,$TimeoutSec); $deadline=(Get-Date).AddSeconds($TimeoutSec); while((Get-Date) -lt $deadline){ try { $resp=Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5; if($resp.StatusCode -lt 500){ Write-Host \"$Name ready at $Url\"; exit 0 } } catch { } Start-Sleep -Seconds 1 } Write-Host \"$Name not responding after $TimeoutSec seconds on $Url\"; exit 1 } '%~1' '%~2' %~3"
exit /b %ERRORLEVEL%

:fail
echo Preflight failed. Check service logs and try again.
exit /b 1
