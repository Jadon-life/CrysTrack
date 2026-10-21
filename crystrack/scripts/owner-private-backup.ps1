#requires -Version 5.1
<#
  User-operated, private, READ-ONLY hosted backup CAPTURE (not restoration).
  Never paste the URL/password/files into ChatGPT, GitHub, screenshots or tickets.
  Requires Supabase CLI and its documented db dump Docker dependency.
  No hosted migrations, DELETE/UPDATE, DB resets, Vercel or role edits.
  Execute from a private local machine, not GitHub Actions.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('yfzglhwjtpirbwhqatdx')]
  [string]$ProjectRef,
  [string]$DestinationRoot = (Join-Path $env:LOCALAPPDATA 'CrysTrack-private-backups')
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command 'supabase' -ErrorAction SilentlyContinue)) {
  throw 'Supabase CLI is not installed; use the official installation guide first.'
}
& supabase db dump --help *> $null
if ($LASTEXITCODE -ne 0) { throw 'Supabase CLI does not expose db dump.' }

$fullRoot = [System.IO.Path]::GetFullPath($DestinationRoot)
if ($fullRoot -match '(?i)(\\|/)(onedrive|dropbox|google.drive|repos?|github|crystrack)(\\|/)' -or
    $fullRoot -match '(?i)(\\|/)projects?(\\|/)') {
  throw 'Choose an encrypted PRIVATE local directory outside synced drives or source repositories.'
}
if ($fullRoot.StartsWith('\\') -or $fullRoot.StartsWith('//')) {
  throw 'Network-share destinations are not accepted for private backups.'
}
Write-Host 'CrysTrack backup capture. Current source project: yfzglhwjtpirbwhqatdx (PostgreSQL 17).'
Write-Host 'This tool writes THREE local SQL files with sensitive account data.'
Write-Host 'It will NOT verify a restore and it will NOT touch hosted data.'
Write-Host 'Use a BitLocker-protected drive or another owner-controlled encrypted volume.'
$ack = Read-Host 'Type BACKUP-CRYSTRACK to confirm that this is your private, encrypted local machine'
if ($ack -cne 'BACKUP-CRYSTRACK') { throw 'No files created: acknowledgement not provided.' }

$secret = Read-Host 'Paste the CrysTrack-only Session Pooler or direct DATABASE connection URL (masked)' -AsSecureString
$databaseUrl = $null
$bytes = $null
try {
  $credential = New-Object System.Net.NetworkCredential('', $secret)
  $databaseUrl = $credential.Password
  $uri = [Uri]$databaseUrl
  if ($uri.Scheme -notin @('postgres', 'postgresql') -or $uri.AbsolutePath -ne '/postgres') {
    throw 'Expected a PostgreSQL connection URL ending in /postgres.'
  }
  $userName = [Uri]::UnescapeDataString(($uri.UserInfo -split ':',2)[0])
  $expectedPoolerUser = 'postgres.' + $ProjectRef
  $validDirect = $uri.Host -ceq ('db.' + $ProjectRef + '.supabase.co') -and $userName -ceq 'postgres'
  $validPooler = $uri.Host -match '(?i)^([a-z0-9-]+\.)*pooler\.supabase\.com$' -and
    $userName -ceq $expectedPoolerUser
  if (-not ($validDirect -or $validPooler)) {
    throw 'Connection does not identify the expected CrysTrack project. Refusing to back up another database.'
  }
  if ($uri.Port -notin @(5432, 6543)) {
    throw 'Unexpected DB port. Get a current Session Pooler (5432) connection URL from CrysTrack > Connect.'
  }
  if ($uri.UserInfo -notmatch ':') { throw 'Database password is missing from the URL.' }

  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $target = Join-Path $fullRoot ('private-' + $ProjectRef + '-' + $stamp)
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  $roles = Join-Path $target 'roles.sql'
  $schema = Join-Path $target 'schema.sql'
  $data = Join-Path $target 'data.sql'

  # Supabase official CLI backup order. Note that Supabase Storage file
  # OBJECT BYTES and hosting config/secrets are NOT contained in SQL dumps.
  & supabase db dump --db-url $databaseUrl -f $roles --role-only
  if ($LASTEXITCODE -ne 0) { throw 'Role backup failed. NO release permission granted.' }
  & supabase db dump --db-url $databaseUrl -f $schema
  if ($LASTEXITCODE -ne 0) { throw 'Schema backup failed. NO release permission granted.' }
  & supabase db dump --db-url $databaseUrl -f $data --use-copy --data-only -x 'storage.buckets_vectors' -x 'storage.vector_indexes'
  if ($LASTEXITCODE -ne 0) { throw 'Data backup failed. NO release permission granted.' }

  $items = @()
  foreach ($name in @('roles.sql','schema.sql','data.sql')) {
    $file = Join-Path $target $name
    $item = Get-Item -LiteralPath $file
    if ($item.Length -eq 0) { throw "$name is empty. Backup cannot be approved." }
    $hash = Get-FileHash -LiteralPath $file -Algorithm SHA256
    $items += [pscustomobject]@{ file = $name; bytes = $item.Length; sha256 = $hash.Hash }
  }
  $report = [pscustomobject]@{
    projectRef = $ProjectRef
    capturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    captureSucceeded = $true
    restoreVerified = $false
    storageObjectBytesBackedUp = $false
    files = $items
  }
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target 'capture-manifest.json') -Encoding UTF8
  Write-Host "CAPTURED ONLY: $target"
  Write-Host 'SHA-256 checksums are saved privately in capture-manifest.json.'
  Write-Host 'STOP: capture is NOT a verified restore and does NOT include Storage object bytes.'
  Write-Host 'Keep files encrypted/off-site and follow docs/owner-private-backup-checklist.md.'
} finally {
  $databaseUrl = $null
  $credential = $null
  $secret = $null
  $uri = $null
}
