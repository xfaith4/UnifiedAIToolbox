<# 
.SYNOPSIS
    Analyzes images in a directory (and its subdirectories) using parallel processing, error handling, logging, and a GUI.
.DESCRIPTION
    This script recursively scans a specified folder for image files (e.g. JPG, PNG, GIF, BMP), then processes them concurrently using PowerShell’s parallel processing features.
    For each image, it performs a basic analysis (reading dimensions via System.Drawing), simulates external API calls (Google Vision and OpenAI), and logs key events and errors.
    A Windows Forms–based GUI allows users to select the target directory, start the analysis, and view results interactively.
    
    Additional features include:
      • Robust try/catch error handling to log exceptions and continue processing.
      • Logging of events and errors into a log file (image_analysis.log).
      • A placeholder for integration with external tools/APIs.
      • Inline documentation and notes for testing (using Pester) and further documentation generation.
      
.PARAMETER None
    This script is designed to be run interactively. When executed, it opens a GUI.
    
.EXAMPLE
    PS C:\> .\ImageAnalysis.ps1
    Launches the GUI where you can select a folder and begin image analysis.
    
.NOTES
    Requirements:
      - PowerShell 7+ (for ForEach-Object -Parallel)
      - .NET assemblies (Windows Forms and Drawing) are used for the GUI and image processing.
      - Replace the placeholder external API calls with your actual API integration code.
      
    Testing:
      Unit and integration tests can be built with frameworks such as Pester.
#>

#region Load .NET Assemblies for GUI and Image Processing
Add-Type -ReferencedAssemblies "System.Windows.Forms.dll", "System.Windows.Forms.Primitives.dll" -TypeDefinition @"
using System;
using System.Windows.Forms;
"@
#endregion

#region Global Variables and Logging Function
$LogFile = "F:\logs\image_analysis.log"

