param(
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$Notes,
  [string]$AdminToken = $env:ADMIN_TOKEN,
  [string]$PrivateKey = 'D:\Desktop\toketeo-signing\toketeo-signing.key',
  [string]$PasswordFile = 'D:\Desktop\toketeo-signing\signing_pass.txt',
  [string]$BaseUrl = 'https://toketeo-updates.crdsyntax.workers.dev',
  [string]$OutDir = 'update-dist',
  [string]$WixTools = '',
  [switch]$SkipBuild,
  [switch]$SkipCompress
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root 'node_modules/@tauri-apps/cli/tauri.js'

if (-not (Test-Path $cli)) { throw "Tauri CLI not found: $cli" }
if (-not (Test-Path $PrivateKey)) { throw "Private key not found: $PrivateKey" }
if (-not (Test-Path $PasswordFile)) { throw "Signing password file not found: $PasswordFile" }
if ([string]::IsNullOrWhiteSpace($AdminToken)) { throw 'Provide -AdminToken (or set ADMIN_TOKEN env var). This is the worker admin token for the update endpoint.' }

$Password = (Get-Content $PasswordFile -Raw).Trim()

# Ejecuta un comando nativo capturando stdout+stderr. Necesario porque con
# `$ErrorActionPreference = 'Stop'` PowerShell 5.1 lanza NativeCommandError
# ante CUALQUIER salida en stderr, abortando el script aunque haya éxito.
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $FilePath @Arguments 2>&1
    }
    finally {
        $ErrorActionPreference = $prev
    }
    if ($LASTEXITCODE -ne 0) {
        $output | ForEach-Object { Write-Host $_.ToString() }
        throw "Command failed (exit $LASTEXITCODE): $FilePath $($Arguments -join ' ')"
    }
    $output
}

# ---- 1. Build --------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host "==> Building MSI bundle for v$Version ..."
    Invoke-Native node @($cli, 'build', '--bundles', 'msi')
} else {
    Write-Host "==> Skipping build (-SkipBuild) ..."
}

# ---- 2. Locate MSI ---------------------------------------------------------
$bundleDir = Join-Path $root 'src-tauri/target/release/bundle/msi'
$msi = Get-ChildItem $bundleDir -Filter "*.msi" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*$Version*.msi" } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $msi) { throw "No MSI found for version $Version in $bundleDir" }
Write-Host "==> MSI: $($msi.FullName) ($([math]::Round($msi.Length / 1MB, 2)) MB)"

# ---- 3. Recompress with WiX high compression (LZX) -------------------------
# Reduce el tamaño del instalador de ~25 MB a ~20 MB, útil mientras el bucket
# R2 no reemplazaba el tope de 25 MiB del KV anterior.
if (-not $SkipCompress) {
    if ($WixTools -eq '') {
        $WixTools = (Get-ChildItem "$env:LOCALAPPDATA\tauri" -Recurse -Filter 'light.exe' -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName)
    }
    if ($WixTools) {
        $light = $WixTools
        $wixDir = Join-Path $root 'src-tauri/target/release/wix/x64'
        $wixobj = Join-Path $wixDir 'main.wixobj'
        $wxl = Join-Path $wixDir 'locale.wxl'
        if ((Test-Path $wixobj) -and (Test-Path $wxl)) {
            $orig = $msi.FullName
            $perComp = Join-Path $root 'src-tauri/target/release/wix'
            Write-Host "==> Recompressing MSI with high compression (WiX light -dcl:high) ..."
            Invoke-Native $light @('-nologo', '-dcl:high', '-cc', $perComp, '-ext', 'WixUIExtension', '-loc', $wxl, '-sval', '-spdb', '-out', $orig, $wixobj)
            $msi = Get-Item $orig
            Write-Host "==> MSI recompressed: $([math]::Round($msi.Length / 1MB, 2)) MB"
        } else {
            Write-Host "==> Wix artifacts not found, skipping recompression."
        }
    } else {
        Write-Host "==> light.exe not found, skipping recompression."
    }
}

# ---- 4. Sign + copy to OutDir ----------------------------------------------
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Write-Host "==> Signing $($msi.Name) ..."
$sigOut = Invoke-Native node @($cli, 'signer', 'sign', '-f', $PrivateKey, '-p', $Password, $msi.FullName)
$signature = ($sigOut | ForEach-Object { $_.ToString() } | Where-Object { $_.Trim() -ne '' } | Select-String -Pattern '^dW50cnVzdGVk' | Select-Object -First 1)
if (-not $signature) { throw "Could not extract signature from signer output: $sigOut" }
$signature = $signature.ToString().Trim()

$dest = Join-Path $OutDir $msi.Name
Copy-Item $msi.FullName $dest -Force
Write-Host "==> Copied to $dest"

# ---- 5. Generate latest.json -----------------------------------------------
$platforms = @{
    'windows-x86_64' = @{
        url       = "$BaseUrl/$($msi.Name)"
        signature = $signature
    }
}
$manifest = [ordered]@{
    version   = $Version
    notes     = $Notes
    pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = $platforms
} | ConvertTo-Json -Depth 4

$manifestPath = Join-Path $OutDir 'latest.json'
[System.IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding $false))
Write-Host "==> Wrote $manifestPath"

# ---- 6. Upload to worker (R2) -----------------------------------------------
Write-Host "==> Uploading to $BaseUrl ..."
$uploadedOk = $true
Get-ChildItem $OutDir -File | Sort-Object Name | ForEach-Object {
    $remoteName = $_.Name
    $curlOut = & curl.exe -s -X PUT "$BaseUrl/admin/$remoteName" `
        -H "Authorization: Bearer $AdminToken" `
        -H "content-type: application/octet-stream" `
        --data-binary "@$($_.FullName)" 2>&1
    if ($LASTEXITCODE -ne 0 -or $curlOut -match '"ok":false' -or $curlOut -match '"error"') {
        Write-Host "FAIL $remoteName: $curlOut"
        $uploadedOk = $false
    } else {
        Write-Host "OK   $remoteName ($([math]::Round($_.Length / 1MB, 2)) MB)"
    }
}
if (-not $uploadedOk) { throw 'One or more files failed to upload.' }

# ---- 7. Verify ----------------------------------------------------------------
Write-Host "==> Verifying live latest.json ..."
$check = & curl.exe -s "$BaseUrl/latest.json"
if ($check -match '"version"\s*:\s*"' + [regex]::Escape($Version) + '"') {
    Write-Host "OK   Update endpoint now serves v$Version."
} else {
    Write-Host "WARN Could not verify version on $BaseUrl/latest.json:"
    Write-Host $check
}

Write-Host ""
Write-Host "Release v$Version published."