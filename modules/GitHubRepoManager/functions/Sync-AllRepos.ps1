function Sync-AllRepos {
    [CmdletBinding()]
    param(
        [string]$RootPath
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    $repos = Get-GitRepositories -RootPath $map.Root

    foreach ($repo in $repos) {
        $repoPath = $repo.FullName
        Write-Progress -Activity 'Sync-AllRepos' -Status "Pruning remotes for $($repo.Name)"
        Write-Verbose "Pruning remotes in $($repoPath)."
        Write-RepoManagerLog -Message "Syncing $($repo.Name)." -RootPath $map.Root

        Invoke-GitCommand -RepositoryPath $repoPath -Arguments @('remote','prune','origin') | Out-Null
        Invoke-GitCommand -RepositoryPath $repoPath -Arguments @('fetch','--all','--prune') | Out-Null

        $branches = Invoke-GitCommand -RepositoryPath $repoPath -Arguments @('for-each-ref','--format=%(refname:short)','refs/heads/')
        if ($branches.ExitCode -eq 0 -and $branches.StdOut) {
            foreach ($branch in $branches.StdOut -split "`n") {
                $trimmed = $branch.Trim()
                if (-not $trimmed) { continue }
                Invoke-GitCommand -RepositoryPath $repoPath -Arguments @('branch','--set-upstream-to=origin/' + $trimmed,$trimmed) | Out-Null
            }
        }
    }

    Write-Progress -Activity 'Sync-AllRepos' -Completed
}
