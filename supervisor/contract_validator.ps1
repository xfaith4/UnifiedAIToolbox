# Supervisor Contract Validator
$ErrorActionPreference = "Stop"

function Resolve-ContractPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$BaseDir
    )
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }
    return (Join-Path $BaseDir $Path)
}

function Get-SchemaValue {
    param(
        [Parameter(Mandatory = $true)]$Schema,
        [Parameter(Mandatory = $true)][string]$Name
    )
    if ($null -eq $Schema) { return $null }
    if ($Schema -is [System.Collections.IDictionary]) {
        return $(if ($Schema.Contains($Name)) { $Schema[$Name] } else { $null })
    }
    $prop = $Schema.PSObject.Properties[$Name]
    if ($prop) { return $prop.Value }
    return $null
}

function Has-SchemaValue {
    param(
        [Parameter(Mandatory = $true)]$Schema,
        [Parameter(Mandatory = $true)][string]$Name
    )
    if ($null -eq $Schema) { return $false }
    if ($Schema -is [System.Collections.IDictionary]) {
        return $Schema.Contains($Name)
    }
    return ($Schema.PSObject.Properties.Name -contains $Name)
}

function Get-SchemaPropertyMap {
    param([object]$Schema)
    $map = @{}
    $props = Get-SchemaValue -Schema $Schema -Name "properties"
    if ($Schema -and $props) {
        if ($props -is [System.Collections.IDictionary]) {
            foreach ($key in $props.Keys) {
                $map[$key] = $props[$key]
            }
        }
        else {
            foreach ($prop in $props.PSObject.Properties) {
                $map[$prop.Name] = $prop.Value
            }
        }
    }
    return $map
}

function Merge-Schema {
    param(
        [Parameter(Mandatory = $true)][object]$Base,
        [Parameter(Mandatory = $true)][object]$Addition
    )

    $merged = [ordered]@{}
    $merged.type = if ($Addition.type) { $Addition.type } else { $Base.type }

    $merged.properties = @{}
    $baseProps = Get-SchemaPropertyMap -Schema $Base
    $addProps = Get-SchemaPropertyMap -Schema $Addition
    foreach ($key in $baseProps.Keys) {
        $merged.properties[$key] = $baseProps[$key]
    }
    foreach ($key in $addProps.Keys) {
        $merged.properties[$key] = $addProps[$key]
    }

    $required = @()
    if ($Base.required) { $required += @($Base.required) }
    if ($Addition.required) { $required += @($Addition.required) }
    $merged.required = @($required | Select-Object -Unique)

    $addItems = Get-SchemaValue -Schema $Addition -Name "items"
    $baseItems = Get-SchemaValue -Schema $Base -Name "items"
    if ($addItems) { $merged.items = $addItems }
    elseif ($baseItems) { $merged.items = $baseItems }

    $addEnum = Get-SchemaValue -Schema $Addition -Name "enum"
    $baseEnum = Get-SchemaValue -Schema $Base -Name "enum"
    if ($addEnum) { $merged.enum = $addEnum }
    elseif ($baseEnum) { $merged.enum = $baseEnum }

    $addMinItems = Get-SchemaValue -Schema $Addition -Name "minItems"
    $baseMinItems = Get-SchemaValue -Schema $Base -Name "minItems"
    if ($addMinItems) { $merged.minItems = $addMinItems }
    elseif ($baseMinItems) { $merged.minItems = $baseMinItems }

    return [pscustomobject]$merged
}

function Resolve-Schema {
    param(
        [Parameter(Mandatory = $true)][object]$Schema,
        [Parameter(Mandatory = $true)][string]$SchemaPath
    )

    $allOf = Get-SchemaValue -Schema $Schema -Name "allOf"
    if ($allOf) {
        $base = [pscustomobject]@{ type = "object"; properties = @{}; required = @() }
        foreach ($entry in @($allOf)) {
            $refValue = Get-SchemaValue -Schema $entry -Name '$ref'
            if ($refValue) {
                $refPath = Resolve-ContractPath -Path $refValue -BaseDir (Split-Path -Parent $SchemaPath)
                if (-not (Test-Path -LiteralPath $refPath)) {
                    throw "Schema reference not found: $refPath"
                }
                $refSchema = Get-Content -Raw -LiteralPath $refPath | ConvertFrom-Json
                $refResolved = Resolve-Schema -Schema $refSchema -SchemaPath $refPath
                $base = Merge-Schema -Base $base -Addition $refResolved
            }
            else {
                $subResolved = Resolve-Schema -Schema $entry -SchemaPath $SchemaPath
                $base = Merge-Schema -Base $base -Addition $subResolved
            }
        }
        if ((Has-SchemaValue -Schema $Schema -Name "properties") -or (Has-SchemaValue -Schema $Schema -Name "required")) {
            $base = Merge-Schema -Base $base -Addition $Schema
        }
        return $base
    }

    return $Schema
}

