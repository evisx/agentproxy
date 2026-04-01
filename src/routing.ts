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

export function resolveUpstreamUrl(
  requestUrl: URL,
  config: RuntimeConfig,
): ResolvedUpstream {
  const proxiedPath = stripBasePath(requestUrl.pathname, config.routeBasePath)
  const segments = proxiedPath.split('/').filter(Boolean)
  const [prefix, authoritySegment] = segments

  if (segments.length === 0) {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
  }

  if (!prefix) {
    throw new ProxyError(404, 'NOT_PROXY_ROUTE', '未匹配到代理路由')
  }

  const protocol = getProxyProtocol(prefix)

  if (segments.length === 1) {
    throw new ProxyError(400, 'MISSING_AUTHORITY', '缺少上游 authority')
  }

  if (segments.length > 2) {
    throw new ProxyError(400, 'INVALID_PROXY_ROUTE', '代理路径不允许额外 path 段')
  }

  if (!authoritySegment) {
    throw new ProxyError(400, 'MISSING_AUTHORITY', '缺少上游 authority')
  }

  const authority = decodeAuthority(authoritySegment)
  const upstreamUrl = validateAuthority(authority, protocol, config.selfTargets)

  upstreamUrl.search = requestUrl.search

  return {
    upstreamUrl,
  }
}
