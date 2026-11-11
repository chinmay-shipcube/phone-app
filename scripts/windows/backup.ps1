# Nightly database backup for the Cell Decor billing system.
#
# Writes a compressed pg_dump into a folder that Google Drive for desktop syncs, and deletes
# backups older than $KeepDays. Schedule it with register-backup-task.ps1.
#
# Usage (PowerShell):
#   .\backup.ps1 -BackupDir "G:\My Drive\CellDecor Backups"
#
# The database password is read from the PGPASSWORD environment variable or from
# %APPDATA%\postgresql\pgpass.conf, never from this file.

param(
  [Parameter(Mandatory = $true)] [string] $BackupDir,
  [string] $Database = "celldecor",
  [string] $User = "celldecor",
  [string] $PgBin = "",
  [int] $KeepDays = 30
)

$ErrorActionPreference = "Stop"

if (-not $PgBin) {
  $found = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Name -replace '\D', '') } -Descending |
    Select-Object -First 1
  if (-not $found) { throw "PostgreSQL not found. Pass -PgBin 'C:\Program Files\PostgreSQL\<version>\bin'." }
  $PgBin = Join-Path $found.FullName "bin"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$file = Join-Path $BackupDir "celldecor_$stamp.dump"

& (Join-Path $PgBin "pg_dump.exe") --host 127.0.0.1 --username $User --format custom --file $file $Database
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

Get-ChildItem $BackupDir -Filter "celldecor_*.dump" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force

Write-Output "Backup written: $file"
