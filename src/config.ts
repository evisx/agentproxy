export interface ProxyEnv {
  ROUTE_BASE_PATH?: string
  SELF_HOSTNAMES?: string
}

export interface RuntimeConfig {
  routeBasePath: string
  selfTargets: Set<string>
}

function normalizeBasePath(value?: string): string {
  const trimmed = value?.trim()

  if (!trimmed || trimmed === '/') {
    return ''
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

function normalizeSelfTarget(value: string): string[] {
  const trimmed = value.trim().toLowerCase()

  if (!trimmed) {
    return []
  }

  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed)

      return [parsed.hostname.toLowerCase(), parsed.host.toLowerCase()]
    } catch {
      return [trimmed]
    }
  }

  return [trimmed]
}

export function getRuntimeConfig(env: ProxyEnv, requestUrl: URL): RuntimeConfig {
  const selfTargets = new Set<string>([
    requestUrl.hostname.toLowerCase(),
    requestUrl.host.toLowerCase(),
  ])

  for (const value of (env.SELF_HOSTNAMES ?? '').split(',')) {
    for (const normalized of normalizeSelfTarget(value)) {
      selfTargets.add(normalized)
    }
  }

  return {
    routeBasePath: normalizeBasePath(env.ROUTE_BASE_PATH),
    selfTargets,
  }
}
