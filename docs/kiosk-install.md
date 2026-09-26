# Installing GrammieGuide on the kiosk

This moves grandma's computer from **Grandma's Launcher** to **GrammieGuide**
without uninstalling the old launcher. The old one is only switched off, so
going back is one command (see [Rolling back](#rolling-back)).

Allow about 30 minutes. You need:

- the installer, `GrammieGuide Setup <version>.exe` (built with `npm run package`, found in `dist/`)
- the `scripts/kiosk/` folder from this repo
- a USB stick to carry both
- grandma's Windows account, signed in. It should be an administrator
  account: Wi-Fi self-healing and a UAC-free start both need that (see
  [Limits](#limits))
- her Anthropic API key, if Buddy should chat

## 1. Get to the desktop

The old launcher is full screen. Press **Ctrl+Shift+Escape** (its caregiver
escape back to Windows). If that doesn't work, press **Ctrl+Shift+Q** to quit it.
It may come back within a minute, because its watchdog is still on until
step 2 turns it off. If that happens, just escape again.

Copy the installer and the `kiosk` folder from the USB stick to the Desktop.

## 2. Switch over

1. Open **Start**, type `PowerShell`, right-click **Windows PowerShell**, and
   choose **Run as administrator**.
2. Run the command below, replacing the version in the installer name if it
   differs. Add `-DryRun` first to see what it will do without changing anything.

   ```powershell
   cd $HOME\Desktop\kiosk
   powershell -ExecutionPolicy Bypass -File .\switch-to-grammieguide.ps1 -Installer "$HOME\Desktop\GrammieGuide Setup 0.1.0.exe"
   ```

   The script:
   - turns off the old launcher's watchdog and its start-at-login task (it
     disables them; nothing is deleted);
   - closes the old launcher;
   - runs the GrammieGuide installer.
3. Click through the installer. At the end GrammieGuide opens. Say **Yes** to
   the Windows prompt: on this first run it sets up its own start-at-login
   task and its watchdog.

## 3. Set up GrammieGuide

Press **Ctrl+Shift+A** to open the caregiver panel.

1. **Set a PIN.** The old launcher's PIN doesn't carry over.
2. **Tiles** → **Import settings from Grandma's Launcher…** This shows what
   it will bring over: text size, weather location, volume limit and
   confusion timings. Click **Import**. The old launcher's own settings are
   only read, never changed.
3. **Tiles** → set up her Home tiles fresh. The old launcher's tiles are
   deliberately not copied.
4. **Buddy** → paste the Anthropic API key (the old OpenRouter key doesn't
   work here). Choose a voice and click **Try this voice**. Leave roaming and
   read-aloud on unless there's a reason not to.
5. **Weather** → add her town if the import didn't bring one.
6. Close the caregiver panel.

## 4. Check it

| Check | How | Expected |
|---|---|---|
| Starts by itself | Restart the computer | GrammieGuide opens full screen with no Windows prompt |
| Startup and watchdog are set up | Caregiver panel → **Reliability** → **Refresh log** | `autostart-register` and `watchdog-register` both ok, "highest run level" |
| Watchdog recovers it | Task Manager → end **GrammieGuide** | It reopens within about 3 minutes |
| A deliberate quit stays quit | Press **Ctrl+Shift+Q** | It stays closed. Reopen it from the Start menu (that re-arms the watchdog) |
| Volume limit | Turn the volume up past the limit | Back down within 30 seconds |
| Buddy | Tap the cat | Chat opens and he walks over. **Talk** shows if a microphone is found |
| Wi-Fi healing (optional) | Unplug the router for 2 minutes | The **Activity** tab shows `network-lost`, then `wifi-restart-triggered` |

If the Reliability log shows "limited run level", grandma's account isn't an
administrator. Everything works except the Wi-Fi restart.

## Rolling back

In an administrator PowerShell:

```powershell
cd $HOME\Desktop\kiosk
powershell -ExecutionPolicy Bypass -File .\rollback-to-grandmas-launcher.ps1
```

This turns GrammieGuide's tasks off, closes it, turns the old launcher's
tasks back on, and starts it. GrammieGuide stays installed. It won't
re-enable its own tasks even if someone opens it later, so the two never both
start at login. To go forward again, run `switch-to-grammieguide.ps1` without
`-Installer`.

## Updating GrammieGuide later

Run the new installer. Settings are kept. Installing over the top keeps the
start-at-login and watchdog tasks, and the new version refreshes them when it
first runs.

## Uninstalling

**Settings → Apps → GrammieGuide → Uninstall.** This removes both scheduled
tasks as well. Her settings folder is left in place in case of a reinstall.

## Where things are

| What | Where |
|---|---|
| Program | `C:\Program Files\GrammieGuide\` |
| Settings | `%APPDATA%\grammieguide\grammieguide-config.json` |
| Watchdog heartbeat and its log | `%APPDATA%\grammieguide\heartbeat.txt`, `safety-events.log` |
| Scheduled tasks | Task Scheduler Library: `GrammieGuide` (at login), `GrammieGuideWatchdog` (every minute) |
| Old launcher | untouched: `Grandma's Launcher` in Program Files, settings in `%APPDATA%\grandmas-launcher\` |

## Limits

- **Standard account:** on a non-administrator account the tasks run
  without admin rights, so the Wi-Fi adapter can't be restarted. On an
  administrator account the first launch shows one UAC prompt; after that the
  start-at-login task runs it without one.
- **Keyboard:** the Windows key and Alt+Tab can't be blocked from inside the
  app (same as the old launcher).
- **Sign-in:** automatic sign-in into her account is a Windows setting
  (`netplwiz`), not the launcher's. If the old launcher started without a
  password prompt, that's already set.