function Write-Log {
    param (
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "$timestamp [$Level] $Message"
    Add-Content -Path $LogFile -Value $logEntry
}
#endregion

#region Define Analysis Script Block for Parallel Processing
# This script block is executed in parallel for each image file.
$analysisScriptBlock = {
    param($filePath, $logFile)
    # Local logging function within the runspace
    function Write-Log {
         param (
              [string]$Message,
              [string]$Level = "INFO"
         )
         $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
         $logEntry = "$timestamp [$Level] $Message"
         Add-Content -Path $logFile -Value $logEntry
    }
    Write-Log "Starting analysis for $filePath"
    try {
        $filePath = "$filePath/image.jpg"
        $imageBytes = [System.IO.File]::ReadAllBytes($filePath)
        $base64Image = [Convert]::ToBase64String($imageBytes)
        
         $width = $image.Width
         $height = $image.Height
         $image.Dispose()
         Write-Log "Analyzed $filePath Width=$width, Height=$height"
         
         # ----- External API Integration Placeholder -----
         Write-Log "Calling Google Vision API for $filePath"
         $APIkey = $env:GoogleAPIKey
         $APIkey = $env:GoogleAPIKey
$body = @{
    "requests" = @(
        @{
            "image" = @{
                "content" = $base64Image
            }
            "features" = @(
                @{
                    "type" = "LABEL_DETECTION"
                    "maxResults" = 10
                }
            )
        }
    )
} | ConvertTo-Json

         Invoke-RestMethod -Uri "https://vision.googleapis.com/v1/images:annotate?key=$APIKey" -Method Post -Body $body
         #Start-Sleep -Seconds 1
         #Write-Log "Calling OpenAI API for $filePath"
         # Example: Invoke-RestMethod -Uri "https://api.openai.com/v1/your-endpoint" -Method Post -Headers $headers -Body $body
         #Start-Sleep -Seconds 1
         # ---------------------------------------------------
         
         return @{ Path = $filePath; Width = $width; Height = $height }
    } catch {
         Write-Log "Error processing $filePath $_" "ERROR"
         return @{ Path = $filePath; Error = $_.Exception.Message }
    }
}
#endregion

#region Process-Images Function Using Parallel Processing
#region Image Processing Function
function Process-Images {
    param(
        [string]$DirectoryPath
    )

    Write-Log "Starting image analysis in directory: $DirectoryPath"

    # Define common image file extensions
    $extensions = "*.jpg", "*.jpeg", "*.png", "*.gif", "*.bmp"
    $files = Get-ChildItem -Path $DirectoryPath -Recurse -Include $extensions -ErrorAction SilentlyContinue

    if (-not $files) {
        Write-Log "No image files found in $DirectoryPath" "WARNING"
        return @()
    }

    # Process images
    # Note: Ensure that $analysisScriptBlock and $LogFile are defined elsewhere
    $results = $files | ForEach-Object {
        & $analysisScriptBlock $_.FullName $LogFile
    }

    Write-Log "Completed analysis for all images in $DirectoryPath"
    return $results
}
#endregion

#region GUI Function
Add-Type -TypeDefinition @"
using System;
using System.Windows.Forms;

namespace Test1
{
    public partial class Form1
    {
        public Form test = new Form();
        public Padding a = new Padding();

        public void Main(){
            test.Text = "Hello world";
            test.Padding = a;
            Console.WriteLine("Hello world!");
        }
    }
}
"@ -ReferencedAssemblies "System.Windows.Forms"
#endregion
function Show-GUI {
    # Create the main form
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Image Analysis Tool"
    $form.Size = New-Object System.Drawing.Size(600,400)
    $form.StartPosition = "CenterScreen"

    # Label for directory
    $label = New-Object System.Windows.Forms.Label
    $label.Text = "Directory:"
    $label.Location = New-Object System.Drawing.Point(10,20)
    $label.Size = New-Object System.Drawing.Size(60,20)
    $form.Controls.Add($label)

    # TextBox to display selected directory path
    $textBox = New-Object System.Windows.Forms.TextBox
    $textBox.Location = New-Object System.Drawing.Point(80,18)
    $textBox.Size = New-Object System.Drawing.Size(400,20)
    $form.Controls.Add($textBox)

    # Button to browse for a directory
    $browseButton = New-Object System.Windows.Forms.Button
    $browseButton.Text = "Browse"
    $browseButton.Location = New-Object System.Drawing.Point(490,16)
    $browseButton.Size = New-Object System.Drawing.Size(75,23)
    $browseButton.Add_Click({
         $folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
         if($folderBrowser.ShowDialog() -eq "OK") {
             $textBox.Text = $folderBrowser.SelectedPath
         }
    })
    $form.Controls.Add($browseButton)

    # Button to start image analysis
    $startButton = New-Object System.Windows.Forms.Button
    $startButton.Text = "Start Analysis"
    $startButton.Location = New-Object System.Drawing.Point(10,60)
    $startButton.Size = New-Object System.Drawing.Size(100,30)
    $startButton.Add_Click({
         if([string]::IsNullOrWhiteSpace($textBox.Text)) {
              [System.Windows.Forms.MessageBox]::Show("Please select a directory.","Warning",
                   [System.Windows.Forms.MessageBoxButtons]::OK,
                   [System.Windows.Forms.MessageBoxIcon]::Warning)
         } else {
              # Call the Process-Images function with the selected directory
              $results = Process-Images -DirectoryPath $textBox.Text
              $resultText = ""
              foreach($r in $results) {
                  if($r.Error) {
                       $resultText += "Error processing $($r.Path): $($r.Error)`r`n"
                  } else {
                       $resultText += "Processed $($r.Path): Width=$($r.Width), Height=$($r.Height)`r`n"
                  }
              }
              $outputBox.Text = $resultText
         }
    })
    $form.Controls.Add($startButton)

    # Multiline TextBox to display analysis results
    $outputBox = New-Object System.Windows.Forms.TextBox
    $outputBox.Multiline = $true
    $outputBox.ScrollBars = "Vertical"
    $outputBox.Location = New-Object System.Drawing.Point(10,110)
    $outputBox.Size = New-Object System.Drawing.Size(555,230)
    $form.Controls.Add($outputBox)

    # Show the form
    $form.Add_Shown({ $form.Activate() })
    [System.Windows.Forms.Application]::Run($form)
}
#endregion

#region Main Entry Point
# When the script is run, launch the GUI.
Show-GUI
#endregion

#region Testing and Documentation Notes
<#
# Testing and Validation
For automated testing, you can create a separate Pester test script (e.g., ImageAnalysis.Tests.ps1) that covers:
    - Write-Log function (to ensure proper logging)
    - The analysis logic in the parallel script block (using both valid image files and error conditions)
    - Process-Images to verify that images in a test directory are processed as expected

Run tests with:
    Invoke-Pester -Script .\ImageAnalysis.Tests.ps1

# Documentation
Comprehensive documentation (usage, input/output, supported tasks, and dependencies) can be generated from these inline comments.
For instance, you could use tools like PlatyPS to convert comment-based help into markdown.
#>
#endregion
