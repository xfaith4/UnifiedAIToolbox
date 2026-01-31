#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Converts Final_Synthesis.txt to a standardized HTML page.
.DESCRIPTION
    Reads a text synthesis file (usually Final_Synthesis.txt), HTML-encodes it,
    and writes a self-contained HTML page suitable for viewing in a browser.
.PARAMETER TextPath
    Path to the synthesis text file.
.PARAMETER OutputPath
    Where to write the generated HTML file. Defaults to same name with .html extension.
.PARAMETER Title
    Page title/header text.
.PARAMETER RunId
    Optional run identifier displayed in the header.
.PARAMETER Model
    Optional model name displayed in the header.
.PARAMETER RepoRoot
    Optional repository root displayed in the header.
.PARAMETER Goal
    Optional goal displayed in the header.
.EXAMPLE
    .\scripts\Convert-FinalSynthesisToHtml.ps1 -TextPath .\runs\20260131-120000\Final_Synthesis.txt
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TextPath,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = "",

    [Parameter(Mandatory = $false)]
    [string]$Title = "Final Synthesis",

    [Parameter(Mandatory = $false)]
    [string]$RunId = "",

    [Parameter(Mandatory = $false)]
    [string]$Model = "",

    [Parameter(Mandatory = $false)]
    [string]$RepoRoot = "",

    [Parameter(Mandatory = $false)]
    [string]$Goal = ""
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Web

$resolvedTextPath = (Resolve-Path $TextPath).Path
if (-not (Test-Path $resolvedTextPath)) {
    throw "TextPath not found: $TextPath"
}

if (-not $OutputPath) {
    if ($resolvedTextPath -match '\.txt$') {
        $OutputPath = ($resolvedTextPath -replace '\.txt$', '.html')
    }
    else {
        $OutputPath = "$resolvedTextPath.html"
    }
}

$textItem = Get-Item -LiteralPath $resolvedTextPath
$generatedAt = (Get-Date).ToString("o")
$sourceTimestamp = $textItem.LastWriteTime.ToString("o")

$raw = Get-Content -LiteralPath $resolvedTextPath -Raw -Encoding UTF8
$encoded = [System.Web.HttpUtility]::HtmlEncode($raw)

function Format-OptionalRow {
    param([string]$Label, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    $v = [System.Web.HttpUtility]::HtmlEncode($Value)
    return "<div class=""meta-item""><div class=""meta-label"">$Label</div><div class=""meta-value"">$v</div></div>"
}

$goalBlock = ""
if (-not [string]::IsNullOrWhiteSpace($Goal)) {
    $goalBlock = "<div class=""goal""><div class=""goal-label"">Goal</div><div class=""goal-text"">$([System.Web.HttpUtility]::HtmlEncode($Goal))</div></div>"
}

$downloadHint = ""
try {
    $outDir = Split-Path -Parent $OutputPath
    $txtName = Split-Path -Leaf $resolvedTextPath
    $outName = Split-Path -Leaf $OutputPath
    if ($outDir -and (Split-Path -Parent $resolvedTextPath) -eq $outDir -and $txtName -and $outName) {
        $downloadHint = "<a class=""btn"" href=""$([System.Web.HttpUtility]::HtmlEncode($txtName))"" download>Download .txt</a>"
    }
} catch { }

$htmlTitle = [System.Web.HttpUtility]::HtmlEncode($Title)

$html = @"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>$htmlTitle</title>
  <style>
    :root {
      --bg1: #667eea;
      --bg2: #764ba2;
      --text: #111827;
      --muted: #6b7280;
      --card: #ffffff;
      --border: #e5e7eb;
      --codeBg: #0b1020;
      --codeText: #e5e7eb;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      color: var(--text);
      background: linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 100%);
      padding: 20px;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      background: var(--card);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.22);
    }
    .header {
      padding: 28px 32px;
      background: linear-gradient(135deg, var(--bg1) 0%, var(--bg2) 100%);
      color: white;
    }
    .header h1 {
      margin: 0 0 6px 0;
      font-size: 28px;
      font-weight: 750;
      letter-spacing: 0.2px;
    }
    .sub {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      align-items: center;
      opacity: 0.95;
      font-size: 13px;
    }
    .chip {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(255,255,255,0.22);
      backdrop-filter: blur(2px);
    }
    .chip b { font-weight: 650; }

    .meta {
      padding: 22px 32px;
      background: #f8fafc;
      border-bottom: 1px solid var(--border);
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .meta-item {
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: white;
    }
    .meta-label {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .meta-value {
      font-size: 14px;
      font-weight: 600;
      word-break: break-word;
    }
    .goal {
      margin-top: 14px;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: white;
    }
    .goal-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .goal-text { font-size: 14px; line-height: 1.5; white-space: pre-wrap; }

    .content { padding: 26px 32px 32px; }
    .actions {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: flex-end;
      margin-bottom: 12px;
    }
    .btn {
      appearance: none;
      border: 1px solid var(--border);
      background: white;
      color: var(--text);
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 650;
      font-size: 13px;
      text-decoration: none;
    }
    .btn:hover { background: #f3f4f6; }
    pre.synth {
      margin: 0;
      padding: 18px 18px;
      border-radius: 12px;
      border: 1px solid #111827;
      background: var(--codeBg);
      color: var(--codeText);
      line-height: 1.5;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .footer {
      padding: 16px 20px;
      text-align: center;
      color: var(--muted);
      background: #f8fafc;
      border-top: 1px solid var(--border);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>$htmlTitle</h1>
      <div class="sub">
        <span class="chip"><b>Generated</b> $([System.Web.HttpUtility]::HtmlEncode($generatedAt))</span>
        <span class="chip"><b>Source</b> $([System.Web.HttpUtility]::HtmlEncode($sourceTimestamp))</span>
        $(if ($RunId) { "<span class=""chip""><b>Run</b> $([System.Web.HttpUtility]::HtmlEncode($RunId))</span>" } else { "" })
      </div>
    </div>

    <div class="meta">
      <div class="meta-grid">
        $(Format-OptionalRow -Label "Model" -Value $Model)
        $(Format-OptionalRow -Label "Repo Root" -Value $RepoRoot)
        $(Format-OptionalRow -Label "Text File" -Value (Split-Path -Leaf $resolvedTextPath))
      </div>
      $goalBlock
    </div>

    <div class="content">
      <div class="actions">
        $downloadHint
        <button class="btn" id="copyBtn" type="button">Copy</button>
      </div>
      <pre class="synth" id="synth">$encoded</pre>
    </div>

    <div class="footer">
      UnifiedAIToolbox Orchestration Output
    </div>
  </div>

  <script>
    (function () {
      var btn = document.getElementById("copyBtn");
      var pre = document.getElementById("synth");
      if (!btn || !pre) return;
      btn.addEventListener("click", async function () {
        try {
          await navigator.clipboard.writeText(pre.innerText);
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = "Copy"; }, 900);
        } catch (e) {
          // fallback
          var r = document.createRange();
          r.selectNodeContents(pre);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          document.execCommand("copy");
          sel.removeAllRanges();
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = "Copy"; }, 900);
        }
      });
    })();
  </script>
</body>
</html>
"@

$html | Out-File -FilePath $OutputPath -Encoding UTF8
Write-Host "Wrote HTML: $OutputPath" -ForegroundColor Green

