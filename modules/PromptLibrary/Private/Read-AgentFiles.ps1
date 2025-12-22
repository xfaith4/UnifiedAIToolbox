#requires -Version 5.1
function Get-AgentFile {
    <#
    .SYNOPSIS
      Load agent definitions from JSON or YAML and normalize to a common shape.
    .OUTPUTS
      Objects with: id,name,role,prompt,capabilities,style,constraints,io_contract,routing_hints,checksum,_Path,_Raw
    #>
    [CmdletBinding()]
    param(
        [string]$Root = (Join-Path $Script:DataRoot 'agents')
    )

    if (-not (Test-Path -LiteralPath $Root)) { return @() }

    $files = Get-ChildItem -LiteralPath $Root -Recurse -File -Include *.json,*.yml,*.yaml -ErrorAction SilentlyContinue
    $out = foreach ($f in $files) {
        $raw = Get-Content -LiteralPath $f.FullName -Raw
        $ext = [IO.Path]::GetExtension($f.Name).ToLowerInvariant()
        try {
            switch ($ext) {
                '.json' {
                    $doc = $raw | ConvertFrom-Json
                    # Two common shapes: { Agents: [ ... ] } or a single agent object
                    $agents = @()
                    if ($doc -and $doc.PSObject.Properties.Name -contains 'Agents') { $agents = @($doc.Agents) }
                    else { $agents = @($doc) }

                    foreach ($a in $agents) {
                        # Normalize
                        $name  = $a.name
                        $role  = $a.role
                        $prompt= $a.prompt

                        [pscustomobject]@{
                            id             = ("ag_" + ($name -replace '[^\w\-]','-').ToLower())
                            name           = $name
                            role           = $role
                            prompt         = $prompt
                            capabilities   = @($a.capabilities)
                            style          = $a.style
                            constraints    = @($a.constraints)
                            io_contract    = $a.io_contract
                            routing_hints  = $a.routing_hints
                            checksum       = (Get-ContentHash -Text ($role + "`n---`n" + $prompt))
                            _Path          = $f.FullName
                            _Raw           = $raw
                        }
                    }
                }
                default {
                    # YAML
                    $doc = ConvertFrom-Yaml -Yaml $raw
                    $agents = @()
                    if ($doc -and $doc.PSObject.Properties.Name -contains 'Agents') { $agents = @($doc.Agents) }
                    else { $agents = @($doc) }

                    foreach ($a in $agents) {
                        [pscustomobject]@{
                            id             = ("ag_" + ($a.name -replace '[^\w\-]','-').ToLower())
                            name           = $a.name
                            role           = $a.role
                            prompt         = $a.prompt
                            capabilities   = @($a.capabilities)
                            style          = $a.style
                            constraints    = @($a.constraints)
                            io_contract    = $a.io_contract
                            routing_hints  = $a.routing_hints
                            checksum       = (Get-ContentHash -Text ($a.role + "`n---`n" + $a.prompt))
                            _Path          = $f.FullName
                            _Raw           = $raw
                        }
                    }
                }
            }
        } catch {
            Write-Warning ("Skipped invalid agent file {0}: {1}" -f $f.FullName, $_)
        }
    }
    ,$out
}
