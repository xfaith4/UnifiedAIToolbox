# AI Orchestration Example: Creating a Disk Space Monitor

This example demonstrates the AI Orchestration framework in action by creating a PowerShell function to monitor disk space.

## Goal Definition

We want to create a PowerShell function that:

- Checks available disk space on all drives
- Alerts if any drive is below 10% free space
- Provides a summary in a readable format
- Handles errors gracefully

## Step-by-Step Process

### 1. Create the Goal File

Create a file `Goals/DiskSpaceMonitor.txt`:

```
Create a PowerShell function that:
- Checks available disk space on all drives
- Alerts if any drive is below 10% free space
- Provides a summary in a readable format
- Handles errors gracefully
```

### 2. Run the Orchestration

```powershell
pwsh -File scripts/MilestoneController.ps1 -GoalFile "./Goals/DiskSpaceMonitor.txt" -Model "gpt-4o-mini"
```

### 3. Agent Workflow

The orchestration runs through the following stages:

#### 🔬 Researcher Phase

The Researcher generates three different approaches:

1. **WMI Approach**: Using `Get-WmiObject Win32_LogicalDisk`
2. **PowerShell Drive Approach**: Using `Get-PSDrive -PSProvider FileSystem`
3. **System.IO Approach**: Using .NET `System.IO.DriveInfo`

Each approach is analyzed for:

- Performance characteristics
- Compatibility (Windows/Linux/macOS)
- Error handling capabilities
- Output format flexibility

#### ⚙️ Engineer Phase

The Engineer converts the best approach into structured PowerShell code:

```powershell
function Get-DiskSpaceAlert {
    param(
        [int]$ThresholdPercent = 10
    )
    
    try {
        Get-PSDrive -PSProvider FileSystem | ForEach-Object {
            if ($_.Used -gt 0) {
                $percentFree = ($_.Free / ($_.Free + $_.Used)) * 100
                
                [PSCustomObject]@{
                    Drive = $_.Name
                    FreeGB = [math]::Round($_.Free / 1GB, 2)
                    UsedGB = [math]::Round($_.Used / 1GB, 2)
                    TotalGB = [math]::Round(($_.Free + $_.Used) / 1GB, 2)
                    PercentFree = [math]::Round($percentFree, 2)
                    Status = if ($percentFree -lt $ThresholdPercent) { 
                        "⚠️ LOW" 
                    } else { 
                        "✅ OK" 
                    }
                }
            }
        }
    }
    catch {
        Write-Error "Failed to retrieve disk information: $_"
        return $null
    }
}
```

#### 🛡️ Critic Phase

The Critic evaluates the code and identifies:

**Strengths:**

- Clean parameter design with sensible defaults
- Proper error handling with try-catch
- Division by zero protection ($_.Used -gt 0)
- Readable output format
- Cross-platform compatible

**Potential Improvements:**

- Add `-Verbose` support for debugging
- Consider excluding network drives with filter
- Add color-coded console output option
- Include timestamp in alerts

#### 🔗 Synthesizer Phase

The Synthesizer merges the best aspects:

```powershell
function Get-DiskSpaceAlert {
    [CmdletBinding()]
    param(
        [Parameter()]
        [int]$ThresholdPercent = 10,
        
        [Parameter()]
        [switch]$IncludeNetworkDrives,
        
        [Parameter()]
        [switch]$ColorOutput
    )
    
    begin {
        Write-Verbose "Starting disk space check with threshold: $ThresholdPercent%"
    }
    
    process {
        try {
            $drives = Get-PSDrive -PSProvider FileSystem
            
            if (-not $IncludeNetworkDrives) {
                $drives = $drives | Where-Object { $_.DisplayRoot -eq $null }
            }
            
            foreach ($drive in $drives) {
                if ($drive.Used -gt 0) {
                    $percentFree = ($drive.Free / ($drive.Free + $drive.Used)) * 100
                    $isLow = $percentFree -lt $ThresholdPercent
                    
                    $result = [PSCustomObject]@{
                        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                        Drive = $drive.Name
                        FreeGB = [math]::Round($drive.Free / 1GB, 2)
                        UsedGB = [math]::Round($drive.Used / 1GB, 2)
                        TotalGB = [math]::Round(($drive.Free + $drive.Used) / 1GB, 2)
                        PercentFree = [math]::Round($percentFree, 2)
                        Status = if ($isLow) { "⚠️ LOW" } else { "✅ OK" }
                    }
                    
                    if ($ColorOutput -and $isLow) {
                        $result | Format-Table | Out-String | Write-Host -ForegroundColor Red
                    } else {
                        $result
                    }
                    
                    Write-Verbose "Drive $($drive.Name): $percentFree% free"
                }
            }
        }
        catch {
            Write-Error "Failed to retrieve disk information: $_"
            Write-Verbose $_.ScriptStackTrace
            return $null
        }
    }
}

# Usage examples:
# Get-DiskSpaceAlert
# Get-DiskSpaceAlert -ThresholdPercent 20 -Verbose
# Get-DiskSpaceAlert -ColorOutput -IncludeNetworkDrives
```

#### ⭐ Commissioner Phase

The Commissioner evaluates the final solution:

##### Value Score: 9/10

**Reasoning:**
This solution demonstrates high real-world utility:

- Immediately usable for system administrators
- Saves time by automating routine checks
- Prevents storage-related incidents through early warnings
- Flexible enough for different monitoring needs

**Strengths:**

1. Production-ready code with comprehensive error handling
2. Multiple usage modes (verbose, color output, network drives)
3. Clear, actionable output format
4. Cross-platform PowerShell compatibility
5. Follows PowerShell best practices (CmdletBinding, proper parameters)

**Minor Improvement Opportunities:**

- Could add email alerting for unattended monitoring
- Consider logging low-space events to file

**Next Action:**
Since Value Score ≥ 7, this milestone is **ACCEPTED** ✅

### 4. Output Location

The complete synthesis is saved to:

```
runs/[timestamp]/Final_Synthesis.txt
```

This file contains:

- All agent outputs
- The complete evolution of the solution
- Commissioner's evaluation and reasoning
- Final production-ready code

### 5. Dashboard View

The run is automatically logged to:

- `Milestone_Log.csv` - For historical tracking
- `Milestone_Log.xlsx` - For Excel analysis (if ImportExcel module installed)
- `MilestoneDashboard/public/data/Milestone_Log.json` - For web dashboard

You can view it in the dashboard at <http://localhost:5173> (when running `npm start`)

## Expected Cost

For this example with `gpt-4o-mini`:

- Tokens used: ~3,500
- Estimated cost: **$0.0035** (less than a penny!)

## Key Takeaways

1. **Multi-Agent Collaboration**: Five specialized agents each contributed their expertise
2. **Iterative Refinement**: Each phase built upon the previous, improving quality
3. **Automatic Evaluation**: The Commissioner ensured real-world value
4. **Complete Transparency**: All agent outputs are preserved for review
5. **Cost Efficient**: Even complex tasks cost pennies with gpt-4o-mini

## Try It Yourself

1. Copy the goal text to `Goals/MyFirstGoal.txt`
2. Run: `pwsh -File scripts/MilestoneController.ps1 -GoalFile "./Goals/MyFirstGoal.txt"`
3. Watch the agents collaborate
4. Review the output in `runs/[latest]/Final_Synthesis.txt`
5. View the results in the dashboard

Happy orchestrating! 🚀
