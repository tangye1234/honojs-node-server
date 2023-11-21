import { kInit } from './utils'

const GlobalResponse = global.Response
type GlobalResponse = globalThis.Response

type QuickBodyInit = string | null | undefined | URLSearchParams | ReadableStream | ArrayBuffer | Uint8Array
type QuickResponseInit = {
  status: number
  headers?: HeadersInit
  statusText?: string
}

class Response implements GlobalResponse {
  public static readonly error = GlobalResponse.error
  public static json(data: any, init?: ResponseInit | undefined) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      ...init,
    })
  }
  public static redirect(url: string, status = 302) {
    return new Response(null, { status, headers: { location: url } })
  }

  public [kInit]?: [QuickBodyInit, QuickResponseInit]

  #internal?: GlobalResponse
  #init?: [BodyInit | null | undefined, ResponseInit | undefined]

  public constructor(body?: BodyInit | null, init?: ResponseInit) {
    if (!body || body instanceof URLSearchParams || body instanceof ReadableStream || typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Uint8Array) {
      let headers = init?.headers
      if (typeof body === 'string' && !headers) {
        headers = { 'content-type': 'text/plain;charset=UTF-8' }
      }

      if (body instanceof ReadableStream) {
        if (body.locked) {
          throw new TypeError('ReadableStream is locked.')
        }
        // to avoid body stream being locked, we need to tee it
        // [body1, body2] = body.tee()
        // body = body1
      }
      
      this[kInit] = [body, {
        status: 200,
        ...init,
        headers
      }]
    }

    this.#init = [body, init]
  }

  #cache(): GlobalResponse {
    if (this.#internal) return this.#internal
    this.#internal = new GlobalResponse(...this.#init!)
    this[kInit] = undefined
    this.#init = undefined
    return this.#internal
  }

  public get body() {
    return this.#cache().body
  }

  public get bodyUsed() {
    return this.#cache().bodyUsed
  }

  public get headers() {
    return this.#cache().headers
  }

  public get ok() {
    return this.#cache().ok
  }

  public get redirected() {
    return this.#cache().redirected
  }

  public get status() {
    return this[kInit]?.[1].status ?? this.#cache().status
  }

  public get statusText() {
    return this.#cache().statusText
  }

  public get type() {
    return this.#cache().type
  }

  public get url() {
    return this.#cache().url
  }
  
  public blob() {
    return this.#cache().blob()
  }

  public clone() {
    return this.#cache().clone()
  }

  public json() {
    return this.#cache().json()
  }

  public text() {
    return this.#cache().text()
  }

  public arrayBuffer() {
    return this.#cache().arrayBuffer()
  }

  public formData() {
    return this.#cache().formData()
  }
}

// make sure we have the same prototype chain
Object.setPrototypeOf(Response.prototype, GlobalResponse.prototype)

export { Response }
