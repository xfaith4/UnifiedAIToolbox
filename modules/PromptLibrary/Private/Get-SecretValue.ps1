#requires -Version 5.1
function Get-SecretValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$ProvidersJsonPath = (Join-Path $Script:RepoRoot 'providers.json')
    )
    $envName = $Name.ToUpper().Replace('-','_')
    $envValue = [Environment]::GetEnvironmentVariable($envName)
    if ($envValue) { return $envValue }
    if (Test-Path -LiteralPath $ProvidersJsonPath) {
        try {
            $doc = Get-Content -Raw -LiteralPath $ProvidersJsonPath | ConvertFrom-Json
            if ($Name -like '*:*') { $p,$k = $Name.Split(':',2); $node = $doc.$p; if ($node -and $node.$k) { return [string]$node.$k } }
            else { foreach ($prop in $doc.PSObject.Properties.Name) { $node = $doc.$prop; if ($node -and $node.$Name) { return [string]$node.$Name } } }
        } catch {
            Write-Verbose ("Failed to read providers from {0}: {1}" -f $ProvidersJsonPath, $_)
        }
    }
    return $null
}
