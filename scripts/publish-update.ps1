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

Write-Host "Building bundles for version $Version ..."
& node $cli build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

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
  $sigOut = & node $cli signer sign -f $PrivateKey -p $Password $file.FullName 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Signing failed for $($file.Name): $sigOut" }
  $signature = ($sigOut | Where-Object { $_.Trim() -ne '' } | Select-Object -Last 1).Trim()

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
