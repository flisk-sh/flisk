# MCP resources

`--type mcp` scaffolds a [Model Context Protocol](https://modelcontextprotocol.io) server that runs in your landscape like any other
service: Docker builds it, `tdk up` starts it, Traefik routes to it, and its health route gates boot order.

```bash
tdk resource docs-mcp --type mcp --stack shop
tdk up shop
```

## What you get

| File | What it is |
| --- | --- |
| `service.json` | `appType: "mcp"`, a port from 4000-5999, `healthCheckPath: "/health"`. No `framework` or `language` setting and no backend features such as Prisma. |
| `src/index.ts` | A server built on `@modelcontextprotocol/sdk` (1.x) using the Streamable HTTP transport, with one placeholder tool, `echo`. |
| `package.json`, `tsconfig.json`, `Dockerfile`, `tests/` | The same Bun scaffold a backend gets. |

The server answers three routes:

| Route | What it does |
| --- | --- |
| `POST /mcp` | The MCP endpoint. Clients send JSON-RPC here. |
| `GET /mcp` | `405` with `Allow: POST`. The scaffold is stateless and does not open server-to-client event streams. |
| `GET /health` | `200 {"status":"ok","service":"<name>"}`, the route Traefik uses. |

It is **stateless**: each request gets a fresh `McpServer`, so there is no session to lose when the container restarts. It has
**no authentication**; it is meant for local development behind `*.localhost`.

## Reaching it

Through Traefik, an MCP resource is routed like a backend: `http://api.<project>.localhost/api/<name without -api>/mcp`, with the
prefix stripped. A resource called `docs-mcp` is therefore at `http://api.shop.localhost/api/docs-mcp/mcp` in a project called `shop`.

You can talk to it with plain JSON-RPC:

```bash
curl -s -X POST http://api.shop.localhost/api/docs-mcp/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The `accept` header must list both types: the transport answers in `text/event-stream` framing (`event: message` / `data: {...}`).

## Adding tools

Edit `buildServer()` in `src/index.ts`. Register tools, resources and prompts there with the SDK's `registerTool`,
`registerResource` and `registerPrompt`. Tool arguments are described with [zod](https://zod.dev) schemas, and invalid arguments
come back as an MCP error result (`isError: true`), not as a crash. See the
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) for the full API.

## How it fits TDK

`mcp` is a resource type of its own, next to `backend`, `frontend`, `worker`, `bring-your-own` and `sdk`. Internally the engine
runs it as a backend: when it loads a `service.json` whose `appType` is `mcp`, it treats the manifest as `appType: "backend"` and
keeps a `mcp: true` flag, so the Dockerfile, Compose entry, Traefik route and health check all come from the backend path. It is not a
`--framework` choice for `--type backend`, and `--framework` and `--language` are rejected with `--type mcp`.

## What has and has not been checked

Checked, with a real `tdk up` in an isolated project: the scaffold builds on Bun in the engine's image, the resource goes healthy, and
`initialize`, `tools/list` and `tools/call` (the `echo` tool, with a valid argument) answer through Traefik. The CLI tests cover the
scaffold, the type lists, the rejected combinations and the engine normalization.

Also checked with the official MCP TypeScript SDK **client** (`@modelcontextprotocol/sdk`, `StreamableHTTPClientTransport`), not just
`curl`: it connected, listed the `echo` tool and called it, using the real URL `http://api.<project>.localhost:<port>/api/<name>/mcp`.
Node resolved `api.<project>.localhost` on its own (to `::1`), so no `Host` override was needed. This is the `resource-types/mcp`
suite, which runs on CI nightly, after each release and by hand. Run it yourself:

```bash
make test-e2e GROUP=resource-types SUITE=mcp
```

It scaffolds a throwaway `mcp` resource, starts it through `tdk up`, runs that client against it, and removes only what it created. It
needs Docker, Tilt, `tdk` on `PATH`, Node 22+ and network access (it installs the SDK into a temporary folder).

Not checked:

- A real MCP *application* (Claude, Cursor, the MCP Inspector) connecting to the URL. The SDK client is the reference implementation, but
  those applications each have their own connection and URL handling, and none was run.
- Whether an application that runs somewhere other than your machine can reach `api.<project>.localhost`; it is a local name.
- Authentication, sessions, resources and prompts, and server-to-client streaming (`GET /mcp` is not implemented).
- Anything other than Bun: there is no `--language` option for `mcp`.
