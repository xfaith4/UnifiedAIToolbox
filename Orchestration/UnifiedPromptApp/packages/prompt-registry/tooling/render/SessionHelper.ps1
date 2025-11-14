# Use-Prompt: session-only renderer that ignores module quirks and just works.
# - Reads YAML spec
# - Normalizes blocks/variables
# - Safely expands ${var} using your hashtable
# - Returns messages you can send to the LLM

function ConvertTo-Map {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$InputObject)

    if ($null -eq $InputObject) { return $null }

    if ($InputObject -is [System.Collections.IDictionary]) {
        $ht = @{}
        foreach ($k in $InputObject.Keys) { $ht[$k] = ConvertTo-Map $InputObject[$k] }
        return $ht
    }

    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $ht = @{}
        foreach ($p in $InputObject.PSObject.Properties) { $ht[$p.Name] = ConvertTo-Map $p.Value }
        return $ht
    }

    if ($InputObject -isnot [string] -and $InputObject -is [System.Collections.IEnumerable]) {
        $arr = @($InputObject)

        # unwrap single-element wrappers like [ @{...} ]
        if ($arr.Count -eq 1 -and ($arr[0] -is [System.Collections.IDictionary] -or
                                   $arr[0] -is [System.Management.Automation.PSCustomObject])) {
            return ConvertTo-Map $arr[0]
        }

        # otherwise normalize each element
        $out = New-Object System.Collections.ArrayList
        foreach ($item in $arr) { [void]$out.Add( (ConvertTo-Map $item) ) }
        return ,$out.ToArray()
    }

    return $InputObject
}

function Join-Block {
    param($Value)
    if ($Value -is [string]) { return $Value }
    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        return (@($Value) -join "`n")  # join multi-line arrays safely
    }
    return [string]$Value
}

function Expand-Template {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][System.Collections.IDictionary]$Vars
    )
    $rx = [regex]'\$\{([A-Za-z0-9_]+)\}'
    return $rx.Replace($Text, {
        param($m)
        $name = $m.Groups[1].Value
        if ($Vars.ContainsKey($name)) { [string]$Vars[$name] } else { $m.Value }
    })
}

function Use-Prompt {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,                  # *.prompt.yaml
        [Parameter(Mandatory)][System.Collections.IDictionary]$Vars  # hashtable / ordered dict
    )

    if (-not (Get-Module -ListAvailable powershell-yaml)) {
        throw "Missing module powershell-yaml. Install-Module powershell-yaml -Scope CurrentUser -Force"
    }

    # Load + normalize spec
    $raw  = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Yaml
    $spec = ConvertTo-Map $raw

    $blocks = ConvertTo-Map $spec.blocks
    $vars   = ConvertTo-Map $Vars

    # Render core blocks
    $keys = @('system','instructions','constraints','style')
    $rendered = [ordered]@{}

    foreach ($k in $keys) {
        if ($blocks -and $blocks.ContainsKey($k)) {
            $rawText = Join-Block $blocks[$k]
            $rendered[$k] = Expand-Template -Text $rawText -Vars $vars
        }
    }

    # Optional MOS detail append
    if ($vars.ContainsKey('include_mos_detail') -and $vars.include_mos_detail -and $blocks.ContainsKey('mos_detail')) {
        $mos = Join-Block $blocks['mos_detail']
        $rendered['instructions'] = (($rendered['instructions'] + "`n`n" + $mos) -as [string]).Trim()
    }

    # Build messages payload
    $messages = @()
    if ($rendered.system)        { $messages += @{ role = 'system'; content = $rendered.system } }
    if ($rendered.instructions)  { $messages += @{ role = 'user';   content = $rendered.instructions } }
    if ($rendered.constraints)   { $messages += @{ role = 'user';   content = $rendered.constraints } }
    if ($rendered.style)         { $messages += @{ role = 'user';   content = $rendered.style } }

    [pscustomobject]@{
        id       = $spec.id
        version  = $spec.version
        messages = $messages
        models   = $spec.models
    }
}

$specPath = 'G:\Development\20_Staging\Ideal Prompt Library\prompts\catalog\analytics\divisions.performance.summary.prompt.yaml'
$vars     = [ordered]@{ division='Medicare'; month='2025-10'; include_mos_detail=$true }

$out = Use-Prompt -Path $specPath -Vars $vars
($out.messages | Select-Object -ExpandProperty content) -join "`n"  # should show Medicare and 2025-10

<###
Render any prompt to a messages array:
#>
$specPath = 'G:\Development\20_Staging\Ideal Prompt Library\prompts\catalog\analytics\divisions.performance.summary.prompt.yaml'
$vars     = [ordered]@{ division='Medicare'; month='2025-10'; include_mos_detail=$true }
$out      = Use-Prompt -Path $specPath -Vars $vars
$out.messages           # ready to send to your LLM client
