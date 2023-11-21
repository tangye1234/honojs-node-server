import { Readable } from 'node:stream'
import { IncomingMessage } from 'node:http'
import type { Http2ServerRequest } from 'node:http2'
import type { Socket } from 'node:net'

interface HonoRequest extends Request {
  new (incoming: IncomingMessage | Http2ServerRequest): HonoRequest
}

class HonoRequest {
  #internal?: Request
  #init?: IncomingMessage | Http2ServerRequest

  #method: string
  #url: string

  constructor(incoming: IncomingMessage | Http2ServerRequest) {
    const secure = !!(incoming.socket as any)?.encypted
    const scheme = secure ? 'https' : 'http'
    const host = incoming.headers.host || toHost(incoming.socket, secure)

    this.#url = `${scheme}://${host}${incoming.url}`
    this.#method = incoming.method || 'GET'
    this.#init = incoming
  }

  public get url() {
    return this.#url
  }

  public get method() {
    return this.#method
  }

  #cache(): Request {
    if (this.#internal) return this.#internal
    
    const incoming = this.#init!
    const method = this.#method
    const url = this.#url
    const headers: [string, string][] = []
    const len = incoming.rawHeaders.length
    for (let i = 0; i < len; i += 2) {
      headers.push([incoming.rawHeaders[i], incoming.rawHeaders[i + 1]])
    }

    const init = {
      method,
      headers,
    } as RequestInit

    if (!(method === 'GET' || method === 'HEAD')) {
      // lazy-consume request body
      init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>
      // node 18 fetch needs half duplex mode when request body is stream
      ;(init as any).duplex = 'half'
    }

    this.#internal = new Request(url, init)
    this.#init = undefined
    return this.#internal
  }

  public get cache() {
    return this.#cache().cache
  }

  public get credentials() {
    return this.#cache().credentials
  }

  public get destination() {
    return this.#cache().destination
  }

  public get headers() {
    return this.#cache().headers
  }

  public get integrity() {
    return this.#cache().integrity
  }

  public get keepalive() {
    return this.#cache().keepalive
  }

  public get mode() {
    return this.#cache().mode
  }

  public get redirect() {
    return this.#cache().redirect
  }

  public get referrer() {
    return this.#cache().referrer
  }

  public get referrerPolicy() {
    return this.#cache().referrerPolicy
  }

  public get signal() {
    return this.#cache().signal
  }

  public get body() {
    return this.#cache().body
  }

  public get bodyUsed() {
    return this.#cache().bodyUsed
  }

  public clone(): Request {
    return this.#cache().clone()
  }

  public arrayBuffer() {
    return this.#cache().arrayBuffer()
  }

  public blob() {
    return this.#cache().blob()
  }

  public formData() {
    return this.#cache().formData()
  }

  public json() {
    return this.#cache().json()
  }

  public text() {
    return this.#cache().text()
  }
}

function toHost(socket: Socket | undefined, secure: boolean) {
  const host = socket?.remoteAddress || 'localhost'
  const port = socket?.remotePort || (secure ? 443 : 80)
  if (secure && port === 443 || !secure && port === 80) return host
  return `${host}:${port}`
}

// make sure HonoRequest is a subclass of Request
Object.setPrototypeOf(HonoRequest.prototype, Request.prototype)

export { HonoRequest }
