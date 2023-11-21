import type { Writable } from 'node:stream'
import type { OutgoingHttpHeaders } from 'node:http'

// get the nodejs Response internal kState symbol
const kState = Reflect.ownKeys(new Response()).find(k => typeof k !== 'string' && k.toString() === 'Symbol(state)') as symbol | undefined

export const kInit = Symbol('init')

/**
 * For a performance reason, we need to get the internal body of a Response
 * to avoid creating another body stream for the proxy response.
 */
export function getResponseInternalBody(response: Response) {
  if (!kState || !response || !response.body) return

  const state = (response as any)[kState]
  if (!state || !state.body) return

  return state.body as {
    source: string | Uint8Array | FormData | Blob | null
    stream: ReadableStream
    length: number | null
  }
}

export function writeFromReadableStream(stream: ReadableStream<Uint8Array>, writable: Writable) {
  if (stream.locked) {
    throw new TypeError('ReadableStream is locked.')
  }
  const reader = stream.getReader()
  if (writable.destroyed) {
    reader.cancel()
    return
  }
  writable.on('drain', onDrain)
  writable.on('close', cancel)
  writable.on('error', cancel)
  reader.read().then(flow, cancel)
  return reader.closed.finally(() => {
    writable.off('close', cancel)
    writable.off('error', cancel)
    writable.off('drain', onDrain)
  })
  function cancel(error?: any) {
    reader.cancel(error).catch(() => {})
    if (error) writable.destroy(error)
  }
  function onDrain() {
    reader.read().then(flow, cancel)
  }
  function flow({ done, value }: ReadableStreamReadResult<Uint8Array>): void | Promise<void> {
    try {
      if (done) {
        writable.end()
      } else if (writable.write(value)) {
        return reader.read().then(flow, cancel)
      }
    } catch (e) {
      cancel(e)
    }
  }
}

export function buildOutgoingHttpHeaders(
  headers: HeadersInit | null | undefined,
  outgoingHttpHeaders?: OutgoingHttpHeaders
): OutgoingHttpHeaders {
  if (!headers) return outgoingHttpHeaders || {}

  if (headers instanceof Headers || Array.isArray(headers)) {
    const res = outgoingHttpHeaders || {}
    const cookies = []
    for (const [k, v] of headers) {
      if (/^set-cookie$/i.test(k)) {
        cookies.push(v)
      } else {
        res[k] = v
      }
    }
    if (cookies.length > 0) {
      res['set-cookie'] = cookies
    }
    return res
  } else if (outgoingHttpHeaders) {
    return Object.assign(outgoingHttpHeaders, headers)
  } else {
    return headers
  }
}
