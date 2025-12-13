function Archive-InactiveRepos {
    [CmdletBinding()]
    param(
        [string]$RootPath,
        [ValidateRange(1,3650)]
        [int]$DaysInactive = 90
    )

    $map = Get-RepoDirectoryMap -RootPath $RootPath
    $targets = @( 'Active', 'Staging' )
    New-Item -ItemType Directory -Force -Path $map.Archive | Out-Null
    $archived = 0

    foreach ($target in $targets) {
        $sourceDir = $map.$target
        if (-not (Test-Path $sourceDir)) { continue }
        $repos = Get-ChildItem -Path $sourceDir -Directory -ErrorAction SilentlyContinue
        foreach ($repo in $repos) {
            $status = Get-RepoStatus -RepositoryPath $repo.FullName
            if ($status.DaysOld -lt $DaysInactive) { continue }

            $timestamp = (Get-Date).ToString('yyyyMMdd_HHmmss')
            $zipName = "${($repo.Name)}_$timestamp.zip"
            $destination = Join-Path -Path $map.Archive -ChildPath $zipName
            Write-Progress -Activity 'Archive-InactiveRepos' -Status "Archiving $($repo.Name)"
            Compress-Archive -Path $repo.FullName -DestinationPath $destination -Force
            Remove-Item -Path $repo.FullName -Recurse -Force
            $archived++
            Write-RepoManagerLog -Message "Archived $($repo.Name) to $($destination)" -RootPath $map.Root
        }
    }

    Write-Verbose "Archived $($archived) repositories older than $($DaysInactive) days."
    Write-Progress -Activity 'Archive-InactiveRepos' -Completed
}
