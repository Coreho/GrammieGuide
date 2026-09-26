/**
 * The one place overlay stacking order is defined. Every overlay/canvas
 * component imports its z-index from here instead of hardcoding a number.
 *
 * The old app scattered z-index values (0,1,2,5,10,11,20,100,120,900,1000,
 * 1050,1100,1200) across 10+ files with no shared scale - this file exists
 * specifically to prevent that from recurring.
 */
export const zLayers = {
  homeBackground: 0,
  homeContent: 10,
  buddyCanvas: 20,
  navBar: 30,
  tilePicker: 100,
  weatherOverlay: 200,
  confusionOverlay: 300,
  buddyChat: 350,
  /** Buddy's floor while the chat panel is open: above its dimmed backdrop, so she sees him listen and talk. */
  buddyInChat: 360,
  helpOverlay: 400,
  incomingCall: 500,
  activeCall: 510,
  dailyCheckin: 600
} as const

export type ZLayerName = keyof typeof zLayers
