$list = @(1, 2, 3, 4, 5)

# Convert the list to a hash table with calculated properties for faster filtering
$hashTable = @{}
foreach ($item in $list) {
    $hashTable[$item] = [PSCustomObject]@{
        Value = $item
        IsGreaterThanTwo = $item -gt 2
    }
}

# Measure the execution time of the script
$executionTime = Measure-Command {
    $filteredList = $hashTable.Values | Where-Object { $_.IsGreaterThanTwo } | ForEach-Object { $_.Value }
}

# Output the filtered list and execution time
Write-Output "Filtered List: $filteredList"
Write-Output "Execution Time: $($executionTime.TotalMilliseconds) milliseconds"

