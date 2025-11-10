#requires -Version 5.1
using namespace System.Data
Add-Type -AssemblyName System.Data
function Get-SqliteConnection { [CmdletBinding()] param() $dbPath = Join-Path $Script:DataRoot 'sqlite\prompts.db'; return $null }
