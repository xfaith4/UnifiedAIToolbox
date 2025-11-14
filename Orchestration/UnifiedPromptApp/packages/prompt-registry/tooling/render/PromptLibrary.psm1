#Requires -Version 5.1
using namespace System.Collections
using namespace System.Collections.Specialized

function ConvertFrom-Yaml {
    [CmdletBinding()]
    param([Parameter(Mandatory,ValueFromPipeline)][string]$Yaml)
    
    # Use Python's YAML parser as a fallback when powershell-yaml is not available
    try {
        $pythonCmds = @('python3','python','py')
        $python = $null
        foreach ($cmd in $pythonCmds) {
            if (Get-Command $cmd -ErrorAction SilentlyContinue) {
                $python = $cmd
                break
            }
        }
        if (-not $python) {
            throw "Python interpreter not found. Install Python 3 or ensure it is on PATH."
        }

        # Pass YAML via stdin to avoid file path injection concerns
        $json = $Yaml | & $python -c "import yaml, json, sys; print(json.dumps(yaml.safe_load(sys.stdin.read())))" 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            throw "Python YAML parsing failed: $json"
        }
        
        return ($json | ConvertFrom-Json)
    } catch {
        throw "YAML parse failed: $($_.Exception.Message)"
    }
}

function ConvertFrom-YamlSafe {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Yaml)
    try { return ($Yaml | ConvertFrom-Yaml) } catch { throw "YAML parse failed: $($_.Exception.Message)" }
}

function ConvertTo-Hashtable {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$InputObject)

    if ($null -eq $InputObject) { throw "Input to ConvertTo-Hashtable is null." }

    # Already IDictionary (Hashtable/OrderedDictionary/IDictionary) -> plain Hashtable
    if ($InputObject -is [IDictionary]) {
        $ht = @{}
        foreach ($k in $InputObject.Keys) {
            $ht[$k] = ConvertTo-Hashtable -InputObject $InputObject[$k]
        }
        return $ht
    }

    # PSCustomObject -> Hashtable
    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $ht = @{}
        foreach ($p in $InputObject.PSObject.Properties) {
            $ht[$p.Name] = ConvertTo-Hashtable -InputObject $p.Value
        }
        return $ht
    }

    # Arrays / enumerables (except string)
    if ($InputObject -isnot [string] -and $InputObject -is [IEnumerable]) {
        $tmp = @($InputObject)

        # Collapse single-element wrappers like [ @{...} ]
        if ($tmp.Count -eq 1 -and ($tmp[0] -is [IDictionary] -or $tmp[0] -is [System.Management.Automation.PSCustomObject])) {
            return ConvertTo-Hashtable -InputObject $tmp[0]
        }

        $arr = New-Object System.Collections.ArrayList
        foreach ($item in $tmp) { [void]$arr.Add( (ConvertTo-Hashtable -InputObject $item) ) }
        return ,$arr.ToArray()
    }

    # Primitives stay as-is
    return $InputObject
}

function Get-Prompt {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { throw "Prompt not found at $($Path)" }
    $content = Get-Content -LiteralPath $Path -Raw
    $specObj = ConvertFrom-YamlSafe -Yaml $content
    $spec    = ConvertTo-Hashtable $specObj

    # *** FORCE-COERCE critical nodes to IDictionary ***
    $spec['variables'] = ConvertTo-Hashtable $spec['variables']
    $spec['blocks']    = ConvertTo-Hashtable $spec['blocks']

    return $spec
}

function Test-PromptVars {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Spec,
        [Parameter(Mandatory)]
        [Alias('Input')]
        $InputData
    )
    $specHt = ($Spec  -is [IDictionary]) ? $Spec  : (ConvertTo-Hashtable $Spec)
    $inHt   = ConvertTo-Hashtable $InputData  # Always convert to ensure we have a Hashtable, not OrderedDictionary

    # Ensure variables node is an IDictionary
    $vars = ConvertTo-Hashtable $specHt['variables']

    foreach ($name in $vars.Keys) {
        $rule = $vars[$name]
        if ($rule.required -and -not $inHt.ContainsKey($name)) {
            throw "Missing required variable '$($name)'."
        }
        if ($inHt.ContainsKey($name) -and $null -ne $rule.validators) {
            foreach ($v in $rule.validators) {
                if ($v.ContainsKey('regex') -and ($inHt[$name] -notmatch $v.regex)) {
                    throw "Variable '$($name)' failed regex validator."
                }
                if ($v.ContainsKey('enum')  -and ($inHt[$name] -notin  $v.enum))  {
                    throw "Variable '$($name)' must be one of: $($v.enum -join ', ')"
                }
            }
        }
    }
    return $true
}

function Invoke-Prompt {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Spec,
        [Parameter(Mandatory)]
        [Alias('Input')]
        $InputData
    )
    $specHt = ($Spec  -is [IDictionary]) ? $Spec  : (ConvertTo-Hashtable $Spec)
    $inHt   = ConvertTo-Hashtable $InputData  # Always convert to ensure we have a Hashtable, not OrderedDictionary

    # Normalize nodes that we index into
    $blocksNode = ConvertTo-Hashtable $specHt['blocks']

    Test-PromptVars -Spec $specHt -Input $inHt | Out-Null

    $blockKeys = @('system','instructions','constraints','style')
    $rendered  = [ordered]@{}

    foreach ($b in $blockKeys) {
        if (-not ($blocksNode.ContainsKey($b))) { continue }
        $text = [string]$blocksNode[$b]
        foreach ($k in $inHt.Keys) {
            $pattern = "\$\{" + [regex]::Escape($k) + "\}"
            $text    = [regex]::Replace($text, $pattern, [string]$inHt[$k])
        }
        $rendered[$b] = $text
    }

    if ($inHt.ContainsKey('include_mos_detail') -and $inHt.include_mos_detail -and $blocksNode.ContainsKey('mos_detail')) {
        $rendered['instructions'] = ($rendered['instructions'] + "`n`n" + $blocksNode['mos_detail']).Trim()
    }

    [pscustomobject]@{
        id        = $specHt.id
        version   = $specHt.version
        messages  = @(
            @{ role = 'system'; content = $rendered.system },
            @{ role = 'user';   content = $rendered.instructions },
            @{ role = 'user';   content = $rendered.constraints },
            @{ role = 'user';   content = $rendered.style }
        ) | Where-Object { $_.content }
        telemetry = $specHt.telemetry
        models    = $specHt.models
    }
}

Set-Alias -Name Render-Prompt -Value Invoke-Prompt -Force
Export-ModuleMember -Function Get-Prompt, Test-PromptVars, Invoke-Prompt, ConvertFrom-Yaml, ConvertTo-Hashtable
Export-ModuleMember -Alias Render-Prompt
