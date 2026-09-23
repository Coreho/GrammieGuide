import type { Config } from './configSchema'

/**
 * Single source of truth for every IPC channel: name, request payload, and
 * response type. Both main (src/main/ipc/*) and preload (src/preload/*)
 * import from here, so a renamed/removed channel is a compile error in both
 * places instead of a silent runtime `undefined` - the old app's ipc.js and
 * its preloads duplicated ~40 channel names independently with no link
 * between them.
 */

export type ReliabilityEvent = {
  ts: string
  op: string
  ok: boolean
  detail?: string
  durationMs?: number
}

export interface IpcApi {
  'config:get': { request: void; response: Config }
  'config:set': { request: Partial<Config>; response: Config }
  'reliability:getLog': { request: { limit?: number }; response: ReliabilityEvent[] }
  'reliability:testVolume': { request: void; response: ReliabilityEvent }
  'reliability:testWifiDiscovery': { request: void; response: ReliabilityEvent }
  'reliability:testWatchdogRegistration': { request: void; response: ReliabilityEvent }
}

export type IpcChannel = keyof IpcApi
export type IpcRequest<C extends IpcChannel> = IpcApi[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcApi[C]['response']
