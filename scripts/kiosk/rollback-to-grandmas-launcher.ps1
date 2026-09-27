<#
Puts Grandma's Launcher back in charge of this kiosk (the undo for
switch-to-grammieguide.ps1).

Run in PowerShell opened with "Run as administrator", signed in to grandma's
own Windows account:

  powershell -ExecutionPolicy Bypass -File rollback-to-grandmas-launcher.ps1
  powershell -ExecutionPolicy Bypass -File rollback-to-grandmas-launcher.ps1 -DryRun

GrammieGuide is NOT uninstalled; its tasks are disabled, and it leaves a
disabled task alone even if someone opens it later, so the two launchers
never both start at logon. Switch forward again with switch-to-grammieguide.ps1.
#>
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'

function Step([string]$Text, [scriptblock]$Action) {
  if ($DryRun) { Write-Host "[dry run] $Text" } else { Write-Host $Text; & $Action }
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $DryRun -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Open PowerShell with "Run as administrator" and run this again.'
}

# 1. GrammieGuide off - watchdog first, so it doesn't restart what we close.
foreach ($name in @('GrammieGuideWatchdog', 'GrammieGuide')) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($task -and $task.State -ne 'Disabled') {
    Step "Turning off GrammieGuide task: $name" { Disable-ScheduledTask -TaskName $name | Out-Null }
  }
}
$gg = Get-Process -Name 'GrammieGuide' -ErrorAction SilentlyContinue
if ($gg) { Step 'Closing GrammieGuide' { $gg | Stop-Process -Force } }

# 2. The old launcher back on.
$found = $false
foreach ($name in @('Grandmas Launcher', 'Grandmas Launcher Watchdog')) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if (-not $task) { Write-Warning "Old task not found: $name"; continue }
  $found = $true
  if ($task.State -eq 'Disabled') { Step "Turning old task back on: $name" { Enable-ScheduledTask -TaskName $name | Out-Null } }
}

# A leftover startup entry the switch turned off (only those it recorded, so
# one someone turned off in Task Manager on purpose stays off).
$approvedKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$recordKey = 'HKCU:\Software\GrammieGuide'
$recordName = 'OldLauncherStartupEntries'
$recorded = @((Get-ItemProperty -Path $recordKey -Name $recordName -ErrorAction SilentlyContinue).$recordName) | Where-Object { $_ }
foreach ($name in $recorded) {
  Step "Turning old startup entry back on: $name" {
    Set-ItemProperty -Path $approvedKey -Name $name -Value ([byte[]](2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)) -Type Binary
  }
}
if ($recorded) { Step 'Clearing the record of startup entries the switch turned off' { Remove-ItemProperty -Path $recordKey -Name $recordName } }

if ($found -and -not (Get-Process -Name "Grandma's Launcher" -ErrorAction SilentlyContinue)) {
  Step "Starting Grandma's Launcher" { Start-ScheduledTask -TaskName 'Grandmas Launcher' }
} elseif (-not $found) {
  Write-Host "Grandma's Launcher's tasks weren't found. Start it from the Start menu; it sets up its own startup when it runs."
}

Write-Host ''
Write-Host "Done. Grandma's Launcher is back; restart the computer to confirm it starts on its own."
