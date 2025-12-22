### BEGIN FILE
#requires -Version 5.1
Set-StrictMode -Version Latest

# Module: DagBuilder.psm1
# Purpose: Define minimal contracts and bootstrap stubs for the Agentic AI Orchestrator DAG builder.
# Notes: PS 5.1 + 7+ compatible; no external deps. Inline comments explain intent.

class AOPlan {
    [string]   $Name
    [hashtable]$Inputs
    AOPlan([string]$Name, [hashtable]$Inputs) {
        $this.Name   = $Name
        $this.Inputs = $Inputs
    }
}

class AONode {
    [string]   $Id
    [string]   $Agent     # e.g. 'Researcher','Engineer','Critic'
    [string]   $Task      # short title of the node
    [string[]] $DependsOn # array of node Ids
    [hashtable]$Params    # arbitrary parameters for the agent/tool
    AONode([string]$Id,[string]$Agent,[string]$Task,[string[]]$DependsOn,[hashtable]$Params){
        $this.Id        = $Id
        $this.Agent     = $Agent
        $this.Task      = $Task
        $this.DependsOn = $DependsOn
        $this.Params    = $Params
    }
}

class AODag {
    [string]    $PlanName
    [AONode[]]  $Nodes
    [int]       $Concurrency
    AODag([string]$PlanName,[AONode[]]$Nodes,[int]$Concurrency){
        $this.PlanName   = $PlanName
        $this.Nodes      = $Nodes
        $this.Concurrency= $Concurrency
    }
}

function New-AOPlan {
    <#
    .SYNOPSIS
        Create a simple plan object from a name and inputs.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter()][hashtable]$Inputs = @{}
    )
    # Return new plan
    return [AOPlan]::new($Name, $Inputs)
}

function Convert-AOPlanToDag {
    <#
    .SYNOPSIS
        Convert a plan into a trivial DAG (linear → parallel-ready).
    .DESCRIPTION
        For compatibility during migration, this returns a single‑branch DAG that
        mirrors the existing linear flow. Non‑dependent nodes can be added over time.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AOPlan]$Plan,
        [int]$Concurrency = 3
    )
    # Build nodes (IDs must be deterministic)
    $nodes = @(
        [AONode]::new('refine','Refiner','Refine Prompt',@(),@{ mode='cross-model' }),
        [AONode]::new('execute','Engineer','Execute Task',@('refine'),@{}),
        [AONode]::new('review','Critic','Review Results',@('execute'),@{}),
        [AONode]::new('synthesize','Synthesizer','Synthesize Output',@('review'),@{}),
        [AONode]::new('deliver','Commissioner','Deliver & Score',@('synthesize'),@{})
    )
    return [AODag]::new($Plan.Name, $nodes, $Concurrency)
}

function Start-AODag {
    <#
    .SYNOPSIS
        Emit a manifest‑ready run structure from a DAG (no model calls yet).
    .DESCRIPTION
        This stub validates the DAG, topologically sorts nodes, and outputs a hashtable
        shaped for Manifest v2. Integrate real execution later.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AODag]$Dag
    )
    # Validate DAG dependencies
    $ids = $Dag.Nodes.Id
    foreach($n in $Dag.Nodes){
        foreach($d in $n.DependsOn){
            if($ids -notcontains $d){
                throw \"Invalid DAG: node '$($n.Id)' depends on missing '$($d)'.\"
            }
        }
    }

    # Topological order (Kahn's algorithm, simplified)
    $deps = @{} ; foreach($n in $Dag.Nodes){ $deps[$n.Id] = [System.Collections.Generic.HashSet[string]]::new()
        foreach($d in $n.DependsOn){ [void]$deps[$n.Id].Add($d) } }
    $ready = [System.Collections.Generic.Queue[string]]::new()
    foreach($id in $ids){ if($deps[$id].Count -eq 0){ $ready.Enqueue($id) } }
    $order = @()
    while($ready.Count -gt 0){
        $id = $ready.Dequeue()
        $order += $id
        foreach($n in $Dag.Nodes){
            if($deps[$n.Id].Contains($id)){
                [void]$deps[$n.Id].Remove($id)
                if($deps[$n.Id].Count -eq 0){ $ready.Enqueue($n.Id) }
            }
        }
    }
    if($order.Count -ne $Dag.Nodes.Count){
        throw \"Invalid DAG: cycle detected.\"
    }

    # Build manifest‑v2‑like structure
    $now = [DateTime]::UtcNow.ToString('O')
    $nodesOut = foreach($n in $Dag.Nodes){
        [ordered]@{
            id        = $n.Id
            agent     = $n.Agent
            task      = $n.Task
            dependsOn = $n.DependsOn
            status    = 'planned'    # will become queued/running/completed
            params    = $n.Params
        }
    }
    $manifest = [ordered]@{
        version       = 2
        timestampUtc  = $now
        planName      = $Dag.PlanName
        concurrency   = $Dag.Concurrency
        dag           = [ordered]@{
            order = $order
            nodes = $nodesOut
        }
        sustainability = @{ kWh = $null; gCO2e = $null; waterL = $null }
        costs          = @{ estimatedUSD = $null }
    }
    return $manifest
}

Export-ModuleMember -Function New-AOPlan, Convert-AOPlanToDag, Start-AODag
### END FILE