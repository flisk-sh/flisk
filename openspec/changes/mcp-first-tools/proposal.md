Tracking issue: [#673](https://github.com/flisk-sh/tdk-cli-core/issues/673)

## Why

`tdk mcp` is already implemented in the CLI and exposes six useful tools, but users need a direct path from installing TDK to connecting Codex and other MCP clients. The setup guide should be easy for agents to discover through the website's existing `llms.txt` and should show the first workflows with `doctor` and `up`.

## What Changes

- Document that the MCP server is included with the TDK CLI installation; no separate MCP package is needed.
- Provide client configuration examples for Codex and Claude Code, launched locally over stdio.
- Describe all currently available MCP tools: `doctor`, `up`, `down`, `status`, `logs`, and `resource_list`; use `doctor` and `up` in the getting-started walkthrough.
- Add a link to the setup guide in `tdk-website`'s existing `llms.txt`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `harness-lifecycle-api`: preserve the existing MCP tool set and specify discoverable installation and client setup guidance.

## Impact

- `docs/agent-hosts.md` and possibly the existing MCP documentation.
- `tdk-website/llms.txt` in the website repository.
- No MCP protocol, CLI command, or tool-list change is required.