function Test-ContractValue {
    param(
        [Parameter(Mandatory = $true)][AllowNull()]$Value,
        [Parameter(Mandatory = $true)]$Schema,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $errors = @()

    $enum = Get-SchemaValue -Schema $Schema -Name "enum"
    if ($enum) {
        if (-not ($enum -contains $Value)) {
            $errors += "$Path must be one of: $($enum -join ', ')"
        }
    }

    $schemaType = Get-SchemaValue -Schema $Schema -Name "type"
    $hasProperties = Has-SchemaValue -Schema $Schema -Name "properties"

    if ($schemaType -eq "object" -or ($hasProperties -and -not $schemaType)) {
        if ($null -eq $Value) {
            $errors += "$Path is required to be an object"
            return $errors
        }

        $props = @{}
        $schemaProps = Get-SchemaValue -Schema $Schema -Name "properties"
        if ($schemaProps) {
            if ($schemaProps -is [System.Collections.IDictionary]) {
                foreach ($key in $schemaProps.Keys) {
                    $props[$key] = $schemaProps[$key]
                }
            }
            else {
                foreach ($prop in $schemaProps.PSObject.Properties) {
                    $props[$prop.Name] = $prop.Value
                }
            }
        }

        $required = @()
        $req = Get-SchemaValue -Schema $Schema -Name "required"
        if ($req) { $required = @($req) }

        foreach ($req in $required) {
            $hasProp = $false
            if ($Value -is [System.Collections.IDictionary]) {
                $hasProp = $Value.Contains($req)
            }
            else {
                $hasProp = $Value.PSObject.Properties.Name -contains $req
            }
            if (-not $hasProp) {
                $errors += "$Path missing required field '$req'"
            }
        }

        foreach ($propName in $props.Keys) {
            $exists = $false
            $propValue = $null
            if ($Value -is [System.Collections.IDictionary]) {
                $exists = $Value.Contains($propName)
                if ($exists) { $propValue = $Value[$propName] }
            }
            else {
                $exists = $Value.PSObject.Properties.Name -contains $propName
                if ($exists) { $propValue = $Value.$propName }
            }
            if ($exists) {
                $errors += Test-ContractValue -Value $propValue -Schema $props[$propName] -Path "$Path.$propName"
            }
        }
        return $errors
    }

    if ($schemaType -eq "array") {
        if (-not ($Value -is [System.Collections.IEnumerable]) -or ($Value -is [string])) {
            $errors += "$Path must be an array"
            return $errors
        }

        $list = @($Value)
        $minItems = Get-SchemaValue -Schema $Schema -Name "minItems"
        if ($minItems -and $list.Count -lt [int]$minItems) {
            $errors += "$Path must have at least $minItems item(s)"
        }
        $items = Get-SchemaValue -Schema $Schema -Name "items"
        if ($items) {
            for ($i = 0; $i -lt $list.Count; $i++) {
                $errors += Test-ContractValue -Value $list[$i] -Schema $items -Path "$Path[$i]"
            }
        }
        return $errors
    }

    if ($schemaType -eq "string") {
        if (-not ($Value -is [string])) {
            if ($Value -is [datetime]) {
                return $errors
            }
            $errors += "$Path must be a string"
        }
        return $errors
    }

    if ($schemaType -eq "integer") {
        $isInt = $Value -is [int] -or $Value -is [long]
        if (-not $isInt) {
            if ($Value -is [double] -and ($Value % 1 -eq 0)) {
                $isInt = $true
            }
        }
        if (-not $isInt) {
            $errors += "$Path must be an integer"
        }
        return $errors
    }

    if ($schemaType -eq "number") {
        if (-not ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal])) {
            $errors += "$Path must be a number"
        }
        return $errors
    }

    if ($schemaType -eq "boolean") {
        if (-not ($Value -is [bool])) {
            $errors += "$Path must be a boolean"
        }
        return $errors
    }

    return $errors
}

