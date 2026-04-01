import { handleProxyRequest } from './proxy'
import type { ProxyEnv } from './config'

export default {
  async fetch(request: Request, env: ProxyEnv): Promise<Response> {
    return handleProxyRequest(request, env)
  },
}
