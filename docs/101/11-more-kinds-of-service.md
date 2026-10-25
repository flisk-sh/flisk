# Lab 11: More kinds of service

**Goal:** add a background worker, an MCP tools server, and an AI agent to the same stack.
**Time:** 10 minutes. **Previous:** [Lab 10](10-change-a-service-json.md). **Next:** [Lab 12](12-work-with-an-ai-agent.md).

## Steps

1. Add a worker for background jobs:

   ```bash
   flisk resource jobs-worker --type worker --stack shop --yes
   ```

2. Add an MCP server, which gives coding agents tools they can call:

   ```bash
   flisk resource orders-mcp --type mcp --stack shop --yes
   ```

3. Add an AI agent:

   ```bash
   flisk resource helper-bot --type agent --stack shop --yes
   ```

4. See everything, with ports:

   ```bash
   flisk resources --ports
   ```

5. Look at the agent's definition:

   ```bash
   cat services/shop/helper-bot/service.json
   ```

## You should see

```text
Found 5 resources:

helper-bot
  Stack: shop
  Port: ...
jobs-worker
  Stack: shop
  Port: ...
orders-api
  ...
```

All five are in the `shop` stack, listed by name. Flisk picks each service's port when you add it, so your numbers can differ from anyone else's. Starter ports are `4000` and up for APIs, MCP servers, and agents, `3000` for websites, and `6000` for workers.

The agent's `service.json` ends with:

```json
"agent": { "runtime": "custom", "durability": "files" }
```

## What just happened

Each type gets a different starter:

| Type | What you get |
| --- | --- |
| `backend` | An HTTP API with health checks. |
| `frontend` | A website, wired to your API. |
| `worker` | A background process for jobs. |
| `mcp` | A server of tools that agents such as Claude Code, Codex, and Cursor can call. |
| `agent` | A server that keeps conversation state, so a restart does not lose it. |

An `agent` resource also gets saved checkpoints that survive `flisk down`, session routing by an `x-session-id` header, a `/health` check, and a `/ready` check. The [AI agents guide](../agents/ai-agents.md) covers all of it.

## Ask your AI agent instead

```text
Use Flisk to add a worker called jobs-worker, an MCP tools server called orders-mcp, and an AI agent called helper-bot to the shop stack. Then list all resources with their ports.
```

## Checkpoint

- [ ] `flisk resources` shows five resources.
- [ ] You can say what an `mcp` resource is for.

## Stuck?

- **Two services share a port:** open each `service.json` and give them different ports, then run `flisk config verify`.
- **Other languages for a backend:** `--language python`, `go`, `rust`, or `node`.
- **To start the new services:** run `flisk up shop` again. Flisk picks them up automatically.
