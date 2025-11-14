@echo off
setlocal EnableExtensions

set "REPO_ROOT=%~dp0"
set "PORT_OVERRIDE="
set "PASSTHRU="
set "SKIP_INSTALL=0"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--port" (
    shift
    if "%~1"=="" (
        echo [ERROR] --port requires a value.
        exit /b 1
    )
    set "PORT_OVERRIDE=%~1"
) else if /I "%~1"=="--skip-install" (
    set "SKIP_INSTALL=1"
) else if "%~1"=="--" (
    shift
    set "PASSTHRU=%*"
    goto :args_done
) else (
    echo [ERROR] Unknown option: %~1
    echo Usage: %~n0 [--port 5173] [--skip-install] [-- --open]
    exit /b 1
)
shift
goto :parse_args
:args_done

set "LAUNCHER=%REPO_ROOT%LaunchUnifiedToolbox.ps1"
if not exist "%LAUNCHER%" (
    echo [ERROR] Launcher script not found at "%LAUNCHER%".
    exit /b 1
)

set "PS_CMD=pwsh -NoLogo -ExecutionPolicy Bypass -File ""%LAUNCHER%"""
if defined PORT_OVERRIDE (
    set "PS_CMD=%PS_CMD% -FrontendPort %PORT_OVERRIDE%"
)
if "%SKIP_INSTALL%"=="1" (
    set "PS_CMD=%PS_CMD% -SkipInstall"
)
if defined PASSTHRU (
    set "PS_CMD=%PS_CMD% -FrontendPassthru ""%PASSTHRU%"""
)

call %PS_CMD%
exit /b %ERRORLEVEL%
