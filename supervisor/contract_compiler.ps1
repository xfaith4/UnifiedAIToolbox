# Contract Compiler (SSOT-driven)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "JSON file not found: $Path"
    }
    $raw = Get-Content -Raw -LiteralPath $Path
    return $raw | ConvertFrom-Json -Depth 50
}

function Get-ObjectKeys {
    param([AllowNull()]$Object)
    if ($null -eq $Object) { return @() }
    if ($Object -is [System.Collections.IDictionary]) { return ,@($Object.Keys) }
    return ,@($Object.PSObject.Properties | ForEach-Object { $_.Name })
}

function Get-ObjectValue {
    param([AllowNull()]$Object, [Parameter(Mandatory = $true)][string]$Key)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Key)) {
            $value = $Object[$Key]
            $isArray = ($value -is [System.Collections.IEnumerable]) -and -not ($value -is [string]) -and -not ($value -is [System.Collections.IDictionary]) -and -not ($value -is [pscustomobject])
            if ($isArray) { return ,@($value) }
            return $value
        }
        return $null
    }
    $prop = $Object.PSObject.Properties[$Key]
    if ($prop) {
        $value = $prop.Value
        $isArray = ($value -is [System.Collections.IEnumerable]) -and -not ($value -is [string]) -and -not ($value -is [System.Collections.IDictionary]) -and -not ($value -is [pscustomobject])
        if ($isArray) { return ,@($value) }
        return $value
    }
    return $null
}

function Merge-Objects {
    param(
        [AllowNull()]$Base,
        [AllowNull()]$Overlay
    )

    $baseIsArray = ($Base -is [System.Collections.IEnumerable]) -and -not ($Base -is [string]) -and -not ($Base -is [System.Collections.IDictionary]) -and -not ($Base -is [pscustomobject])
    $overlayIsArray = ($Overlay -is [System.Collections.IEnumerable]) -and -not ($Overlay -is [string]) -and -not ($Overlay -is [System.Collections.IDictionary]) -and -not ($Overlay -is [pscustomobject])

    if ($null -eq $Overlay) {
        if ($baseIsArray) { return ,@($Base) }
        return $Base
    }
    if ($null -eq $Base) {
        if ($overlayIsArray) { return ,@($Overlay) }
        return $Overlay
    }

    if ($Overlay -is [string] -and $Overlay -eq "AUTO") {
        return $Overlay
    }

    if ($overlayIsArray) {
        return ,@($Overlay)
    }

    $overlayIsObject = ($Overlay -is [System.Collections.IDictionary]) -or ($Overlay -is [pscustomobject])
    if (-not $overlayIsObject) {
        return $Overlay
    }

    $baseIsObject = ($Base -is [System.Collections.IDictionary]) -or ($Base -is [pscustomobject])
    if (-not $baseIsObject) {
        return $Overlay
    }

    $baseKeys = Get-ObjectKeys -Object $Base
    $overlayKeys = Get-ObjectKeys -Object $Overlay
    if (@($baseKeys).Count -gt 0 -or @($overlayKeys).Count -gt 0) {
        $result = [ordered]@{}
        $allKeys = @($baseKeys + $overlayKeys | Select-Object -Unique)
        foreach ($key in $allKeys) {
            $baseVal = Get-ObjectValue -Object $Base -Key $key
            $overlayVal = Get-ObjectValue -Object $Overlay -Key $key
            if ($null -eq $overlayVal) {
                $result[$key] = $baseVal
            }
            else {
                $result[$key] = Merge-Objects -Base $baseVal -Overlay $overlayVal
            }
        }
        return [pscustomobject]$result
    }

    return $Overlay
}

function Resolve-ArtifactPolicy {
    param(
        [AllowNull()]$JobPolicy,
        [AllowNull()]$RequestPolicy
    )
    $policy = Merge-Objects -Base $JobPolicy -Overlay $RequestPolicy
    if (-not $policy) { return $policy }

    $requiredNames = @()
    $reqArtifacts = Get-ObjectValue -Object $policy -Key "required_artifacts"
    if ($reqArtifacts) {
        foreach ($entry in @($reqArtifacts)) {
            if ($entry -is [string]) {
                $requiredNames += $entry
            }
            else {
                $name = Get-ObjectValue -Object $entry -Key "name"
                if ($name) { $requiredNames += $name }
            }
        }
    }

    if ($requiredNames.Count -gt 0) {
        if ($policy -is [System.Collections.IDictionary]) {
            $policy["required"] = @($requiredNames | Select-Object -Unique)
        }
        else {
            $policy | Add-Member -NotePropertyName "required" -NotePropertyValue (@($requiredNames | Select-Object -Unique)) -Force
        }
    }

    return $policy
}

