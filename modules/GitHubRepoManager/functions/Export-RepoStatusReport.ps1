function Export-RepoStatusReport {
    [CmdletBinding()]
    param(
        [string]$RootPath
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    $timestamp = (Get-Date).ToString('yyyy-MM-dd_HH-mm-ss')
    $destination = Join-Path -Path $map.Reports -ChildPath "RepoStatusReport_$timestamp.csv"
    New-Item -ItemType Directory -Force -Path $map.Reports | Out-Null
    $repos = Get-GitRepositories -RootPath $map.Root
    $report = @()

    foreach ($repo in $repos) {
        $status = Get-RepoStatus -RepositoryPath $repo.FullName
        $report += [PSCustomObject]@{
            Repo      = $status.Repo
            Branch    = $status.Branch
            Ahead     = $status.Ahead
            Behind    = $status.Behind
            Date      = $status.Date
            DaysOld   = $status.DaysOld
        }
    }

    $report | Export-Csv -Path $destination -NoTypeInformation
    Write-Verbose "Report saved to $($destination)."
    Write-RepoManagerLog -Message "Exported repo status report to $($destination)." -RootPath $map.Root
}
