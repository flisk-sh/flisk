# Flisk App Builder (MCP)

`https://mcp.flisk.sh/mcp`: a remote, read-only MCP server (Streamable HTTP, no key, nothing stored) for people who are not developers. It is the connector for the Claude directory; `flisk mcp` is local stdio and cannot be listed there.

- `plan_app`: a plain description of an app in, its parts in everyday words and the exact `npx @flisk-sh/flisk` commands out.
- `list_app_starters`: the ready-made apps and the words that pick each.

The plan comes from `src/plan.js` and `src/starters.js`, copies of the planner behind `demo.flisk.sh`, so nothing is invented. It is one Cloudflare Worker with no storage.

```bash
cd workers/app-builder-mcp
node --test        # tests
npx wrangler@4 deploy
```