function Resolve-CommandPolicy {
    param(
        [AllowNull()]$JobPolicy,
        [AllowNull()]$RequestPolicy
    )
    $policy = Merge-Objects -Base $JobPolicy -Overlay $RequestPolicy
    if (-not $policy) { return $policy }

    $minConfidence = Get-ObjectValue -Object $policy -Key "min_confidence_auto_run"
    if (-not $minConfidence) { $minConfidence = 0.7 }

    $allowedSources = Get-ObjectValue -Object $policy -Key "allowed_sources"
    $allowConvention = $false
    if ($allowedSources) {
        foreach ($src in @($allowedSources)) {
            $name = Get-ObjectValue -Object $src -Key "source"
            if ($name -eq "convention") { $allowConvention = $true }
        }
    }

    $thresholds = [pscustomobject]@{
        min_confidence_auto_run = [double]$minConfidence
        allow_convention = [bool]$allowConvention
    }

    if ($policy -is [System.Collections.IDictionary]) {
        $policy["thresholds"] = $thresholds
    }
    else {
        $policy | Add-Member -NotePropertyName "thresholds" -NotePropertyValue $thresholds -Force
    }

    return $policy
}

function Remove-NullProperties {
    param([AllowNull()]$Value)

    if ($null -eq $Value) { return $null }
    if ($Value -is [string]) { return [string]$Value }

    if ($Value -is [System.Collections.IDictionary]) {
        $clean = [ordered]@{}
        foreach ($key in $Value.Keys) {
            $next = Remove-NullProperties -Value $Value[$key]
            if ($null -ne $next) { $clean[$key] = $next }
        }
        return [pscustomobject]$clean
    }

    if ($Value -is [pscustomobject]) {
        $clean = [ordered]@{}
        foreach ($prop in $Value.PSObject.Properties) {
            $next = Remove-NullProperties -Value $prop.Value
            if ($null -ne $next) { $clean[$prop.Name] = $next }
        }
        return [pscustomobject]$clean
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        $items = @()
        foreach ($entry in $Value) {
            $next = Remove-NullProperties -Value $entry
            if ($null -ne $next) { $items += $next }
        }
        return ,$items
    }

    return $Value
}

function New-ExpandedContract {
    param(
        [Parameter(Mandatory = $true)]$Request,
        [Parameter(Mandatory = $true)]$JobConfig,
        [Parameter(Mandatory = $true)]$Pipeline
    )

    $jobType = Get-ObjectValue -Object $Request -Key "job_type"
    if (-not $jobType) {
        throw "Request is missing job_type"
    }

    $defaults = $JobConfig.defaults
    $defaultsSchema = Get-ObjectValue -Object $defaults -Key "schema_version"
    $defaultsBudget = Get-ObjectValue -Object $defaults -Key "budget"
    $defaultsLogging = Get-ObjectValue -Object $defaults -Key "logging"

    $reqSchemaVersion = Get-ObjectValue -Object $Request -Key "schema_version"
    $reqRunId = Get-ObjectValue -Object $Request -Key "run_id"
    $reqGoal = Get-ObjectValue -Object $Request -Key "goal"
    $reqAgentRoster = Get-ObjectValue -Object $Request -Key "agent_roster"
    $reqBudget = Get-ObjectValue -Object $Request -Key "budget"
    $reqLogging = Get-ObjectValue -Object $Request -Key "logging"
    $reqStages = Get-ObjectValue -Object $Request -Key "stages"
    $reqMetadata = Get-ObjectValue -Object $Request -Key "metadata"

    $base = [ordered]@{
        schema_version = $(if ($reqSchemaVersion) { $reqSchemaVersion } elseif ($defaultsSchema) { $defaultsSchema } else { "1.0" })
        job_type = $jobType
        run_id = $(if ($reqRunId) { $reqRunId } else { "AUTO" })
        goal = $reqGoal
        agent_roster = $(if ($reqAgentRoster) { $reqAgentRoster } else { $JobConfig.default_agents })
        budget = $(if ($reqBudget) { $reqBudget } elseif ($defaultsBudget) { $defaultsBudget } else { $null })
        logging = $(if ($reqLogging) { $reqLogging } elseif ($defaultsLogging) { $defaultsLogging } else { $null })
        gate_policy = $JobConfig.gate_policy
        artifact_policy = $JobConfig.artifact_policy
        command_policy = $JobConfig.command_policy
        supervisor_policy = $JobConfig.supervisor_policy
        stages = $(if ($reqStages) { $reqStages } else { @($Pipeline.stages | ForEach-Object { $_.id }) })
        metadata = $reqMetadata
    }

    if ($JobConfig.contract_defaults) {
        $base = Merge-Objects -Base $base -Overlay $JobConfig.contract_defaults
    }

    $merged = Merge-Objects -Base $base -Overlay $Request

    $merged.gate_policy = Merge-Objects -Base $JobConfig.gate_policy -Overlay $merged.gate_policy
    $merged.artifact_policy = Resolve-ArtifactPolicy -JobPolicy $JobConfig.artifact_policy -RequestPolicy $merged.artifact_policy
    $merged.command_policy = Resolve-CommandPolicy -JobPolicy $JobConfig.command_policy -RequestPolicy $merged.command_policy

    $merged.job_type = $jobType
    if (-not $merged.goal) {
        throw "Request is missing goal"
    }

    return (Remove-NullProperties -Value $merged)
}

