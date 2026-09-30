import { describe, it, expect } from 'vitest'
import { classifyLoadFailure, describeLoadFailure } from '../../src/shared/browser/loadFailure'

describe('classifyLoadFailure', () => {
  it('ignores success codes and deliberate cancellations', () => {
    expect(classifyLoadFailure(0, true)).toBeNull()
    expect(classifyLoadFailure(-3, true)).toBeNull() // ERR_ABORTED
    expect(classifyLoadFailure(-3, false)).toBeNull()
  })

  it('calls connection errors offline', () => {
    expect(classifyLoadFailure(-106, true)).toBe('offline') // ERR_INTERNET_DISCONNECTED
    expect(classifyLoadFailure(-21, true)).toBe('offline') // ERR_NETWORK_CHANGED
    expect(classifyLoadFailure(-137, true)).toBe('offline') // ERR_NAME_RESOLUTION_FAILED
  })

  it('calls any failure offline when Windows reports no connection', () => {
    expect(classifyLoadFailure(-105, false)).toBe('offline') // ERR_NAME_NOT_RESOLVED
    expect(classifyLoadFailure(-102, false)).toBe('offline') // ERR_CONNECTION_REFUSED
  })

  it('calls other failures unreachable while the device is online', () => {
    expect(classifyLoadFailure(-105, true)).toBe('unreachable') // ERR_NAME_NOT_RESOLVED
    expect(classifyLoadFailure(-102, true)).toBe('unreachable') // ERR_CONNECTION_REFUSED
    expect(classifyLoadFailure(-200, true)).toBe('unreachable') // ERR_CERT_COMMON_NAME_INVALID
    expect(classifyLoadFailure(-118, true)).toBe('unreachable') // ERR_CONNECTION_TIMED_OUT
  })
})

describe('describeLoadFailure', () => {
  it('logs the domain and error name, never the path or query', () => {
    expect(
      describeLoadFailure('https://news.example.org/story/42?who=grandma', 'ERR_CONNECTION_REFUSED')
    ).toBe('news.example.org: ERR_CONNECTION_REFUSED')
  })

  it('still logs something for odd input', () => {
    expect(describeLoadFailure('not a url', '')).toBe('unknown site: unknown error')
    expect(describeLoadFailure('http://127.0.0.1:9/', ' ERR_ADDRESS_INVALID ')).toBe(
      '127.0.0.1: ERR_ADDRESS_INVALID'
    )
  })
})
