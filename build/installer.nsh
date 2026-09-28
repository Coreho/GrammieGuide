; GrammieGuide installer hooks (electron-builder "nsis.include").
;
; The app registers its own Scheduled Tasks on every start (autostart at
; logon + the watchdog; see src/main/services/reliability/scheduledTasks.ts),
; so the installer doesn't need to. Uninstalling has to remove them, though:
; left behind, the watchdog would keep trying to relaunch an exe that no
; longer exists every minute. An update runs the old uninstaller first; the
; tasks are kept then, and the new version re-registers them on launch.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec 'schtasks.exe /Delete /TN "GrammieGuideWatchdog" /F'
    nsExec::Exec 'schtasks.exe /Delete /TN "GrammieGuide" /F'
  ${endIf}
!macroend
