import { contextBridge } from 'electron'
import { steerCallMedia } from '@shared/whatsAppMedia'

// Runs in WhatsApp's page before WhatsApp's own scripts, so its first camera or
// microphone request already goes to the plugged-in webcam and Windows' default
// microphone (TASK-90). Only WhatsApp's own origin, and never a redirect target.
if (location.origin === 'https://web.whatsapp.com') {
  try {
    contextBridge.executeInMainWorld({ func: steerCallMedia })
  } catch {
    // Experimental API: without it WhatsApp keeps choosing its own devices.
  }
}
