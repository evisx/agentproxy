import { getRuntimeConfig, type ProxyEnv } from './config'
import { ProxyError, jsonErrorResponse } from './errors'
import { createUpstreamHeaders, cloneResponseHeaders } from './headers'
import { resolveUpstreamUrl } from './routing'

export type { ProxyEnv } from './config'

export type FetchImplementation = (request: Request) => Promise<Response>

function createUpstreamRequest(request: Request, upstreamUrl: URL): Request {
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: createUpstreamHeaders(request.headers),
    redirect: 'manual',
  }

  if (request.body !== null && request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }

  return new Request(upstreamUrl, init)
}

function createClientResponse(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: cloneResponseHeaders(response),
  })
}

export async function handleProxyRequest(
  request: Request,
  env: ProxyEnv = {},
  fetchImplementation: FetchImplementation = fetch,
): Promise<Response> {
  try {
    const requestUrl = new URL(request.url)
    const config = getRuntimeConfig(env, requestUrl)
    const { upstreamUrl } = resolveUpstreamUrl(requestUrl, config)
    const upstreamRequest = createUpstreamRequest(request, upstreamUrl)
    const upstreamResponse = await fetchImplementation(upstreamRequest)

    return createClientResponse(upstreamResponse)
  } catch (error) {
    if (error instanceof ProxyError) {
      return error.toResponse()
    }

    return jsonErrorResponse(502, 'UPSTREAM_FETCH_FAILED', '上游请求失败')
  }
}
