import { Server, IncomingMessage, ServerResponse } from 'node:http'
import type { Response } from 'undici'
import { createServer } from 'node:http'
import { mock } from './mock'

mock()

type FetchCallback = (request: any) => Promise<any>

type Options = {
  fetch: FetchCallback
  port?: number
  serverOptions?: Object
}

export const createAdaptorServer = (options: Options): Server => {
  const fetchCallback = options.fetch
  const requestListener = getRequestListener(fetchCallback)
  const server: Server = createServer(options.serverOptions || {}, requestListener)
  return server
}

export const serve = (options: Options): Server => {
  const server = createAdaptorServer(options)
  server.listen(options.port || 3000)
  return server
}

const getRequestListener = (fetchCallback: FetchCallback) => {
  return async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const method = incoming.method || 'GET'
    const url = `http://${incoming.headers.host}${incoming.url}`

    const headerRecord: Record<string, string> = {}
    const len = incoming.rawHeaders.length
    for (let i = 0; i < len; i++) {
      if (i % 2 === 0) {
        const key = incoming.rawHeaders[i]
        headerRecord[key] = incoming.rawHeaders[i + 1]
      }
    }

    const init = {
      method: method,
      headers: headerRecord,
    } as {
      method: string
      headers: Record<string, string>
      body?: Buffer
    }

    if (!(method === ('GET' || 'HEAD'))) {
      const buffers = []
      for await (const chunk of incoming) {
        buffers.push(chunk)
      }
      const buffer = Buffer.concat(buffers)
      init['body'] = buffer
    }

    const res: Response = await fetchCallback(new Request(url.toString(), init))

    const contentType = res.headers.get('content-type') || ''

    for (const [k, v] of res.headers) {
      outgoing.setHeader(k, v)
    }
    outgoing.statusCode = res.status

    if (res.body) {
      if (contentType.startsWith('text')) {
        outgoing.end(await res.text())
      } else if (contentType.startsWith('application/json')) {
        outgoing.end(await res.text())
      } else {
        for await (const chunk of res.body) {
          outgoing.write(chunk)
        }
        outgoing.end()
      }
    } else {
      outgoing.end()
    }
  }
}
