# Create Desktop Shortcut for AI Toolbox
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "AI Toolbox.lnk"
$targetPath = Join-Path (Get-Location) "Launch-AIToolbox.bat"
$iconPath = "shell32.dll,13"  # Computer icon

$WScriptShell = New-Object -ComObject WScript.Shell
$shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = Get-Location
$shortcut.IconLocation = $iconPath
$shortcut.Description = "Launch AI Toolbox - Unified Prompt Hub"
$shortcut.Save()

Write-Host "
✓ Desktop shortcut created!" -ForegroundColor Green
Write-Host "  Location: $shortcutPath" -ForegroundColor Cyan
Write-Host "
You can now double-click 'AI Toolbox' on your desktop to launch!" -ForegroundColor Yellow
