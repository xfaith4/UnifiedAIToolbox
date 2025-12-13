function Clone-OwnedRepos {
    param(
        [string]$DestinationPath,
        [string]$RootPath
    )

    $token = $env:GITHUB_TOKEN
    if (-not $token) {
        Write-Verbose 'Skipping clone step because GITHUB_TOKEN is not defined.'
        Write-RepoManagerLog -Message 'Token missing for Clone-OwnedRepos.' -RootPath $RootPath
        return
    }

    New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
    $headers = @{ Authorization = "token $token"; 'User-Agent' = 'UnifiedAIToolbox-GitHubRepoManager' }
    $page = 1
    $cloned = 0
    do {
        $uri = "https://api.github.com/user/repos?per_page=100&type=owner&page=$page"
        $repos = Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction SilentlyContinue
        if (-not $repos) { break }
        foreach ($repo in $repos) {
            $localPath = Join-Path -Path $DestinationPath -ChildPath $repo.name
            if (-not (Test-Path $localPath)) {
                Write-Progress -Activity 'Cloning owned repositories' -Status $repo.name -PercentComplete 0
                git clone $repo.clone_url $localPath | Out-Null
                $cloned++
                Write-RepoManagerLog -Message "Cloned $($repo.full_name)" -RootPath $RootPath
            }
        }

        $page++
    } while ($repos.Count -eq 100)
}

function Initialize-AllRepos {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [string]$RootPath
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    foreach ($entry in $map.PSObject.Properties | Where-Object { $_.Name -ne 'Root' }) {
        if ($PSCmdlet.ShouldProcess($entry.Value, 'Ensure directory exists')) {
            New-Item -ItemType Directory -Force -Path $entry.Value | Out-Null
        }
    }

    Write-Verbose "Repository skeleton created at $($map.Root)."
    Write-RepoManagerLog -Message "Initialized directory layout at $($map.Root)." -RootPath $map.Root

    if ($PSCmdlet.ShouldProcess($map.Clones, 'Clone owned repositories')) {
        Clone-OwnedRepos -DestinationPath $map.Clones -RootPath $map.Root
    }
}
