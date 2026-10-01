/** HTTP helpers: JSON body reading, same-origin check, JSON responses. */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Read and JSON-parse a request body, bounded to 1 MiB (skill bodies live here). */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    received += buffer.length
    if (received > 1024 * 1024) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Loopback literal host names (`localhost`, `127.0.0.1`, `[::1]`), port ignored. */
function isLoopbackHost(host: string): boolean {
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1'
}

/**
 * True when an Origin-less request carries every marker of the official
 * Desktop shell's forwarded channel: that forwarder strips `origin` and
 * `sec-fetch-site` on purpose, so the plugin sees a loopback peer, a
 * loopback Host, the shell's cookie, and no proxy trace. Browsers always
 * attach Origin to POSTs, so no page can produce this shape.
 */
export function desktopForwarded(request: IncomingMessage): boolean {
  const site = request.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin') return false
  if (request.headers.forwarded !== undefined
    || request.headers['x-forwarded-for'] !== undefined
    || request.headers['x-real-ip'] !== undefined) return false
  const host = request.headers.host
  if (host === undefined || !isLoopbackHost(host)) return false
  const address = request.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * True when the request is a same-origin POST a browser page could have
 * made, or a write the official Desktop shell forwarded (Origin-less, see
 * desktopForwarded). CSRF fence (the loopback server already trusts its
 * local peer for reads): cross-site pages, `Origin: null` sandboxes, and
 * DNS-rebinding host names stay rejected.
 */
export function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  const host = request.headers.host
  if (host === undefined) return false
  if (origin === undefined) return desktopForwarded(request)
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

/** Write a JSON response. */
export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(payload)
}
