function Update-AllRepos {
    [CmdletBinding()]
    param(
        [string]$RootPath
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    $repos = Get-GitRepositories -RootPath $map.Root
    $total = if ($repos.Count -gt 0) { $repos.Count } else { 1 }
    $count = 0

    foreach ($repo in $repos) {
        $count++
        $repoPath = $repo.FullName
        $percent = if ($total -gt 0) { [math]::Round(($count / $total) * 100) } else { 100 }
        $message = "Updating $($repo.Name)"
        Write-Progress -Activity 'Update-AllRepos' -Status $message -PercentComplete $percent
        Write-Verbose "Fetching updates for $($repoPath)."
        Write-RepoManagerLog -Message "Fetching --all for $($repo.Name)" -RootPath $map.Root

        Invoke-GitCommand -RepositoryPath $repoPath -Arguments @('fetch','--all','--prune') | Out-Null
        $branch = Get-DefaultBranch -RepositoryPath $repoPath
        $pullResult = Invoke-GitCommand -RepositoryPath $repoPath -Arguments @('pull','--ff-only','origin',$branch)
        if ($pullResult.ExitCode -eq 0) {
            Write-Verbose "Pulled latest changes for $($repo.Name) on branch $($branch)."
            Write-RepoManagerLog -Message "Pulled $($repo.Name) on $($branch)." -RootPath $map.Root
        }
        else {
            Write-Warning "Unable to pull $($repo.Name): $($pullResult.StdErr)"
            Write-RepoManagerLog -Message "Pull failed for $($repo.Name): $($pullResult.StdErr)" -RootPath $map.Root
        }
    }

    Write-Progress -Activity 'Update-AllRepos' -Completed
}