function Invoke-ContractCompiler {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RequestPath,
        [Parameter(Mandatory = $true)][string]$JobTypesPath,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$OutputDir
    )

    if (-not (Test-Path -LiteralPath $RequestPath)) {
        throw "Request file not found: $RequestPath"
    }

    $request = Read-JsonFile -Path $RequestPath
    $jobType = Get-ObjectValue -Object $request -Key "job_type"
    if (-not $jobType) {
        throw "Request is missing job_type"
    }

    $routerPath = Join-Path $RepoRoot "supervisor\\job_router.ps1"
    if (-not (Test-Path -LiteralPath $routerPath)) {
        throw "Job router not found at $routerPath"
    }
    . $routerPath

    $validatorPath = Join-Path $RepoRoot "supervisor\\contract_validator.ps1"
    if (-not (Test-Path -LiteralPath $validatorPath)) {
        throw "Contract validator not found at $validatorPath"
    }
    . $validatorPath

    $jobConfig = Get-JobTypeConfig -JobType $jobType -RegistryPath $JobTypesPath
    $requestSchemaPath = $jobConfig.request_schema
    if (-not $requestSchemaPath) {
        throw "Job type '$jobType' missing request_schema"
    }
    $requestSchemaPath = Resolve-RepoPath -Path $requestSchemaPath -RepoRoot $RepoRoot

    $requestValidation = Test-Contract -ContractPath $RequestPath -SchemaPath $requestSchemaPath -ExpectedJobType $jobType
    if (-not $requestValidation.Ok) {
        throw ("Request validation failed: " + ($requestValidation.Errors -join "; "))
    }

    $pipelinePath = Resolve-RepoPath -Path $jobConfig.pipeline_template -RepoRoot $RepoRoot
    $pipeline = Get-PipelineTemplate -TemplatePath $pipelinePath

    $expanded = New-ExpandedContract -Request $request -JobConfig $jobConfig -Pipeline $pipeline

    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    $contractPath = Join-Path $OutputDir "resolved_contract.json"
    $expanded | ConvertTo-Json -Depth 50 | Set-Content -Path $contractPath -Encoding UTF8

    $contractSchema = if ($jobConfig.contract_schema) { $jobConfig.contract_schema } else { $jobConfig.schema }
    if (-not $contractSchema) {
        throw "Job type '$jobType' missing contract_schema"
    }
    $contractSchemaPath = Resolve-RepoPath -Path $contractSchema -RepoRoot $RepoRoot

    $contractValidation = Test-Contract -ContractPath $contractPath -SchemaPath $contractSchemaPath -ExpectedJobType $jobType
    if (-not $contractValidation.Ok) {
        throw ("Expanded contract validation failed: " + ($contractValidation.Errors -join "; "))
    }

    return [pscustomobject]@{
        Request = $request
        RequestPath = $RequestPath
        RequestSchemaPath = $requestSchemaPath
        Contract = $contractValidation.Contract
        ContractPath = $contractPath
        ContractSchemaPath = $contractSchemaPath
        ContractHash = $contractValidation.ContractHash
        PipelineTemplatePath = $pipelinePath
    }
}
