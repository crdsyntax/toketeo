param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = '',
  [string]$PrivateKey = 'D:\Desktop\toketeo-signing\toketeo-signing.key',
  [string]$PasswordFile = 'D:\Desktop\toketeo-signing\signing_pass.txt',
  [string]$BaseUrl = 'https://toketeo-updates.crdsyntax.workers.dev',
  [string]$OutDir = 'update-dist'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root 'node_modules/@tauri-apps/cli/tauri.js'

if (-not (Test-Path $cli)) { throw "Tauri CLI not found: $cli" }
if (-not (Test-Path $PrivateKey)) { throw "Private key not found: $PrivateKey" }
if (-not (Test-Path $PasswordFile)) { throw "Signing password file not found: $PasswordFile" }
if ($Notes -eq '') { throw 'Provide -Notes with the changelog for the manifest.' }

$Password = (Get-Content $PasswordFile -Raw).Trim()

# Ejecuta un comando nativo capturando stdout+stderr. Necesario porque con
# `$ErrorActionPreference = 'Stop'` PowerShell 5.1 lanza NativeCommandError
# ante CUALQUIER salida en stderr (p. ej. los "Info ..." del CLI de Tauri),
# abortando el script aunque el comando tenga éxito.
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
    $output
}

Write-Host "Building bundles for version $Version ..."
$buildOut = Invoke-Native node @($cli, 'build')
$buildOut | ForEach-Object { Write-Host $_.ToString() }
if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE): $($buildOut | Out-String)" }

$bundleRoot = Join-Path $root 'src-tauri/target/release/bundle'
$artifacts = @{}

$msi = Get-ChildItem (Join-Path $bundleRoot 'msi') -Filter "*.msi" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*$Version*" }
$deb = Get-ChildItem (Join-Path $bundleRoot 'deb') -Filter "*.deb" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*$Version*" }

if ($msi) { $artifacts['windows-x86_64'] = $msi[0] }
if ($deb) { $artifacts['linux-x86_64'] = $deb[0] }
if ($artifacts.Count -eq 0) { throw "No bundles found for version $Version under $bundleRoot" }

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$platforms = @{}
foreach ($platform in $artifacts.Keys) {
  $file = $artifacts[$platform]
  Write-Host "Signing $($file.Name) for $platform ..."
  $sigOut = Invoke-Native node @($cli, 'signer', 'sign', '-f', $PrivateKey, '-p', $Password, $file.FullName)
  if ($LASTEXITCODE -ne 0) { throw "Signing failed for $($file.Name) (exit $LASTEXITCODE): $($sigOut | Out-String)" }
  $signature = ($sigOut | ForEach-Object { $_.ToString() } | Where-Object { $_.Trim() -ne '' } | Select-String -Pattern '^dW50cnVzdGVk' | Select-Object -First 1)
  if (-not $signature) { throw "Could not extract signature from signer output for $($file.Name): $sigOut" }
  $signature = $signature.ToString().Trim()

  $dest = Join-Path $OutDir $file.Name
  Copy-Item $file.FullName $dest -Force
  $platforms[$platform] = @{
    url = "$BaseUrl/$($file.Name)"
    signature = $signature
  }
}

$manifest = @{
  version = $Version
  notes   = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = $platforms
} | ConvertTo-Json -Depth 4

$manifestPath = Join-Path $OutDir 'latest.json'
[System.IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Done. Upload the contents of '$OutDir' to $BaseUrl (e.g. toketeo-updates/scripts/upload.mjs --dir ..\toketeo\update-dist --url $BaseUrl --token <ADMIN_TOKEN>)"
