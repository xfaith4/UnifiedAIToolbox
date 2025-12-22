<#
.SYNOPSIS
    Creates a desktop shortcut for the UnifiedAIToolbox application.
.DESCRIPTION
    This script creates a desktop shortcut that launches the UnifiedAIToolbox WPF application.
    It handles setting the working directory and provides visual feedback.
#>

# Create WScript Shell object
$WshShell = New-Object -comObject WScript.Shell
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path -Path $desktopPath -ChildPath "UnifiedAIToolbox.lnk"

# Path to the executable
$targetPath = "$PSScriptRoot\apps\OrchestrationDesktop\bin\Debug\net8.0-windows\OrchestrationDesktop.exe"

# Create shortcut
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $targetPath
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "Launch UnifiedAIToolbox"
$Shortcut.Save()

Write-Host "Shortcut created at: $shortcutPath" -ForegroundColor Green
Write-Host "You can now launch UnifiedAIToolbox by double-clicking the shortcut on your desktop." -ForegroundColor Cyan
