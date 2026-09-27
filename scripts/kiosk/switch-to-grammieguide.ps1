<#
Switches this kiosk from Grandma's Launcher to GrammieGuide.

Run in PowerShell opened with "Run as administrator", signed in to grandma's
own Windows account (the tasks belong to whoever runs this):

  powershell -ExecutionPolicy Bypass -File switch-to-grammieguide.ps1 -Installer "D:\GrammieGuide Setup 0.1.0.exe"
  powershell -ExecutionPolicy Bypass -File switch-to-grammieguide.ps1 -DryRun

Grandma's Launcher is NOT uninstalled. Its two scheduled tasks are disabled,
not deleted, and a leftover startup entry is switched off the way Task
Manager does it, so rollback-to-grandmas-launcher.ps1 brings it back in one
step. Its start-at-login stays on until GrammieGuide has set up its own: if
the install fails or is cancelled, she still gets the old launcher at sign-in.
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
if ($Installer -and -not (Test-Path $Installer)) { throw "Installer not found: $Installer" }

$oldWatchdog = 'Grandmas Launcher Watchdog'
$oldAutostart = 'Grandmas Launcher'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
# Where Task Manager > Startup apps records whether an entry is on: an odd
# first byte means off (the rest is when it was turned off, and may be zero).
$approvedKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
# Which startup entries this script turned off, so rollback turns on only those.
$recordKey = 'HKCU:\Software\GrammieGuide'
$recordName = 'OldLauncherStartupEntries'

# 1. Old watchdog off and the old launcher closed, so it doesn't reopen full
#    screen over the installer. Its start-at-login stays on for now.
$stoppedWatchdog = $false
$task = Get-ScheduledTask -TaskName $oldWatchdog -ErrorAction SilentlyContinue
if (-not $task) { Write-Host "Old task not found (that's fine): $oldWatchdog" }
elseif ($task.State -eq 'Disabled') { Write-Host "Old task already off: $oldWatchdog" }
else {
  Step "Turning off old task: $oldWatchdog" { Disable-ScheduledTask -TaskName $oldWatchdog | Out-Null }
  $stoppedWatchdog = $true
}
$old = Get-Process -Name "Grandma's Launcher" -ErrorAction SilentlyContinue
if ($old) { Step "Closing Grandma's Launcher" { $old | Stop-Process -Force } }

# 2. Install GrammieGuide and wait for its start-at-login task, which it
#    registers on first run (the installer opens it at the end). If either
#    fails, undo step 1 and stop: she must never sign in to no launcher.
try {
  if ($Installer) {
    Step 'Running the GrammieGuide installer. Click through it; GrammieGuide opens when it finishes (say Yes to the Windows prompt).' {
      $setup = Start-Process -FilePath $Installer -Wait -PassThru
      if ($setup.ExitCode -ne 0) { throw "The installer did not finish (exit code $($setup.ExitCode))." }
    }
  }
  if ($DryRun) {
    Write-Host '[dry run] Checking that GrammieGuide has set up its start-at-login (stops here if not)'
  } elseif (-not (Get-ScheduledTask -TaskName 'GrammieGuide' -ErrorAction SilentlyContinue)) {
    Write-Host 'Waiting for GrammieGuide to set up its start-at-login (say Yes to the Windows prompt)...'
    $deadline = (Get-Date).AddMinutes(3)
    while (-not (Get-ScheduledTask -TaskName 'GrammieGuide' -ErrorAction SilentlyContinue)) {
      if ((Get-Date) -gt $deadline) {
        throw 'GrammieGuide has not set up its start-at-login. Open it once from the Start menu, say Yes to the Windows prompt, then run this again without -Installer.'
      }
      Start-Sleep -Seconds 5
    }
  }
} catch {
  Write-Warning $_.Exception.Message
  Write-Warning "Nothing was switched: Grandma's Launcher still starts at sign-in."
  if ($stoppedWatchdog) { Step "Turning old task back on: $oldWatchdog" { Enable-ScheduledTask -TaskName $oldWatchdog | Out-Null } }
  $task = Get-ScheduledTask -TaskName $oldAutostart -ErrorAction SilentlyContinue
  if ($task -and $task.State -ne 'Disabled') {
    Step "Starting Grandma's Launcher again" { Start-ScheduledTask -TaskName $oldAutostart }
  } else {
    Write-Host "Open Grandma's Launcher from the Start menu."
  }
  exit 1
}

# 3. GrammieGuide now starts itself, so the old start-at-login goes off.
$task = Get-ScheduledTask -TaskName $oldAutostart -ErrorAction SilentlyContinue
if (-not $task) { Write-Host "Old task not found (that's fine): $oldAutostart" }
elseif ($task.State -eq 'Disabled') { Write-Host "Old task already off: $oldAutostart" }
else { Step "Turning off old task: $oldAutostart" { Disable-ScheduledTask -TaskName $oldAutostart | Out-Null } }

# Early builds of the old launcher started from a Run entry instead of a task.
# It removes the entry once its task exists, but one can be left behind, and
# then both launchers would open full screen at sign-in.
$turnedOff = @()
$run = Get-Item -Path $runKey -ErrorAction SilentlyContinue
if ($run) {
  foreach ($name in $run.GetValueNames()) {
    if ("$($run.GetValue($name))" -notmatch 'Grandma') { continue }
    $approved = (Get-ItemProperty -Path $approvedKey -Name $name -ErrorAction SilentlyContinue).$name
    if ($approved -and ($approved[0] % 2) -eq 1) { Write-Host "Old startup entry already off: $name"; continue }
    Step "Turning off old startup entry: $name" {
      if (-not (Test-Path $approvedKey)) { New-Item -Path $approvedKey -Force | Out-Null }
      Set-ItemProperty -Path $approvedKey -Name $name -Value ([byte[]](3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)) -Type Binary
    }
    $turnedOff += $name
  }
}
if ($turnedOff.Count -gt 0 -and -not $DryRun) {
  $recorded = @((Get-ItemProperty -Path $recordKey -Name $recordName -ErrorAction SilentlyContinue).$recordName)
  if (-not (Test-Path $recordKey)) { New-Item -Path $recordKey -Force | Out-Null }
  $all = [string[]]@($recorded + $turnedOff | Where-Object { $_ } | Select-Object -Unique)
  Set-ItemProperty -Path $recordKey -Name $recordName -Value $all -Type MultiString
}

# 4. GrammieGuide's own tasks: back on, if an earlier rollback turned them off.
foreach ($name in @('GrammieGuide', 'GrammieGuideWatchdog')) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq 'Disabled') {
    Step "Turning GrammieGuide task back on: $name" { Enable-ScheduledTask -TaskName $name | Out-Null }
  }
}
if (-not (Get-Process -Name 'GrammieGuide' -ErrorAction SilentlyContinue)) {
  Step 'Starting GrammieGuide' { Start-ScheduledTask -TaskName 'GrammieGuide' }
}

Write-Host ''
Write-Host 'Done. Continue with the checklist in docs/kiosk-install.md.'
