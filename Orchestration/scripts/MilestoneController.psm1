<#
.SYNOPSIS
  Handles orchestration milestone logging and invokes metrics updates.
#>

function Write-OrchLog {
    param(
        [Parameter(Mandatory)][string]$LogPath,
        [Parameter(Mandatory)][hashtable]$Entry
    )

    $Entry.Timestamp = (Get-Date)

    try {
        $log = if (Test-Path $LogPath) {
            Get-Content -Raw -Path $LogPath | ConvertFrom-Json -ErrorAction SilentlyContinue
        } else { @() }

        if ($null -eq $log) { $log = @() }
        $log += [PSCustomObject]$Entry
        $log | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $LogPath
        Write-Verbose "✅ Milestone logged to $LogPath"
    } catch {
        Write-Warning "Failed to log milestone: $($_.Exception.Message)"
    }
}

function Finalize-Milestone {
    param(
        [Parameter(Mandatory)][string]$LogPath,
        [Parameter(Mandatory)][string]$TrendPath,
        [Parameter(Mandatory)][hashtable]$MilestoneData
    )

    Write-OrchLog -LogPath $LogPath -Entry $MilestoneData

    try {
        Import-Module "$PSScriptRoot\Update-OrchestrationMetrics.psm1" -Force
        Update-OrchestrationMetrics -LogPath $LogPath -TrendPath $TrendPath -Verbose:$false
    } catch {
        Write-Warning "Metrics update failed inside Finalize-Milestone: $($_.Exception.Message)"
    }
}
Export-ModuleMember -Function Write-OrchLog,Finalize-Milestone
