import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { desktopForwarded, sameOrigin } from './http.ts'

const request = (headers: Record<string, string | undefined>, address = '127.0.0.1'): IncomingMessage =>
  ({ headers, socket: { remoteAddress: address } }) as unknown as IncomingMessage

describe('sameOrigin', () => {
  it('accepts a same-origin browser POST', () => {
    expect(sameOrigin(request({ origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' }))).toBe(true)
  })
  it('rejects a cross-origin POST', () => {
    expect(sameOrigin(request({ origin: 'https://evil.example', host: '127.0.0.1:3080' }))).toBe(false)
  })
  it('rejects Origin: null (sandboxed iframe / file://)', () => {
    expect(sameOrigin(request({ origin: 'null', host: '127.0.0.1:3080' }))).toBe(false)
  })
  it('rejects a missing Host', () => {
    expect(sameOrigin(request({ origin: 'http://127.0.0.1:3080' }))).toBe(false)
  })
  it('accepts the desktop shell channel: no Origin, loopback Host, loopback peer', () => {
    expect(sameOrigin(request({ host: '127.0.0.1:19387' }))).toBe(true)
    expect(sameOrigin(request({ host: 'localhost:19387' }))).toBe(true)
    expect(sameOrigin(request({ host: '[::1]:19387' }))).toBe(true)
  })
  it('keeps sec-fetch-site: same-origin on the desktop channel, rejects anything else', () => {
    expect(sameOrigin(request({ host: '127.0.0.1:19387', 'sec-fetch-site': 'same-origin' }))).toBe(true)
    expect(sameOrigin(request({ host: '127.0.0.1:19387', 'sec-fetch-site': 'cross-site' }))).toBe(false)
    expect(sameOrigin(request({ host: '127.0.0.1:19387', 'sec-fetch-site': 'same-site' }))).toBe(false)
    expect(sameOrigin(request({ host: '127.0.0.1:19387', 'sec-fetch-site': 'none' }))).toBe(false)
  })
  it('rejects an Origin-less request that carries a proxy trace', () => {
    expect(sameOrigin(request({ host: '127.0.0.1:19387', forwarded: 'for=10.0.0.1' }))).toBe(false)
    expect(sameOrigin(request({ host: '127.0.0.1:19387', 'x-forwarded-for': '10.0.0.1' }))).toBe(false)
    expect(sameOrigin(request({ host: '127.0.0.1:19387', 'x-real-ip': '10.0.0.1' }))).toBe(false)
  })
  it('rejects an Origin-less request with a non-loopback Host (DNS rebinding)', () => {
    expect(sameOrigin(request({ host: 'evil.example:3080' }))).toBe(false)
    expect(sameOrigin(request({ host: '192.168.1.5:3080' }))).toBe(false)
  })
  it('rejects an Origin-less request from a non-loopback peer', () => {
    expect(sameOrigin(request({ host: '127.0.0.1:19387' }, '10.0.0.1'))).toBe(false)
    expect(sameOrigin(request({ host: '127.0.0.1:19387' }, '192.168.1.5'))).toBe(false)
  })
})

describe('desktopForwarded', () => {
  it('is exactly the Origin-less loopback shape, with the socket peer as the last gate', () => {
    expect(desktopForwarded(request({ host: '127.0.0.1:19387' }))).toBe(true)
    expect(desktopForwarded(request({ host: '127.0.0.1:19387' }, '::ffff:127.0.0.1'))).toBe(true)
    expect(desktopForwarded(request({ host: '127.0.0.1:19387' }, '::1'))).toBe(true)
    expect(desktopForwarded({ headers: { host: '127.0.0.1:19387' }, socket: {} } as unknown as IncomingMessage)).toBe(false)
  })
})
