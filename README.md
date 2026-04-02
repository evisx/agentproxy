# agentproxy

一个基于 TypeScript 的 Cloudflare Workers 内部 relay 代理实现，只接受带共享 secret 的内部路径并把请求透明转发到目标上游：

- `/relay/<DISPATCH_SECRET>/proxy/<site>/<upstream-path...>?query` -> `http://<site>/<upstream-path...>?query`
- `/relay/<DISPATCH_SECRET>/proxyssl/<site>/<upstream-path...>?query` -> `https://<site>/<upstream-path...>?query`

旧的公开 `/proxy`、`/proxyssl` 入口已关闭，无论是否带额外 path 都会统一返回 `404`。

## 部署

### 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/evisx/agentproxy)

## 快速开始

```bash
npm install
npm run dev
```

常用命令：

- `npm run dev`: 本地启动 Worker
- `npm run typecheck`: TypeScript 类型检查
- `npm test`: 运行单元/集成测试
- `npm run build`: 使用 Wrangler 执行 dry-run 构建

## 路由行为

### HTTP relay

请求：

```text
GET /relay/<DISPATCH_SECRET>/proxy/www.google.com/search?q=workers
```

转发到：

```text
http://www.google.com/search?q=workers
```

### HTTPS relay

请求：

```text
GET /relay/<DISPATCH_SECRET>/proxyssl/github.com/repos/cloudflare/workers?tab=actions
```

转发到：

```text
https://github.com/repos/cloudflare/workers?tab=actions
```

### 路由约束

- 只有 `/relay/<DISPATCH_SECRET>/proxy...` 与 `/relay/<DISPATCH_SECRET>/proxyssl...` 会进入代理主线
- `DISPATCH_SECRET` 不匹配时统一返回 `404`，不会尝试任何上游请求
- relay 路径中的 `<site>` 必须是上游 `authority`，即 `host` 或 `host:port`
- `<site>` 后面的额外 path 会按原样拼回目标上游 URL
- Bearer / Authorization header 只会被透传，不会参与上游解析

## 运行时配置

通过 Worker 环境变量控制：

- `ROUTE_BASE_PATH`
  默认值：空字符串
  用途：给 relay 路由增加公共前缀，例如 `/edge/relay/<DISPATCH_SECRET>/proxyssl/example.com`
- `SELF_HOSTNAMES`
  默认值：空字符串
  用途：逗号分隔的自代理主机名或 self-origin，用于阻断明显的循环代理
- `DISPATCH_SECRET`
  默认值：空字符串
  用途：只允许持有共享 secret 的 `agentdispatch` 访问内部 relay 路径；为空时所有 relay 请求都会返回 `404`

即使 `SELF_HOSTNAMES` 为空，Worker 仍会自动阻止代理回当前请求自身的 `hostname`/`host`。

## 项目特点

- 使用路径表达上游，不依赖额外路由编码约定
- 不引入数据库、缓存、后台页面、登录逻辑或请求统计
- 只保留透明转发主线，职责单一，部署依赖更少

## 透明转发范围

请求侧尽量保留：

- HTTP method
- query string
- `User-Agent`
- `Cookie`
- 请求 body（JSON、二进制等）
- 端到端请求头

响应侧尽量保留：

- 状态码
- 响应头
- `Set-Cookie`
- 流式 body（例如 SSE）

为了保证代理语义，Worker 会主动移除明显不应继续转发的 hop-by-hop 头部，例如 `Connection`、`Transfer-Encoding`、`Host`。

## 对外暴露边界

- 这个 Worker 不再是应用直接访问的公网入口
- 应用流量应先进入本地或安全内网里的 `agentdispatch`
- 直接访问 `agentproxy` 的旧 `/proxy`、`/proxyssl` 路径现在是破坏性变更，会统一得到 `404`

## 安全边界与非目标范围

这个实现刻意不做以下能力：

- Redis、SQL、KV 或其他外部存储
- 管理后台、登录面板、密钥管理、请求统计
- Cloudflare/CCF 挑战绕过
- CAPTCHA 求解
- `cf_clearance` 托管
- User-Agent 自动伪装或轮换
- TLS/JA3 指纹模拟
- Cookie Jar 持久化
- WebSocket、CONNECT、SOCKS 或系统代理协商

如果上游返回 `403`、`429`、挑战页或其他反爬响应，Worker 会原样透传，不会尝试规避、掩盖或自动重试。

## 已知限制

- relay secret 位于 URL path 中，部署时应避免在日志与监控里记录完整 relay URL
- 当前实现不会自动重试、故障切换或健康检查
- 运行时可能接管部分目标相关 header，因此“透明”是最小变更而不是字节级绝对一致
- `Set-Cookie` 是否最终被浏览器接受，仍取决于上游域名、`Secure`、`SameSite` 等浏览器规则
- 该项目默认不做 allowlist/denylist 和额外访问控制，若需要进一步收口，应在部署层单独增加保护
