function Start-DataExplorationForm {
  <#
.SYNOPSIS
  HTMX-enhanced web UI for data exploration:
  - Browse to file(s) or a folder (multipart/form-data).
  - Click "Explore Now" -> partial results render below the form (no full reload).
  - Click "Export" -> generates standalone HTML, returns link into results area.

.NOTES
  - Localhost-only by default. If ACL error:
      netsh http add urlacl url=http://localhost:6123/ user=$env:UserName listen=yes
#>
  [CmdletBinding()]
 param(
    [Parameter(Mandatory)][string]$P1_Id,
    [Parameter(Mandatory)][string]$P2_Id,
    [Parameter(Mandatory)][string]$P3_Id,
    [Parameter(Mandatory)][string]$MP_Id,
    [Parameter(Mandatory)][string]$Domain,
    [Parameter(Mandatory)][ValidateSet('txt','md','json','html')][string]$Format,
    [Parameter(Mandatory)][string]$DataDescription,
    [Parameter()][string]$DatasetSample,
    [Parameter()][string]$Model = 'gpt-4o-mini',
    [Parameter()][ValidateRange(0.0,2.0)][double]$Temperature = 0.3,
    [Parameter()][int]$MaxOutputTokens = 2048,
    [Parameter()][string]$Focus              # <-- NEW
)

  Set-StrictMode -Version Latest
  $ErrorActionPreference = 'Stop'

  # -------------------------- Utilities ---------------------------------------

  function New-SessionId { ([Convert]::ToBase64String([Guid]::NewGuid().ToByteArray()) -replace '[=/+]', '').Substring(0, 12) }

  function Write-Response([System.Net.HttpListenerResponse]$Res, [int]$Status, [string]$ContentType, [string]$Body) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
    $Res.StatusCode = $Status
    $Res.ContentType = $ContentType
    $Res.OutputStream.Write($bytes, 0, $bytes.Length)
    $Res.Close()
  }

  function Get-ContentType([string]$Path) {
    switch (([IO.Path]::GetExtension($Path) ?? '').ToLowerInvariant()) {
      '.html' { 'text/html; charset=utf-8' }
      '.md' { 'text/markdown; charset=utf-8' }
      '.txt' { 'text/plain; charset=utf-8' }
      '.json' { 'application/json; charset=utf-8' }
      '.js' { 'text/javascript; charset=utf-8' }
      '.css' { 'text/css; charset=utf-8' }
      default { 'application/octet-stream' }
    }
  }

  function Read-AllBytesSafe([System.IO.Stream]$Stream, [int]$MaxBytes) {
    # Protect the server from oversized posts
    $ms = New-Object IO.MemoryStream
    $buf = New-Object byte[] 65536
    $total = 0
    while (($read = $Stream.Read($buf, 0, $buf.Length)) -gt 0) {
      $total += $read
      if ($total -gt $MaxBytes) { $ms.Dispose(); throw "Upload exceeds cap of $MaxBytes bytes." }
      $ms.Write($buf, 0, $read)
    }
    $ms.ToArray()
  }

  function Parse-MultipartFormData {
    <#
    .SYNOPSIS
      Very small multipart/form-data parser for text fields + files.

    .RETURNS
      [pscustomobject] @{ Fields = hashtable; Files = object[] (Name, FileName, Bytes) }
    #>
    param([byte[]]$Bytes, [string]$ContentTypeHeader)

    if (-not ($ContentTypeHeader -match 'multipart/form-data;\s*boundary=(?<b>[^;]+)')) {
      throw "Content-Type missing boundary."
    }
    $boundary = "--$($matches['b'].Trim('"'))"

    # Keep 1:1 byte mapping using ISO8859_1 to preserve bytes
    $text = [Text.Encoding]::ISO8859_1.GetString($Bytes)
    $sections = $text -split [regex]::Escape("`r`n$boundary")
    $fields = @{}
    $files = New-Object System.Collections.Generic.List[object]

    foreach ($sec in $sections) {
      if ($sec -match '^\s*--\s*$') { continue } # final boundary
      if (-not ($sec -match "Content-Disposition: form-data;(.+?)`r`n`r`n")) { continue }

      $header = $matches[0]
      $bodyStart = $sec.IndexOf("`r`n`r`n") + 4
      $bodyRaw = $sec.Substring($bodyStart)
      if ($bodyRaw.EndsWith("`r`n")) { $bodyRaw = $bodyRaw.Substring(0, $bodyRaw.Length - 2) }

      $name = if ($header -match 'name="(?<n>[^"]+)"') { $matches['n'].Value } else { $null }
      $fileName = if ($header -match 'filename="(?<f>[^"]*)"') { $matches['f'].Value } else { $null }

      if ([string]::IsNullOrEmpty($fileName)) {
        $fields[$name] = $bodyRaw
      }
      else {
        $fileBytes = [byte[]][char[]]$bodyRaw  # recover original bytes 1:1
        $files.Add([pscustomobject]@{ Name = $name; FileName = $fileName; Bytes = $fileBytes })
      }
    }
    [pscustomobject]@{ Fields = $fields; Files = $files.ToArray() }
  }

  function Save-UploadedFiles {
    param([string]$SessionId, [object[]]$Files)
    $root = Join-Path -Path (Get-Location) -ChildPath ("uploads\{0}" -f $SessionId)
    $null = New-Item -ItemType Directory -Force -Path $root
    $saved = @()
    foreach ($f in $Files) {
      $safe = [IO.Path]::GetFileName(($f.FileName -replace '[:*?"<>|]', '_'))
      if ([string]::IsNullOrWhiteSpace($safe)) { $safe = "upload.bin" }
      $dest = Join-Path $root $safe
      [IO.File]::WriteAllBytes($dest, $f.Bytes)
      $saved += $dest
    }
    , $saved
  }

  function Build-FormHtml([string]$ExtraBelowForm = '') {
    @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Exploration (HTMX)</title>
<link rel="preload" href="/assets/htmx.min.js" as="script">
<style>
  body{font-family:Segoe UI,Roboto,Arial,sans-serif;background:#0f172a;color:#e5e7eb;margin:0;padding:24px}
  .card{max-width:1000px;margin:0 auto;background:#111827;border:1px solid #374151;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  .hdr{padding:20px 24px;border-bottom:1px solid #374151}
  .hdr h1{margin:0;font-size:20px}
  .cnt{padding:24px}
  .row{margin-bottom:16px}
  label{display:block;font-weight:600;margin-bottom:6px}
  input[type="text"],select,textarea{width:100%;padding:10px;border:1px solid #374151;border-radius:8px;background:#0b1220;color:#e5e7eb}
  input[type="file"]{width:100%}
  .actions{display:flex;gap:12px;margin-top:14px}
  button{padding:12px 16px;border-radius:8px;border:1px solid #374151;background:#1f2937;color:#e5e7eb;cursor:pointer}
  button.primary{background:#2563eb;border-color:#1d4ed8}
  .hint{color:#9ca3af;font-size:12px;margin-top:6px}
  .results{margin-top:20px;padding:20px;border-top:1px solid #374151;background:#0b1220;border-radius:12px}
  pre{background:#0b1324;border:1px solid #26324a;border-left:4px solid #2563eb;color:#e5e7eb;padding:12px;border-radius:8px;white-space:pre-wrap}
  a{color:#93c5fd}
</style>
</head>
<body>
  <div class="card">
    <div class="hdr"><h1>Data Exploration — HTMX</h1></div>
    <div class="cnt">
      <form id="fx" method="post" action="/run" enctype="multipart/form-data"
            hx-post="/run" hx-target="#results" hx-swap="innerHTML">
        <div class="row">
          <label for="domain">Domain *</label>
          <input id="domain" name="domain" type="text" value="contact center analytics" required>
        </div>
        <div class="row">
          <label for="format">Output Format *</label>
          <select id="format" name="format" required>
            <option value="md" selected>Markdown</option>
            <option value="txt">Text</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
          </select>
        </div>
        <div class="row">
          <label for="desc">Data Description *</label>
          <input id="desc" name="desc" type="text" value="Comprehensive API integration strategy with real-time monitoring and analytics" required>
        </div>
        <div class="row">
          <label>Choose Input (File or Folder)</label>
          <input id="file" name="file" type="file" multiple>
          <div class="hint">Pick one or more files. For folders, use the control below (Chrome/Edge only).</div>
        </div>
        <div class="row">
          <label>Or Choose a Folder</label>
          <input id="folder" name="folder" type="file" webkitdirectory directory multiple>
          <div class="hint">Uploads all files from the selected folder.</div>
        </div>
        <div class="row">
          <label for="focus">Specific Focus (Optional)</label>
          <input id="focus" name="focus" type="text" placeholder="e.g., real-time flows, auth, performance">
        </div>
        <div class="row">
          <label for="rawtext">Or Paste Raw Text (Optional)</label>
          <textarea id="rawtext" name="rawtext" rows="8" placeholder="Paste API spec, schema, or sample here..."></textarea>
        </div>
        <div class="actions">
          <button class="primary" type="submit">Explore Now</button>
          <button type="button" onclick="document.getElementById('fx').reset()">Clear</button>
        </div>
      </form>

      <div id="results" class="results" aria-live="polite">
        $ExtraBelowForm
      </div>
    </div>
  </div>
  <script src="/assets/htmx.min.js"></script>
</body>
</html>
"@
  }

  function Build-ResultFragment {
    param(
      [string]$SessionId,
      [string]$ResponseText,
      [string]$Format
    )
    $safe = [System.Web.HttpUtility]::HtmlEncode($ResponseText)
    $fmt = [System.Web.HttpUtility]::HtmlEncode($Format)
    @"
<h2>Results • Session <code>$SessionId</code> • Format <code>$fmt</code></h2>
<div style="margin:8px 0 16px">
  <button hx-get="/export?sid=$SessionId&fmt=$([System.Web.HttpUtility]::UrlEncode($Format))"
          hx-target="#results" hx-swap="innerHTML">Export (Standalone HTML)</button>
</div>
<pre>$safe</pre>
"@
  }

  function Build-ExportFragment {
    param([string]$ExportHref, [string]$SessionId)
    @"
<h2>Export Complete</h2>
<p>Standalone file created. Open it here: <a href="$ExportHref" target="_blank">$ExportHref</a></p>
<p><button onclick="history.back()">Back</button></p>
"@
  }

  # htmx payload (minified). If you already have a file, replace this with file read.
  $htmxJs = @'
!function(e,t){function n(e,t){return function(){return e.apply(t,arguments)}}function r(e){return e&&e.__esModule?e.default:e}/* htmx.min.js trimmed for brevity in this sample.
You can replace this string with the official minified file contents from https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js
*/;window.htmx=window.htmx||{}; // no-op shim to avoid 404 if replaced later
'@

  # -------------------------- Listener ----------------------------------------

  try { Add-Type -AssemblyName System.Net.HttpListener } catch { throw "HttpListener not available." }
  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Add($Prefix)
  try { $listener.Start() } catch {
    Write-Warning "ACL fix: netsh http add urlacl url=$Prefix user=$env:UserName listen=yes"
    throw
  }
  Write-Host "Listening at $Prefix (Ctrl+C to stop)" -ForegroundColor Green

  try {
    while ($listener.IsListening) {
      $ctx = $listener.GetContext()
      try {
        $req = $ctx.Request
        $res = $ctx.Response

        switch -Regex ($req.RawUrl) {

          '^/$' {
            Write-Response $res 200 'text/html; charset=utf-8' (Build-FormHtml)
            break
          }

          '^/assets/htmx\.min\.js$' {
            Write-Response $res 200 'text/javascript; charset=utf-8' $htmxJs
            break
          }

          '^/run$' {
            if ($req.HttpMethod -ne 'POST') {
              Write-Response $res 405 'text/html; charset=utf-8' '<h3>Method Not Allowed</h3>'
              break
            }

            # Aggregate and cap upload
            $payload = Read-AllBytesSafe -Stream $req.InputStream -MaxBytes $MaxUploadBytes

            $domain = ''; $format = 'md'; $desc = ''; $focus = ''; $rawtext = ''
            $sessionId = New-SessionId
            $uploadedPaths = @()

            if ($req.ContentType -and $req.ContentType -like 'multipart/form-data*') {
              $mp = Parse-MultipartFormData -Bytes $payload -ContentTypeHeader $req.ContentType
              $domain = $mp.Fields['domain']
              $format = $mp.Fields['format']
              $desc = $mp.Fields['desc']
              $focus = $mp.Fields['focus']
              $rawtext = $mp.Fields['rawtext']
              if ($mp.Files.Count -gt 0) {
                $uploadedPaths = Save-UploadedFiles -SessionId $sessionId -Files $mp.Files
              }
            }
            else {
              $qs = [System.Web.HttpUtility]::ParseQueryString([Text.Encoding]::UTF8.GetString($payload))
              $domain = $qs['domain']; $format = $qs['format']; $desc = $qs['desc']; $focus = $qs['focus']; $rawtext = $qs['rawtext']
            }

            # Build dataset (merge files + rawtext)
            $pieces = New-Object System.Collections.Generic.List[string]
            $fileCap = 30
            $charCap = 200000
            foreach ($p in $uploadedPaths | Select-Object -First $fileCap) {
              try {
                $txt = Read-TextSmart -PathOrText $p
                if ($txt) { $pieces.Add($txt) }
              }
              catch { }
              if (($pieces -join "`n`n").Length -ge $charCap) { break }
            }
            if ($rawtext) { $pieces.Add($rawtext) }
            $dataset = Limit-Text -Text ($pieces -join "`n`n") -MaxChars $charCap

            if ([string]::IsNullOrWhiteSpace($domain) -or
              [string]::IsNullOrWhiteSpace($format) -or
              [string]::IsNullOrWhiteSpace($desc) -or
              [string]::IsNullOrWhiteSpace($dataset)) {
              Write-Response $res 200 'text/html; charset=utf-8' '<div class="results"><h3>Validation Error</h3><p>Provide Domain, Format, Description, and at least one input.</p></div>'
              break
            }

            # Run chain
            $run = Start-DataExplorationChain `
              -P1_Id $P1_Id -P2_Id $P2_Id -P3_Id $P3_Id -MP_Id $MP_Id `
              -Domain $domain -Format $format -DataDescription $desc -DatasetSample $dataset

            # Return just the result fragment for HTMX swap
            $fragment = Build-ResultFragment -SessionId $sessionId -ResponseText ([string]$run.Response) -Format $format
            Write-Response $res 200 'text/html; charset=utf-8' $fragment
            break
          }

          '^/export\?.*$' {
            # Export standalone HTML from the last computed session response is stateless here:
            # We expect client to re-send the response via hx-include in future, but to keep simple,
            # we embed the content from an echo of the latest #results text (not available server-side).
            # Instead, we create a fresh file containing "last response" if client sent it. For simplicity,
            # this endpoint writes a minimal "stub done" if no data is posted. You can wire persistence later.

            # To make Export useful right now: accept optional POST with 'content'.
            if ($req.HttpMethod -eq 'POST') {
              $bytes = Read-AllBytesSafe -Stream $req.InputStream -MaxBytes 1MB
              $ct = [Text.Encoding]::UTF8.GetString($bytes)
              $body = [System.Web.HttpUtility]::ParseQueryString($ct)
              $content = $body['content']
              $sid = $body['sid']
              if (-not $content) { $content = '(empty)' }
            }
            else {
              $qs = [System.Web.HttpUtility]::ParseQueryString($ctx.Request.Url.Query)
              $sid = $qs['sid']
              $content = '(export created — no persisted content; wire server persistence to include analysis text)'
            }

            $null = New-Item -ItemType Directory -Force -Path '.\out' -ErrorAction SilentlyContinue
            $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
            $exportRel = "out\export_${stamp}_$sid.html"
            $exportAbs = Join-Path (Get-Location) $exportRel

            $exportHtml = @"
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Exploration — $sid</title>
<style>
  body{font-family:Segoe UI,Roboto,Arial,sans-serif;background:#0f172a;color:#e5e7eb;margin:0;padding:24px}
  .wrap{max-width:1000px;margin:0 auto}
  pre{background:#0b1324;border:1px solid #26324a;border-left:4px solid #2563eb;color:#e5e7eb;padding:12px;border-radius:8px;white-space:pre-wrap}
</style>
</head>
<body>
  <div class="wrap">
    <h1>Data Exploration — Session $sid</h1>
    <pre>$([System.Web.HttpUtility]::HtmlEncode($content))</pre>
  </div>
</body>
</html>
"@
            $exportHtml | Out-File -FilePath $exportAbs -Encoding utf8NoBOM -Force

            $href = "/files/$([System.Web.HttpUtility]::UrlEncode(($exportRel -replace '\\','/')))"
            $frag = Build-ExportFragment -ExportHref $href -SessionId $sid
            Write-Response $res 200 'text/html; charset=utf-8' $frag
            break
          }

          '^/files/(.+)$' {
            $rel = [System.Web.HttpUtility]::UrlDecode($matches[1]) -replace '^/+', ''
            $full = [IO.Path]::GetFullPath((Join-Path (Get-Location) $rel))
            $root = [IO.Path]::GetFullPath((Join-Path (Get-Location) '.'))
            if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full)) {
              Write-Response $res 404 'text/html; charset=utf-8' '<h3>Not Found</h3>'
              break
            }
            $bytes = [IO.File]::ReadAllBytes($full)
            $res.StatusCode = 200
            $res.ContentType = Get-ContentType -Path $full
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            break
          }

          default {
            Write-Response $res 404 'text/html; charset=utf-8' '<h3>Not Found</h3>'
            break
          }
  } # switch
}
catch {
        Write-Host "Error processing request: $_" -ForegroundColor Red
        Write-Response $res 500 'text/html; charset=utf-8' '<h3>Internal Server Error</h3>'
}
    } # while
  }
  catch {
    Write-Host "Listener stopped: $_" -ForegroundColor Yellow
  }
  finally {
    if ($listener) { $listener.Stop(); $listener.Close() }
  }
}
# Defaults you can reuse anywhere
$Prefix = 'http://localhost:6123/'
$pr_SystemMonitoring_P1 = 'pmpt_SystemMonitoring_P1_v1'
$pr_SystemMonitoring_P2 = 'pmpt_SystemMonitoring_P2_v1'
$pr_SystemMonitoring_P3 = 'pmpt_SystemMonitoring_P3_v1'
$pr_SystemMonitoring_MP = 'pmpt_SystemMonitoring_MP_v1'
Start-DataExplorationForm -P1_Id $pr_SystemMonitoring_P1 -P2_Id $pr_SystemMonitoring_P2 -P3_Id $pr_SystemMonitoring_P3 -MP_Id $pr_SystemMonitoring_MP -Domain 'contact center analytics' -Format 'md' -DataDescription 'Comprehensive API integration strategy with real-time monitoring and analytics'
