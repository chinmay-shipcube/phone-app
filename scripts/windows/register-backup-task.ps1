# Registers a Windows Task Scheduler job that runs backup.ps1 every night.
# Run once in an elevated PowerShell on the shop laptop:
#   .\register-backup-task.ps1 -BackupDir "G:\My Drive\CellDecor Backups" -At "22:30"

param(
  [Parameter(Mandatory = $true)] [string] $BackupDir,
  [string] $At = "22:30"
)

$script = Join-Path $PSScriptRoot "backup.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -BackupDir `"$BackupDir`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
# Runs at the next chance if the laptop was off or asleep at that time.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun

Register-ScheduledTask -TaskName "CellDecor nightly backup" -Action $action -Trigger $trigger -Settings $settings -Force
Write-Output "Scheduled daily at $At. Test it now with: Start-ScheduledTask -TaskName 'CellDecor nightly backup'"