function ConvertTo-CanonicalObject {
    param([Parameter(Mandatory = $true)][AllowNull()]$Value)

    if ($null -eq $Value) { return $null }

    if ($Value -is [System.Collections.IDictionary]) {
        $ordered = [ordered]@{}
        foreach ($key in ($Value.Keys | Sort-Object)) {
            $ordered[$key] = ConvertTo-CanonicalObject -Value $Value[$key]
        }
        return $ordered
    }

    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        return @($Value | ForEach-Object { ConvertTo-CanonicalObject -Value $_ })
    }

    if ($Value -is [pscustomobject]) {
        $ordered = [ordered]@{}
        foreach ($prop in ($Value.PSObject.Properties | Sort-Object Name)) {
            $ordered[$prop.Name] = ConvertTo-CanonicalObject -Value $prop.Value
        }
        return $ordered
    }

    return $Value
}

function ConvertTo-CanonicalJson {
    param([Parameter(Mandatory = $true)][AllowNull()]$Value)
    $normalized = ConvertTo-CanonicalObject -Value $Value
    return ($normalized | ConvertTo-Json -Depth 50 -Compress)
}

function Get-Sha256Hash {
    param([Parameter(Mandatory = $true)][string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hashBytes = $sha.ComputeHash($bytes)
    }
    finally {
        $sha.Dispose()
    }
    return ([BitConverter]::ToString($hashBytes) -replace "-", "").ToLowerInvariant()
}

function Test-Contract {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$ContractPath,
        [Parameter(Mandatory = $true)][string]$SchemaPath,
        [string]$ExpectedJobType
    )

    if (-not (Test-Path -LiteralPath $ContractPath)) {
        return [pscustomobject]@{
            Ok = $false
            Errors = @("Contract not found: $ContractPath")
            Contract = $null
            CanonicalJson = $null
            ContractHash = $null
        }
    }

    if (-not (Test-Path -LiteralPath $SchemaPath)) {
        return [pscustomobject]@{
            Ok = $false
            Errors = @("Schema not found: $SchemaPath")
            Contract = $null
            CanonicalJson = $null
            ContractHash = $null
        }
    }

    $contractRaw = Get-Content -Raw -LiteralPath $ContractPath
    $contract = $contractRaw | ConvertFrom-Json -Depth 50

    $schemaRaw = Get-Content -Raw -LiteralPath $SchemaPath
    $schema = $schemaRaw | ConvertFrom-Json -Depth 50
    $resolvedSchema = Resolve-Schema -Schema $schema -SchemaPath $SchemaPath

    $errors = @()
    $errors += Test-ContractValue -Value $contract -Schema $resolvedSchema -Path "$"

    if ($ExpectedJobType) {
        if (-not $contract.job_type) {
            $errors += "$.job_type is required and must match '$ExpectedJobType'"
        }
        elseif ($contract.job_type -ne $ExpectedJobType) {
            $errors += "$.job_type '$($contract.job_type)' does not match expected '$ExpectedJobType'"
        }
    }

    $canonicalJson = ConvertTo-CanonicalJson -Value $contract
    $hash = Get-Sha256Hash -Text $canonicalJson

    return [pscustomobject]@{
        Ok = ($errors.Count -eq 0)
        Errors = $errors
        Contract = $contract
        CanonicalJson = $canonicalJson
        ContractHash = $hash
    }
}

function Assert-Contract {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$ContractPath,
        [Parameter(Mandatory = $true)][string]$SchemaPath,
        [string]$ExpectedJobType
    )

    $result = Test-Contract -ContractPath $ContractPath -SchemaPath $SchemaPath -ExpectedJobType $ExpectedJobType
    if (-not $result.Ok) {
        $message = "Contract validation failed: " + ($result.Errors -join "; ")
        throw $message
    }
    return $result
}
