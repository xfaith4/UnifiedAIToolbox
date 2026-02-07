# Supervisor Job Router
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return (Join-Path $RepoRoot $Path)
}

function Get-JobTypeRegistry {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$RegistryPath)

    if (-not (Test-Path -LiteralPath $RegistryPath)) {
        throw "Job type registry not found: $RegistryPath"
    }

    $raw = Get-Content -Raw -LiteralPath $RegistryPath
    $registry = $raw | ConvertFrom-Json -Depth 20
    if (-not $registry.job_types) {
        throw "Job type registry is missing 'job_types'"
    }
    return $registry
}

function Get-JobTypeConfig {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$JobType,
        [Parameter(Mandatory = $true)][string]$RegistryPath
    )

    $registry = Get-JobTypeRegistry -RegistryPath $RegistryPath
    $jobTypes = $registry.job_types

    if (-not ($jobTypes.PSObject.Properties.Name -contains $JobType)) {
        $known = $jobTypes.PSObject.Properties.Name -join ", "
        throw "Unknown job_type '$JobType'. Known job types: $known"
    }

    return $jobTypes.$JobType
}

function Get-PipelineTemplate {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$TemplatePath)

    if (-not (Test-Path -LiteralPath $TemplatePath)) {
        throw "Pipeline template not found: $TemplatePath"
    }

    $raw = Get-Content -Raw -LiteralPath $TemplatePath
    $template = $raw | ConvertFrom-Json -Depth 20
    if (-not $template.stages) {
        throw "Pipeline template missing stages: $TemplatePath"
    }
    return $template
}

function Resolve-StagePlan {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Pipeline,
        [Parameter(Mandatory = $true)]$Contract
    )

    $stageDefs = @($Pipeline.stages)
    $stageMap = @{}
    foreach ($stage in $stageDefs) {
        $stageId = $stage.id
        if (-not $stageId) {
            throw "Pipeline stage missing id"
        }
        $stageMap[$stageId] = $stage
    }

    if ($Contract -and $Contract.stages) {
        $requested = @($Contract.stages)
        $resolved = @()
        foreach ($stageId in $requested) {
            if (-not $stageMap.ContainsKey($stageId)) {
                throw "Contract requested unknown stage '$stageId'"
            }
            $resolved += $stageMap[$stageId]
        }
        return $resolved
    }

    return $stageDefs
}

function Test-StagePolicy {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$StagePolicy,
        [Parameter(Mandatory = $true)][string[]]$StageIds
    )

    $errors = @()
    $required = @()
    $forbidden = @()

    if ($StagePolicy.required) { $required = @($StagePolicy.required) }
    if ($StagePolicy.forbidden) { $forbidden = @($StagePolicy.forbidden) }

    foreach ($req in $required) {
        if (-not ($StageIds -contains $req)) {
            $errors += "Missing required stage '$req'"
        }
    }

    foreach ($ban in $forbidden) {
        if ($StageIds -contains $ban) {
            $errors += "Forbidden stage '$ban' is not allowed for this job type"
        }
    }

    return [pscustomobject]@{
        Ok = ($errors.Count -eq 0)
        Errors = $errors
    }
}

function Resolve-JobRouting {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$JobType,
        [Parameter(Mandatory = $true)][string]$JobTypesPath,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)]$Contract
    )

    $jobConfig = Get-JobTypeConfig -JobType $JobType -RegistryPath $JobTypesPath

    $contractSchema = if ($jobConfig.contract_schema) { $jobConfig.contract_schema } else { $jobConfig.schema }
    if (-not $contractSchema) {
        throw "Job type config missing contract_schema"
    }
    $schemaPath = Resolve-RepoPath -Path $contractSchema -RepoRoot $RepoRoot
    $requestSchemaPath = $null
    if ($jobConfig.request_schema) {
        $requestSchemaPath = Resolve-RepoPath -Path $jobConfig.request_schema -RepoRoot $RepoRoot
    }
    $pipelinePath = Resolve-RepoPath -Path $jobConfig.pipeline_template -RepoRoot $RepoRoot
    $pipeline = Get-PipelineTemplate -TemplatePath $pipelinePath

    if ($Contract -and $Contract.stages -and $jobConfig.stage_policy -and $jobConfig.stage_policy.forbidden) {
        foreach ($stageId in @($Contract.stages)) {
            if ($jobConfig.stage_policy.forbidden -contains $stageId) {
                throw "Forbidden stage '$stageId' is not allowed for this job type"
            }
        }
    }

    $stages = Resolve-StagePlan -Pipeline $pipeline -Contract $Contract
    $stageIds = @($stages | ForEach-Object { $_.id })

    $policyCheck = Test-StagePolicy -StagePolicy $jobConfig.stage_policy -StageIds $stageIds
    if (-not $policyCheck.Ok) {
        throw ("Stage policy violation: " + ($policyCheck.Errors -join "; "))
    }

    $defaultAgents = $jobConfig.default_agents
    if (-not $defaultAgents) { $defaultAgents = $jobConfig.default_agent_roster }

    return [pscustomobject]@{
        JobType = $JobType
        SchemaPath = $schemaPath
        RequestSchemaPath = $requestSchemaPath
        PipelineTemplatePath = $pipelinePath
        Pipeline = $pipeline
        Stages = $stages
        StageIds = $stageIds
        DefaultAgentRoster = $defaultAgents
        GatePolicy = $jobConfig.gate_policy
        ArtifactPolicy = $jobConfig.artifact_policy
        CommandPolicy = $jobConfig.command_policy
        SupervisorPolicy = $jobConfig.supervisor_policy
        ContractDefaults = $jobConfig.contract_defaults
        Defaults = $jobConfig.defaults
        StagePolicy = $jobConfig.stage_policy
    }
}
