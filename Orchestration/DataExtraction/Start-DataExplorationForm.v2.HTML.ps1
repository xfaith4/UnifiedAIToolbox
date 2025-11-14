function Start-DataExplorationForm {
<#
.SYNOPSIS
  Minimal web UI that lets a user BROWSE to a file or a folder, runs the analysis,
  shows the results directly under the form, and offers an Export button that saves
  a standalone HTML report.

.DESIGN
  - Uses HttpListener on localhost (default).
  - Accepts multipart/form-data uploads:
      * Single/multiple files
      * Folders via <input type="file" webkitdirectory> (Chrome/Edge)
  - Files are written to ./uploads/<sessionId>/ then read with Read-TextSmart.
  - For folders: concatenates small text files (with a sane aggregate cap).
  - Results are injected under the same form.
  - Export creates ./out/export_<timestamp>.html and links to it.

SECURITY
  - Localhost binding only by default.
  - Upload dir is within CWD; sanitized filenames; size caps.
  - No path trust from client; never uses client paths on server FS directly.
#>
  [CmdletBinding()]
  param(
    [string]$Prefix = "http://localhost:6123/",
    [string]$P1_Id = $pr_DataExploration_P1_v1,
    [string]$P2_Id = $pr_DataExploration_P2_v1,
    [string]$P3_Id = $pr_DataExploration_P3_v1,
    [string]$MP_Id = $pr_DataExploration_MP_v1,

    # Max accepted upload size in bytes (aggregate). Keep tight to avoid surprises.
    [int]$MaxUploadBytes = 8MB
  )

  Set-StrictMode -Version Latest
  $ErrorActionPreference = 'Stop'

  # ----- Utilities -------------------------------------------------------------

  function New-SessionId {
    # Short, URL-safe ID
    ([Convert]::ToBase64String([Guid]::NewGuid().ToByteArray()) -replace '[=/+]', '').Substring(0,12)
  }

  function Get-ContentType([string]$Path) {
    switch (([IO.Path]::GetExtension($Path) ?? '').ToLowerInvariant()) {
      '.html' { 'text/html; charset=utf-8' }
      '.md'   { 'text/markdown; charset=utf-8' }
      '.txt'  { 'text/plain; charset=utf-8' }
      '.json' { 'application/json; charset=utf-8' }
      '.css'  { 'text/css; charset=utf-8' }
      default { 'application/octet-stream' }
    }
  }

  function Write-Response([System.Net.HttpListenerResponse]$Res, [int]$Status, [string]$ContentType, [string]$HtmlOrText) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($HtmlOrText)
    $Res.StatusCode = $Status
    $Res.ContentType = $ContentType
    $Res.OutputStream.Write($bytes, 0, $bytes.Length)
    $Res.Close()
  }

  function Read-AllBytesSafe([System.IO.Stream]$Stream, [int]$MaxBytes) {
    # Prevent OOM and DOS by capping the read
    $ms = New-Object IO.MemoryStream
    $buf = New-Object byte[] 65536
    $total = 0
    while (($read = $Stream.Read($buf, 0, $buf.Length)) -gt 0) {
      $total += $read
      if ($total -gt $MaxBytes) {
        $ms.Dispose()
        throw "Upload size ($total bytes) exceeds cap of $MaxBytes bytes."
      }
      $ms.Write($buf, 0, $read)
    }
    $ms.ToArray()
  }

  function Parse-MultipartFormData {
    <#
    .SYNOPSIS
      Parse a multipart/form-data buffer into simple parts.

    .RETURNS
      [pscustomobject] with:
        - Fields: hashtable (name -> value) for text fields
        - Files : array of @{ Name; FileName; Bytes } entries
    #>
    param(
      [byte[]]$Bytes,
      [string]$ContentTypeHeader
    )

    if (-not ($ContentTypeHeader -match 'multipart/form-data;\s*boundary=(?<b>[^;]+)')) {
      throw "Content-Type missing boundary."
    }
    $boundary = "--$($matches['b'].Trim('"'))"

    # Work as text for boundary splitting; binary safety preserved by separately storing file bytes
    $text = [Text.Encoding]::ISO8859_1.GetString($Bytes)  # 8-bit safe, preserves byte values 0..255
    $sections = $text -split [regex]::Escape("`r`n$boundary")
    $fields = @{}
    $files = New-Object System.Collections.Generic.List[object]

    foreach ($sec in $sections) {
      if ($sec -match '^\s*--\s*$') { continue } # final boundary
      if (-not ($sec -match "Content-Disposition: form-data;(.+?)`r`n`r`n" )) { continue }

      $header = $matches[0]
      $bodyStart = $sec.IndexOf("`r`n`r`n") + 4
      $bodyRaw = $sec.Substring($bodyStart)
      # Trim trailing CRLF introduced by split
      if ($bodyRaw.EndsWith("`r`n")) { $bodyRaw = $bodyRaw.Substring(0, $bodyRaw.Length - 2) }

      # Parse name / filename
      if ($header -match 'name="(?<n>[^"]+)"') { $name = $matches['n'].Value } else { $name = $null }
      $fileName = $null
      if ($header -match 'filename="(?<f>[^"]*)"') { $fileName = $matches['f'].Value }

      if ([string]::IsNullOrEmpty($fileName)) {
        # Text field
        $fields[$name] = $bodyRaw
      } else {
        # File field -> recover original bytes from ISO-8859-1 decoding (1:1 mapping)
        $fileBytes = [byte[]][char[]]$bodyRaw
        $files.Add([pscustomobject]@{
          Name     = $name
          FileName = $fileName
          Bytes    = $fileBytes
        })
      }
    }

    [pscustomobject]@{ Fields = $fields; Files = $files.ToArray() }
  }

  function Save-UploadedFiles {
    param(
      [Parameter(Mandatory)][string]$SessionId,
      [Parameter(Mandatory)][object[]]$Files
    )
    $root = Join-Path -Path (Get-Location) -ChildPath ("uploads\{0}" -f $SessionId)
    $null = New-Item -ItemType Directory -Force -Path $root
    $saved = @()

    foreach ($f in $Files) {
      # Sanitize filename: remove directory components and suspicious chars
      $safe = [IO.Path]::GetFileName(($f.FileName -replace '[:*?"<>|]', '_'))
      if ([string]::IsNullOrWhiteSpace($safe)) { $safe = "upload.bin" }
      $dest = Join-Path $root $safe
      [IO.File]::WriteAllBytes($dest, $f.Bytes)
      $saved += $dest
    }
    ,$saved
  }

  function Build-FormHtml([string]$ExtraBelowForm = '') {
    # Simple form: file input, optional folder (webkitdirectory), plus minimal knobs.
    @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Exploration</title>
<style>
  body{font-family:Segoe UI,Roboto,Arial,sans-serif;background:#0f172a;color:#e5e7eb;margin:0;padding:24px}
  .card{max-width:1000px;margin:0 auto;background:#111827;border:1px solid #374151;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);overflow:hidden}
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
  .results{margin-top:20px;padding:20px;border-top:1px solid #374151;background:#0b1220;border-radius:0 0 12px 12px}
  pre{background:#0b1324;border:1px solid #26324a;border-left:4px solid #2563eb;color:#e5e7eb;padding:12px;border-radius:8px;overflow:auto;white-space:pre-wrap}
  a{color:#93c5fd}
</style>
</head>
<body>
  <div class="card">
    <div class="hdr">
      <h1>Data Exploration — Browse a File or Folder</h1>
    </div>
    <div class="cnt">
      <form id="fx" method="post" action="/run" enctype="multipart/form-data">
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
          <div class="hint">This uploads all files from the selected folder (recursively). Keep sizes reasonable.</div>
        </div>

        <div class="row">
          <label for="focus">Specific Focus (Optional)</label>
          <input id="focus" name="focus" type="text" placeholder="e.g., real-time flows, auth, performance">
        </div>

        <div class="row">
          <label for="rawtext">Or Paste Raw Text (Optional)</label>
          <textarea id="rawtext" name="rawtext" rows="8" placeholder="Paste API spec, schema, or sample here..."></textarea>
          <div class="hint">If both files and pasted text are provided, both are included (capped).</div>
        </div>

        <div class="actions">
          <button class="primary" type="submit">Explore Now</button>
          <button type="button" onclick="document.getElementById('fx').reset()">Clear</button>
        </div>
      </form>

      $ExtraBelowForm
    </div>
  </div>
</body>
</html>
"@
  }

  function Build-ResultsHtml {
    param(
      [string]$SessionId,
      [string]$ResponseText,
      [string]$Format,
      [string]$ExportPathRel # relative path under ./out
    )
    $safe = [System.Web.HttpUtility]::HtmlEncode($ResponseText)
    $fmt  = [System.Web.HttpUtility]::HtmlEncode($Format)
    $exportHref = "/files/$([System.Web.HttpUtility]::UrlEncode(($ExportPathRel -replace '\\','/')))"

@"
<div class="results">
  <h2>Results • Session <code>$SessionId</code> • Format <code>$fmt</code></h2>
  <div style="margin:8px 0 16px">
    <form method="get" action="$exportHref" target="_blank" style="display:inline">
      <button type="submit">Export (Open Standalone)</button>
    </form>
  </div>
  <pre>$safe</pre>
</div>
"@
  }

  # ----- Listener bring-up -----------------------------------------------------

  $uri = [System.Uri]::new($Prefix)
  try {
    Add-Type -AssemblyName System.Net.HttpListener
  } catch { throw "This function requires Windows with HttpListener available." }

  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Clear()
  $listener.Prefixes.Add($Prefix)

  try { $listener.Start() }
  catch {
    Write-Warning "If ACL error: netsh http add urlacl url=$Prefix user=$env:UserName listen=yes"
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
            # Serve form (no results yet)
            Write-Response $res 200 'text/html; charset=utf-8' (Build-FormHtml)
            break
          }

          '^/run$' {
            if ($req.HttpMethod -ne 'POST') {
              Write-Response $res 405 'text/html; charset=utf-8' "<h2>Method Not Allowed</h2><p>POST required.</p>"
              break
            }

            # Read request body with global cap
            $payload = Read-AllBytesSafe -Stream $req.InputStream -MaxBytes $MaxUploadBytes

            # Handle either multipart/form-data or urlencoded fallback
            $domain = ''; $format='md'; $desc=''; $focus=''; $rawtext=''
            $uploadedPaths = @()
            $sessionId = New-SessionId

            if ($req.ContentType -and $req.ContentType -like 'multipart/form-data*') {
              $mp = Parse-MultipartFormData -Bytes $payload -ContentTypeHeader $req.ContentType

              # Text fields
              $domain  = $mp.Fields['domain']
              $format  = $mp.Fields['format']
              $desc    = $mp.Fields['desc']
              $focus   = $mp.Fields['focus']
              $rawtext = $mp.Fields['rawtext']

              if ($mp.Files.Count -gt 0) {
                $uploadedPaths = Save-UploadedFiles -SessionId $sessionId -Files $mp.Files
              }
            }
            else {
              # Fallback: urlencoded (not used by our form, but harmless)
              $qs = [System.Web.HttpUtility]::ParseQueryString([Text.Encoding]::UTF8.GetString($payload))
              $domain  = $qs['domain']
              $format  = $qs['format']
              $desc    = $qs['desc']
              $focus   = $qs['focus']
              $rawtext = $qs['rawtext']
            }

            # Build the dataset from uploaded files + raw text (cap to keep responsive)
            $pieces   = New-Object System.Collections.Generic.List[string]
            $fileCap  = 30     # max files to read/merge
            $charCap  = 200000 # cap aggregate chars

            foreach ($p in $uploadedPaths | Select-Object -First $fileCap) {
              try {
                $txt = Read-TextSmart -PathOrText $p
                if ($null -ne $txt -and $txt.Length -gt 0) { $pieces.Add($txt) }
              } catch {
                # Skip unreadables; keep going
              }
              if (($pieces -join "`n`n").Length -ge $charCap) { break }
            }
            if ($rawtext) { $pieces.Add($rawtext) }

            $dataset = Limit-Text -Text ($pieces -join "`n`n") -MaxChars $charCap

            if ([string]::IsNullOrWhiteSpace($domain) -or [string]::IsNullOrWhiteSpace($format) -or
                [string]::IsNullOrWhiteSpace($desc)   -or [string]::IsNullOrWhiteSpace($dataset)) {
              $msg = "<div class='results'><h2>Validation Error</h2><p>Domain, Format, Description, and some input (file/folder or pasted text) are required.</p></div>"
              Write-Response $res 200 'text/html; charset=utf-8' (Build-FormHtml -ExtraBelowForm $msg)
              break
            }

            # Run the chain (reuse your existing function)
            $run = Start-DataExplorationChain `
              -P1_Id $P1_Id -P2_Id $P2_Id -P3_Id $P3_Id -MP_Id $MP_Id `
              -Domain $domain -Format $format -DataDescription $desc -DatasetSample $dataset

            $responseText = [string]$run.Response

            # Persist standalone export (HTML wrapper) and provide link
            $null = New-Item -ItemType Directory -Force -Path '.\out' -ErrorAction SilentlyContinue
            $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
            $exportRel = "out\export_${stamp}_$sessionId.html"
            $exportAbs = Join-Path (Get-Location) $exportRel

            $exportHtml = @"
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Data Exploration — $sessionId</title>
<style>
  body{font-family:Segoe UI,Roboto,Arial,sans-serif;background:#0f172a;color:#e5e7eb;margin:0;padding:24px}
  .wrap{max-width:1000px;margin:0 auto}
  pre{background:#0b1324;border:1px solid #26324a;border-left:4px solid #2563eb;color:#e5e7eb;padding:12px;border-radius:8px;white-space:pre-wrap}
</style>
</head>
<body>
  <div class="wrap">
    <h1>Data Exploration — Session $sessionId</h1>
    <p><strong>Format:</strong> $([System.Web.HttpUtility]::HtmlEncode($format))</p>
    <pre>$([System.Web.HttpUtility]::HtmlEncode($responseText))</pre>
  </div>
</body>
</html>
"@
            $exportHtml | Out-File -FilePath $exportAbs -Encoding utf8NoBOM -Force

            # Render the same form page with results appended
            $resultsBlock = Build-ResultsHtml -SessionId $sessionId -ResponseText $responseText -Format $format -ExportPathRel $exportRel
            $page = Build-FormHtml -ExtraBelowForm $resultsBlock
            Write-Response $res 200 'text/html; charset=utf-8' $page
            break
          }

          '^/files/(.+)$' {
            # Serve ./out (exports) or ./uploads read-only (primarily exports here)
            $rel = [System.Web.HttpUtility]::UrlDecode($matches[1]) -replace '^/+',''
            $root = [IO.Path]::GetFullPath((Join-Path (Get-Location) '.'))
            $full = [IO.Path]::GetFullPath((Join-Path (Get-Location) $rel))
            if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full)) {
              Write-Response $res 404 'text/html; charset=utf-8' '<h2>Not Found</h2>'
              break
            }
            $bytes = [IO.File]::ReadAllBytes($full)
            $res.StatusCode = 200
            $res.ContentType = Get-ContentType -Path $full
            $res.OutputStream.Write($bytes,0,$bytes.Length)
            $res.Close()
            break
          }

          default {
            Write-Response $res 404 'text/html; charset=utf-8' '<h2>Not Found</h2>'
            break
          }
        } # switch
      }
      catch {
        try {
          Write-Response $ctx.Response 500 'text/html; charset=utf-8' ("<h2>Server Error</h2><pre>{0}</pre>" -f ([System.Web.HttpUtility]::HtmlEncode($_ | Out-String)))
        } catch { }
      }
    } # while
  }
  finally {
    if ($listener) { $listener.Stop(); $listener.Close() }
  }
}
