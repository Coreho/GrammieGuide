<#
Switches this kiosk from Grandma's Launcher to GrammieGuide.

Run in PowerShell opened with "Run as administrator", signed in to grandma's
own Windows account (the tasks belong to whoever runs this):

  powershell -ExecutionPolicy Bypass -File switch-to-grammieguide.ps1 -Installer "D:\GrammieGuide Setup 0.1.0.exe"
  powershell -ExecutionPolicy Bypass -File switch-to-grammieguide.ps1 -DryRun

Grandma's Launcher is NOT uninstalled. Its two scheduled tasks are disabled,
not deleted, so rollback-to-grandmas-launcher.ps1 brings it back in one step.
Safe to run more than once. See docs/kiosk-install.md for the whole procedure.
#>
param(
  [string]$Installer,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

function Step([string]$Text, [scriptblock]$Action) {
  if ($DryRun) { Write-Host "[dry run] $Text" } else { Write-Host $Text; & $Action }
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $DryRun -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Open PowerShell with "Run as administrator" and run this again.'
}

# 1. Turn the old launcher off. Watchdog first: otherwise it notices the app
#    stopped and starts it again a minute later.
foreach ($name in @('Grandmas Launcher Watchdog', 'Grandmas Launcher')) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if (-not $task) { Write-Host "Old task not found (that's fine): $name"; continue }
  if ($task.State -eq 'Disabled') { Write-Host "Old task already off: $name"; continue }
  Step "Turning off old task: $name" { Disable-ScheduledTask -TaskName $name | Out-Null }
}
$old = Get-Process -Name "Grandma's Launcher" -ErrorAction SilentlyContinue
if ($old) { Step "Closing Grandma's Launcher" { $old | Stop-Process -Force } }

# Early builds of the old launcher started from the Run key instead of a task.
$run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
if ($run) {
  foreach ($p in $run.PSObject.Properties) {
    if ("$($p.Value)" -match 'Grandma') {
      Write-Warning "A startup entry still opens the old launcher: '$($p.Name)'. Turn it off in Task Manager > Startup apps."
    }
  }
}

# 2. Install GrammieGuide, if an installer was given.
if ($Installer) {
  if (-not (Test-Path $Installer)) { throw "Installer not found: $Installer" }
  Step 'Running the GrammieGuide installer. Click through it; GrammieGuide opens when it finishes (say Yes to the Windows prompt).' {
    Start-Process -FilePath $Installer -Wait
  }
}

# 3. GrammieGuide's own tasks: back on, if an earlier rollback turned them off.
foreach ($name in @('GrammieGuide', 'GrammieGuideWatchdog')) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq 'Disabled') {
    Step "Turning GrammieGuide task back on: $name" { Enable-ScheduledTask -TaskName $name | Out-Null }
  }
}

if (-not (Get-ScheduledTask -TaskName 'GrammieGuide' -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host 'GrammieGuide has not set up its startup yet. Open GrammieGuide once from the Start menu'
  Write-Host 'and say Yes to the Windows prompt; it registers its startup and watchdog on first run.'
} elseif (-not (Get-Process -Name 'GrammieGuide' -ErrorAction SilentlyContinue)) {
  Step 'Starting GrammieGuide' { Start-ScheduledTask -TaskName 'GrammieGuide' }
}

Write-Host ''
Write-Host 'Done. Continue with the checklist in docs/kiosk-install.md.'
