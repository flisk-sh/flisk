# TDK and your existing tools

TDK CLI turns a `service.json` per service into a local Docker stack, with Tilt (the local development tool) watching services and live-updating containers as you code. It is not a deploy tool and not a Compose replacement. Production stays on Helm.

## Compose

Compose is better for 2–3 services you already wrote. TDK is useful when you want scaffolding, selective `tdk up <stack>`, and a generated Tiltfile for a larger service set.

## Tilt

TDK writes the Tiltfile that configures Tilt's service watcher and live-update loop. If you already maintain a Tiltfile and it serves your workflow, stay on Tilt.

## Skaffold, Garden, and DevSpace

Those tools target a cluster. TDK does not; it runs a local Docker + Tilt development loop. Production deployment remains in your Helm or Kubernetes workflow.

## AI agent frameworks and workflow engines (libfx, LangGraph, Mastra, Vercel Workflows, Temporal)

When developers ask how TDK compares with modern agent runtimes and durability engines:

**TDK does not implement durable execution; it hosts it.**

TDK is the local runtime and topology orchestrator for agent *systems*. Tools like `libfx`, LangGraph, Mastra, Vercel Workflows, and Temporal define how steps run, retry, or checkpoint. TDK defines how the agent process, its checkpoint volume, its MCP tool servers, databases, queues, and gateways run together locally.

### Who owns what

| Capability | Agent Framework / Workflow Engine (`libfx`, LangGraph, Mastra, Vercel Workflows, Temporal) | Local Orchestrator (TDK CLI) |
| --- | --- | --- |
| **Agent logic & model calls** | Owns (prompts, tool invocations, turn loop) | Neutral (scaffolds vendor-agnostic runner) |
| **Durability & checkpoints** | Owns execution state & step replays | Provides persistent named volumes / database instances |
| **Session routing** | Defines session IDs | Traefik routes sticky session headers (`x-session-id`) |
| **Tool execution (MCP)** | Calls MCP servers | Scaffolds and hosts `--type mcp` resources with Traefik routing |
| **Local infrastructure** | None (expects URLs/credentials in env) | Provisions Postgres, NATS, Traefik, wires `@ref()` env |
| **Hot reload & dev loop** | Relies on runner | Tilt syncs supported code changes into containers; reloaders may restart processes and some changes trigger image rebuilds |
| **Lifecycle & shutdown** | Implements drain handlers | Sends SIGTERM; health checks follow `healthCheckPath` (typically `/health`) |

If you are using `libfx` or LangGraph, you still need a local database, persistent checkpoint volumes across restarts, and a gateway so other services can reach the agent. TDK is where those pieces run locally.

## Known limits

- The community is small.
- Built-in generators are TypeScript-first; bring your own Go, Java, or Python services.
- The 100-service number is a fixture bench of generated `/health` stubs, not an application workload. See [the claims registry](claims.md) and [bench notes](benchmarks/scale-bench.md).
- Native Windows is inspect-only; startup needs Ubuntu on WSL2.
