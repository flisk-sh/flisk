## Context

`flisk mcp` is already shipped as a stdio server in the Flisk CLI. It exposes `doctor`, `up`, `down`, `status`, `logs`, and `resource_list`; those tools wrap the existing CLI JSON contracts. `docs/agent-hosts.md` has a minimal generic JSON configuration, but users need an install-to-connect walkthrough and website-level discovery.

## Goals / Non-Goals

**Goals:**
- Explain that installing `@flisk-sh/flisk` (or the Flisk binary) also installs `flisk mcp`.
- Show how to configure Codex and Claude Code to launch the server locally over stdio.
- Document all six currently available tools and demonstrate `doctor` followed by `up` as the first workflow.
- Link the setup guide from `flisk-sh/website`'s existing `llms.txt`.

**Non-Goals:**
- Change the MCP protocol, transport, available tools, or tool behavior.
- Add a separate MCP package or a hosted/remote MCP endpoint.
- Change the website's `llms.txt` format or replace it.

## Decisions

- Keep the server bundled with the CLI. Users install Flisk using the documented npm or binary method, then configure the client to run `flisk mcp`; there is no second install step.
- Keep the existing six-tool set. The guide uses `doctor` and `up` first while explaining the rest of the current operations.
- Use stdio configuration with the client's `command` and `args` fields. Explain that the server starts in the project directory so the CLI discovers that project's Flisk configuration.
- Keep the canonical client guide in `flisk` and add a descriptive link to it from the website `llms.txt`, which already indexes AI-facing documentation.

## Risks / Trade-offs

- MCP configuration formats vary by client and version. Show verified examples and link to the client's current documentation for UI-specific setup.
- A detached `up` result means startup has begun, not that the stack is ready. Explain how the existing `status` tool reports readiness.
- `flisk-sh/website` is a separate repository. Include its `llms.txt` update in the issue's coordinated work.

## Migration Plan

Update the canonical guide, verify the client config examples, then add the guide link to `flisk-sh/website/llms.txt`. No runtime migration or rollback is needed.
