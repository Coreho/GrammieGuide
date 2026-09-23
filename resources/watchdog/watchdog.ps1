# GrammieGuide - external watchdog.
#
# Runs independently of the Electron app (via a separate Scheduled Task,
# invoked every minute) so it can recover the kiosk even if the main process
# itself has hung and stopped responding to its own global shortcuts.
# Single-shot: checks once, acts if needed, exits. No long-running loop.
#
# Ported from grandmas-launcher's resources/watchdog/watchdog.ps1, re-saved
# ASCII-only / UTF-8-BOM to close a mojibake bug found in that file (a
# comment corrupted by a past encoding mishap).

param(
  [Parameter(Mandatory = $true)][string]$HeartbeatPath,
  [Parameter(Mandatory = $true)][string]$ExePath,
  [int]$StaleThresholdSeconds = 90
)

$ErrorActionPreference = 'SilentlyContinue'
$logPath = Join-Path (Split-Path $HeartbeatPath -Parent) 'safety-events.log'

function Write-SafetyEvent([string]$Type, [string]$Detail) {
  $entry = @{ ts = (Get-Date).ToString('o'); type = $Type; detail = $Detail } | ConvertTo-Json -Compress
  Add-Content -Path $logPath -Value $entry -Encoding UTF8
}

if (-not (Test-Path $HeartbeatPath)) {
  # App may still be starting up for the first time - nothing to act on yet.
  exit 0
}

# Intentional exit: the launcher drops quit-flag.txt when quit via its own
# quit shortcut, so a closed kiosk stays closed. The app deletes the flag on
# its next start, which re-arms this watchdog.
$quitFlagPath = Join-Path (Split-Path $HeartbeatPath -Parent) 'quit-flag.txt'
if (Test-Path $quitFlagPath) {
  exit 0
}

# Grace period after boot/resume. On wake from sleep this task can fire
# (via -StartWhenAvailable) before the app's heartbeat interval writes a
# fresh beat, so the pre-sleep timestamp looks stale even though the kiosk
# is healthy. If the machine has been up for less than the stale threshold,
# the app hasn't had a fair chance to prove liveness yet - skip this cycle.
$lastBoot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
if ($lastBoot) {
  $uptimeSeconds = ((Get-Date) - $lastBoot).TotalSeconds
  if ($uptimeSeconds -lt $StaleThresholdSeconds) {
    exit 0
  }
}

$lastWrite = (Get-Item $HeartbeatPath).LastWriteTimeUtc
$ageSeconds = ((Get-Date).ToUniversalTime() - $lastWrite).TotalSeconds

if ($ageSeconds -lt $StaleThresholdSeconds) {
  exit 0
}

$exeName = [System.IO.Path]::GetFileNameWithoutExtension($ExePath)
$proc = Get-Process -Name $exeName -ErrorAction SilentlyContinue

Write-SafetyEvent 'watchdog-hang-detected' "heartbeat stale $ageSeconds s (process running: $([bool]$proc))"

if ($proc) {
  $proc | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

try {
  Start-Process -FilePath $ExePath -ErrorAction Stop
  Write-SafetyEvent 'watchdog-relaunch-succeeded' $ExePath
} catch {
  Write-SafetyEvent 'watchdog-relaunch-failed' $_.Exception.Message
}
