## MODIFIED Requirements

### Requirement: MCP server shares the implementation
`flisk mcp` SHALL expose the `doctor`, `up`, `down`, `status`, `logs`, and `resource_list` tools backed by the same functions as the CLI. The `up` tool SHALL start Tilt detached and return once started; callers poll the `status` tool for readiness, so a blocked call cannot time out. The tool SHALL refuse when `canUp` is false. The MCP setup documentation SHALL explain that `flisk mcp` is included with the CLI installation, show how local stdio clients launch it from a project directory, describe all available tools, and be discoverable from `flisk-sh/website`'s existing `llms.txt`.

#### Scenario: MCP up on an unsupported host
- **WHEN** the `up` tool is called in a WebContainer
- **THEN** it returns an error result and starts nothing

#### Scenario: User installs and connects an MCP client
- **WHEN** a user installs Flisk and follows the MCP setup guide
- **THEN** they can configure a local stdio MCP client to launch `flisk mcp` from their project directory without installing a separate MCP package

#### Scenario: Website llms index points to MCP setup
- **WHEN** an agent reads `flisk-sh/website`'s `llms.txt`
- **THEN** it can follow a link to the canonical MCP setup guide

#### Scenario: Getting-started workflow uses doctor and up
- **WHEN** a compatible MCP client is connected to a Flisk project
- **THEN** the setup guide shows how to call `doctor` and then `up`, and explains the available lifecycle, status, log, and resource tools
