import { ProxyError } from './errors'
import type { RuntimeConfig } from './config'

type UpstreamProtocol = 'http' | 'https'

export interface ResolvedUpstream {
  upstreamUrl: URL
}

function stripBasePath(pathname: string, routeBasePath: string): string {
  if (!routeBasePath) {
    return pathname
  }

  if (pathname === routeBasePath) {
    return '/'
  }

  if (!pathname.startsWith(`${routeBasePath}/`)) {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '请求路径不在代理前缀下')
  }

  return pathname.slice(routeBasePath.length) || '/'
}

function getProxyProtocol(segment: string): UpstreamProtocol {
  if (segment === 'proxy') {
    return 'http'
  }

  if (segment === 'proxyssl') {
    return 'https'
  }

  throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
}

function isPublicProxyRoute(segment: string): boolean {
  return segment === 'proxy' || segment === 'proxyssl'
}

function decodeAuthority(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new ProxyError(400, 'INVALID_AUTHORITY', '上游 authority 编码无效')
  }
}

function validateAuthority(
  authority: string,
  protocol: UpstreamProtocol,
  selfTargets: Set<string>,
): URL {
  if (!authority) {
    throw new ProxyError(400, 'MISSING_AUTHORITY', '缺少上游 authority')
  }

  if (
    authority.includes('://') ||
    authority.includes('/') ||
    authority.includes('\\') ||
    authority.includes('?') ||
    authority.includes('#') ||
    authority.includes('@') ||
    /\s/.test(authority)
  ) {
    throw new ProxyError(400, 'INVALID_AUTHORITY', '上游 authority 必须是 host 或 host:port')
  }

  let upstreamUrl: URL

  try {
    upstreamUrl = new URL(`${protocol}://${authority}/`)
  } catch {
    throw new ProxyError(400, 'INVALID_AUTHORITY', '上游 authority 无法解析')
  }

  if (!upstreamUrl.hostname || upstreamUrl.pathname !== '/') {
    throw new ProxyError(400, 'INVALID_AUTHORITY', '上游 authority 无效')
  }

  const upstreamHostname = upstreamUrl.hostname.toLowerCase()
  const upstreamHost = upstreamUrl.host.toLowerCase()

  if (selfTargets.has(upstreamHostname) || selfTargets.has(upstreamHost)) {
    throw new ProxyError(403, 'SELF_PROXY_FORBIDDEN', '禁止代理回自身地址')
  }

  return upstreamUrl
}

interface RelayRoute {
  protocol: UpstreamProtocol
  authoritySegment: string
  upstreamPathname: string
}

function parseRelayRoute(pathname: string, dispatchSecret: string): RelayRoute {
  const segments = pathname.split('/').filter(Boolean)
  const [entrypoint, relaySecret, relayPrefix, authoritySegment] = segments

  if (!entrypoint) {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
  }

  if (isPublicProxyRoute(entrypoint)) {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
  }

  if (entrypoint !== 'relay') {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
  }

  if (!dispatchSecret || relaySecret !== dispatchSecret) {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
  }

  if (!relayPrefix) {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
  }

  const protocol = getProxyProtocol(relayPrefix)

  if (!authoritySegment) {
    throw new ProxyError(400, 'MISSING_AUTHORITY', '缺少上游 authority')
  }

  return {
    protocol,
    authoritySegment,
    upstreamPathname:
      segments.length > 4 ? `/${segments.slice(4).join('/')}` : '/',
  }
}

export function resolveUpstreamUrl(
  requestUrl: URL,
  config: RuntimeConfig,
): ResolvedUpstream {
  const proxiedPath = stripBasePath(requestUrl.pathname, config.routeBasePath)
  const { protocol, authoritySegment, upstreamPathname } = parseRelayRoute(
    proxiedPath,
    config.dispatchSecret,
  )
  const authority = decodeAuthority(authoritySegment)
  const upstreamUrl = validateAuthority(authority, protocol, config.selfTargets)

  upstreamUrl.pathname = upstreamPathname
  upstreamUrl.search = requestUrl.search

  return {
    upstreamUrl,
  }
}
