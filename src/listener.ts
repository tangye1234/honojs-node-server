import './globals'

import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http'
import type { Http2ServerRequest, Http2ServerResponse } from 'node:http2'
import { HonoRequest } from './request'
import type { FetchCallback } from './types'
import { getResponseInternalBody, writeFromReadableStream, kInit, buildOutgoingHttpHeaders } from './utils'
import type { Response as HonoResponse } from './response'

export const getRequestListener = (fetchCallback: FetchCallback) => {
  return async (
    incoming: IncomingMessage | Http2ServerRequest,
    outgoing: ServerResponse | Http2ServerResponse
  ) => {
    const request = new HonoRequest(incoming)
    let res: Response

    try {
      const resOrPromise = fetchCallback(request) as Response | Promise<Response>
      // in order to avoid another await for response
      res = resOrPromise instanceof Response ? resOrPromise : await resOrPromise
    } catch (e: unknown) {
      res = new Response(null, { status: 500 })
      if (e instanceof Error) {
        // timeout error emits 504 timeout
        if (e.name === 'TimeoutError' || e.constructor.name === 'TimeoutError') {
          res = new Response(null, { status: 504 })
        }
      }
    }

    // do not write response if outgoing is already finished
    if (outgoing.destroyed || outgoing.writableEnded) {
      console.info('The response is already finished.')
      return
    }

    if (outgoing.headersSent) {
      outgoing.destroy()
      console.info('The response has already been sent.')
      return
    }

    let body: Uint8Array | string | null = null
    let stream: ReadableStream<Uint8Array> | null = null
    let headers: HeadersInit | undefined
    let outgoingHttpHeaders: OutgoingHttpHeaders = {}
    let status = 200
    let statusText: string | undefined
    let length: number | undefined

    // avoid creating real Response if possible
    const init = (res as unknown as HonoResponse)[kInit]

    if (init) {
      // the response has a simple body
      const [kBody, rInit] = init
      
      if (rInit) {
        headers = rInit.headers
        status = rInit.status
        statusText = rInit.statusText
      }

      if (kBody) {
        if (kBody instanceof ReadableStream) {
          stream = kBody
        } else if (kBody instanceof ArrayBuffer) {
          body = Buffer.from(kBody)
          length = body.byteLength
        } else if (typeof kBody === 'string' || kBody instanceof Uint8Array) {
          body = kBody
          length = Buffer.byteLength(body)
        } else if (kBody instanceof URLSearchParams) {
          body = kBody.toString()
          length = Buffer.byteLength(body)
          outgoingHttpHeaders['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
        } else {
          throw new TypeError('Invalid body type')
        }
      }
    } else {
      // first try to get the internal body state of the Response
      let { source = null, length: len = null } = getResponseInternalBody(res) || {}
      if (typeof source === 'string' || source instanceof Uint8Array) {
        body = source
      }

      if (len !== null && body !== null) {
        length = len
      }

      stream = res.body
      headers = res.headers
      status = res.status
      statusText = res.statusText
    }

    // try to get the native nodejs internal body state if we can
    buildOutgoingHttpHeaders(headers, outgoingHttpHeaders)

    if (
      outgoingHttpHeaders['content-length'] === undefined &&
      outgoingHttpHeaders['transfer-encoding'] === undefined &&
      length !== undefined
    ) {
      // add content-length header if we can
      outgoingHttpHeaders['content-length'] = String(length)
      // delete outgoingHttpHeaders['Content-Length']
      // delete outgoingHttpHeaders['transfer-encoding']
    }

    // now we can write the response headers and status
    statusText
      ? outgoing.writeHead(status, statusText, outgoingHttpHeaders)
      : outgoing.writeHead(status, outgoingHttpHeaders)

    if (
      request.method === 'HEAD' ||
      res.status === 204 ||
      res.status === 304
    ) {
      outgoing.end()
    } else if (body != null) {
      outgoing.end(body)
    } else if (stream) {
      try {
        await writeFromReadableStream(stream, outgoing)
      } catch (e: unknown) {
        const err = (e instanceof Error ? e : new Error('unknown error', { cause: e })) as Error & {
          code: string
        }
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
          console.info('The user aborted a request.')
        } else {
          console.error(e)
          outgoing.destroy(err)
        }
      }
    } else {
      outgoing.end()
    }
  }
}
