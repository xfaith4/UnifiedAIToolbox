#Requires -Version 5.1
<#
.SYNOPSIS
  Multi-agent orchestration for GPT-5-Codex to review & fix large repos.
.DESCRIPTION
  - Shards the repo by configured scopes.
  - Runs agents in parallel jobs (PS 5.1+ compatible).
  - Collects patches and synthesizes a unified diff + commit message.
.NOTES
  - Assumes a CLI entry point `codex` is on PATH. Replace $CodexCmd if different.
  - Uses conservative parallelism to avoid API throttling.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [string]$Model = 'gpt-5-codex',
    [int]$MaxParallel = 3,                  # keep modest to prevent rate-limit pain
    [string]$WorkDir = '.codex_out'         # artifacts live here (per-agent subfolders)
)

$ErrorActionPreference = 'Stop'
Push-Location $RepoRoot
try {
    # --- Configuration: shards + agents --------------------------------------
    $Shards = @(
        @{ name='ps-core';   glob=@('**/*.ps1','**/*.psm1','**/*.psd1'); exclude=@('.git/**','.codex_out/**') },
        @{ name='ts-ui';     glob=@('ui/**/*.ts','ui/**/*.tsx');         exclude=@('.git/**','.codex_out/**','**/dist/**') },
        @{ name='server';    glob=@('server/**');                        exclude=@('.git/**','.codex_out/**','**/node_modules/**') }
    )

    $Agents = @(
        @{ role='critic';    promptFile='.codex/prompts/critic.md'    },
        @{ role='security';  promptFile='.codex/prompts/security.md'  },
        @{ role='lint';      promptFile='.codex/prompts/lint.md'      },
        @{ role='tests';     promptFile='.codex/prompts/tests.md'     },
        @{ role='refactor';  promptFile='.codex/prompts/refactor.md'  }
    )

    # --- Tooling: where/how to call Codex ------------------------------------
    $CodexCmd = 'codex'  # replace if your binary differs
    function Invoke-CodexAgent {
        param(
            [string]$AgentRole,
            [string]$PromptPath,
            [string]$ShardName,
            [string[]]$IncludeGlobs,
            [string[]]$ExcludeGlobs
        )
        # Create per-run output dir
        $out = Join-Path $WorkDir "$($AgentRole)_$($ShardName)"
        New-Item -ItemType Directory -Path $out -Force | Out-Null

        # Persist a narrow filelist for the agent to reduce context waste
        $fileList = Join-Path $out 'scope.txt'
        # Using git to produce a clean list; fallback to Get-ChildItem if needed
        $allFiles = & git ls-files 2>$null
        if (-not $allFiles) {
            # Fallback: enumerate files if git isn't available
            $allFiles = (Get-ChildItem -Recurse -File | ForEach-Object FullName)
        }
        $matches = New-Object System.Collections.Generic.List[string]
        foreach ($g in $IncludeGlobs) {
            $pattern = $g -replace '\*\*','.*' -replace '\*','[^/\\]*'
            foreach ($f in $allFiles) {
                if ($f -match $pattern) { [void]$matches.Add($f) }
            }
        }
        foreach ($eg in $ExcludeGlobs) {
            $ep = $eg -replace '\*\*','.*' -replace '\*','[^/\\]*'
            $matches = [System.Collections.Generic.List[string]]($matches | Where-Object { $_ -notmatch $ep })
        }
        $matches | Set-Content -Encoding UTF8 $fileList

        # Arguments to codex
        $args = @(
            'run','--model',$Model,
            '--repo','.',                          # repo root
            '--files', $fileList,                 # narrowed scope
            '--prompt-file', $PromptPath,
            '--out', $out
        )

        # Execute codex and capture stdout/stderr for debugging
        $log = Join-Path $out 'codex.log'
        & $CodexCmd @args *>&1 | Tee-Object -FilePath $log | Out-Null
        return $out
    }

    # --- Queue parallel jobs --------------------------------------------------
    New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
    $jobs = @()
    foreach ($shard in $Shards) {
        foreach ($agent in $Agents) {
            # Throttle parallelism
            while ( (Get-Job -State Running).Count -ge $MaxParallel ) {
                Start-Sleep -Seconds 1
            }
            $jobs += Start-Job -ArgumentList $agent.role, $agent.promptFile, $shard.name, $shard.glob, $shard.exclude -ScriptBlock {
                param($role,$prompt,$sname,$inc,$exc)
                # Re-import function in job
                $script:WorkDir = $using:WorkDir
                $script:Model   = $using:Model
                function Invoke-CodexAgent {
                    param([string]$AgentRole,[string]$PromptPath,[string]$ShardName,[string[]]$IncludeGlobs,[string[]]$ExcludeGlobs)
                    $out = Join-Path $script:WorkDir "$($AgentRole)_$($ShardName)"
                    New-Item -ItemType Directory -Path $out -Force | Out-Null
                    $fileList = Join-Path $out 'scope.txt'
                    $allFiles = & git ls-files 2>$null
                    if (-not $allFiles) { $allFiles = (Get-ChildItem -Recurse -File | ForEach-Object FullName) }
                    $matches = New-Object System.Collections.Generic.List[string]
                    foreach ($g in $IncludeGlobs) {
                        $pattern = $g -replace '\*\*','.*' -replace '\*','[^/\\]*'
                        foreach ($f in $allFiles) { if ($f -match $pattern) { [void]$matches.Add($f) } }
                    }
                    foreach ($eg in $ExcludeGlobs) {
                        $ep = $eg -replace '\*\*','.*' -replace '\*','[^/\\]*'
                        $matches = [System.Collections.Generic.List[string]]($matches | Where-Object { $_ -notmatch $ep })
                    }
                    $matches | Set-Content -Encoding UTF8 $fileList
                    $CodexCmd = 'codex'
                    $args = @('run','--model',$script:Model,'--repo','.', '--files',$fileList,'--prompt-file',$PromptPath,'--out',$out)
                    $log = Join-Path $out 'codex.log'
                    & $CodexCmd @args *>&1 | Tee-Object -FilePath $log | Out-Null
                    return $out
                }
                Invoke-CodexAgent -AgentRole $role -PromptPath $prompt -ShardName $sname -IncludeGlobs $inc -ExcludeGlobs $exc
            }
        }
    }

    # Wait and gather results
    if ($jobs) { Receive-Job -Job (Wait-Job -Job $jobs) -Wait -AutoRemoveJob | Out-Null }

    # --- Synthesis: merge patches in risk-aware order -------------------------
    $patches = Get-ChildItem -Recurse -Path $WorkDir -Filter 'patch.diff' | Sort-Object FullName
    $synthDir = Join-Path $WorkDir 'synth'
    New-Item -ItemType Directory -Path $synthDir -Force | Out-Null
    $mergedPatch = Join-Path $synthDir 'merged.patch'

    # Order: lint -> tests -> critic -> security -> refactor (low to high blast radius)
    $order = 'lint','tests','critic','security','refactor'
    $ordered = $patches | Sort-Object {
        $fn = $_.Directory.Name
        $role = $order.IndexOf(($order | Where-Object { $fn -like "*$_*" }))
        if ($role -lt 0) { 99 } else { $role }
    }, FullName

    # Start a temp branch for application
    & git rev-parse --is-inside-work-tree 2>$null | Out-Null
    & git checkout -b codex/swarm/$([DateTime]::Now.ToString('yyyyMMdd_HHmmss')) | Out-Null

    New-Item -ItemType File -Path $mergedPatch -Force | Out-Null
    $applyOk = $true
    foreach ($p in $ordered) {
        Write-Host "Applying patch: $($p.FullName)" -ForegroundColor Cyan
        # Append to merged patch (for artifact), then try to apply
        Get-Content $p.FullName | Add-Content -Encoding UTF8 $mergedPatch

        # Prefer git apply --3way so minor context drift is handled
        $applied = & git apply --3way --whitespace=fix $p.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning ("Patch failed: {0}`n{1}" -f $p.FullName, $applied)
            $applyOk = $false
            break
        }
        # Run quick tests if a test command exists
        if (Test-Path .\test.ps1) {
            try {
                pwsh -NoProfile -File .\test.ps1 | Tee-Object -Variable testOut | Out-Null
            } catch {
                Write-Warning "Tests failed after $($p.Name). Reverting this patch."
                & git reset --hard HEAD
                $applyOk = $false
                break
            }
        }
    }

    if ($applyOk) {
        # Collect synthesized findings and commit
        $findings = Join-Path $synthDir 'Findings.md'
        Get-ChildItem -Recurse -Path $WorkDir -Filter 'Findings.md' |
            Get-Content | Set-Content -Encoding UTF8 $findings

        # A basic commit; replace if your codex run emitted a message file
        & git add -A
        & git commit -m "chore: multi-agent review + fixes (lint/tests/critic/security/refactor)"
        Write-Host "✅ Multi-agent run complete. Branch and artifacts under $($synthDir)" -ForegroundColor Green
    } else {
        Write-Warning "Synthesis incomplete due to patch/test failure. See logs under $WorkDir."
    }
}
finally {
    Pop-Location
}
