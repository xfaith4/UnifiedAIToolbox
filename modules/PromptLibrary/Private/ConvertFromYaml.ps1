#requires -Version 5.1

if (-not (Get-Command ConvertFrom-Yaml -ErrorAction SilentlyContinue)) {
    $assemblyPath = Join-Path $PSScriptRoot '..' 'lib' 'YamlDotNet.dll'
    if (-not (Test-Path -LiteralPath $assemblyPath)) {
        throw "YamlDotNet.dll not found at $assemblyPath."
    }

    Add-Type -Path $assemblyPath | Out-Null
    $script:YamlDeserializer = [YamlDotNet.Serialization.DeserializerBuilder]::new().
        IgnoreUnmatchedProperties().
        Build()

    function ConvertFrom-YamlInternal {
        param($Value)

        switch ($Value) {
            { $_ -is [System.Collections.IDictionary] } {
                $ordered = [ordered]@{}
                foreach ($key in $_.Keys) {
                    $ordered[[string]$key] = ConvertFrom-YamlInternal $_[$key]
                }
                return [pscustomobject]$ordered
            }
            { $_ -is [System.Collections.IEnumerable] -and -not ($_ -is [string]) } {
                return @(
                    foreach ($item in $_) {
                        ConvertFrom-YamlInternal $item
                    }
                )
            }
            default {
                return $Value
            }
        }
    }

    function ConvertFrom-Yaml {
        [CmdletBinding()]
        param(
            [Parameter(Mandatory, ValueFromPipeline, Position = 0)][string]$Yaml
        )

        $data = $script:YamlDeserializer.Deserialize([string]$Yaml)
        ConvertFrom-YamlInternal $data
    }
}
