## Purpose

Gives contributors and AI assistants one place that explains when an e2e test is required, where it goes, how to write it, and how to prove it works.

## ADDED Requirements

### Requirement: Contributor guide for writing e2e tests
`docs/contributing/05-write-e2e.md` SHALL explain: when a change needs an e2e (a new resource type, a new command or MCP tool that talks to a running stack, a change to `flisk up`, Traefik routing or the engine); how to pick the group; the suite shape and shared helpers; how to run one case locally; how CI triggers it; and how to show the test can fail. It SHALL use the agent suite as a step-by-step worked example. `CONTRIBUTING.md` and the feature recipes SHALL link to it.

#### Scenario: Contributor adds an MCP tool
- **WHEN** a contributor reads the guide while adding an MCP tool that reads a running agent
- **THEN** the guide tells them the change belongs in the `mcp` or `agent` resource-type suite and shows the agent suite's MCP cases as the template

#### Scenario: Guide is reachable from the entry points
- **WHEN** a contributor opens the Tests section of `CONTRIBUTING.md`
- **THEN** it links to the e2e guide

### Requirement: Proving an e2e can fail
The guide SHALL require each new suite's pull request to show one deliberate break: revert or alter the behavior under test locally, run the case, and include the failing output in the pull request. The suite is accepted only with that evidence and a passing run.

#### Scenario: Pull request adds a suite
- **WHEN** a pull request adds a new e2e suite
- **THEN** its description includes a passing run and a failing run caused by a deliberate break, as captured output

### Requirement: Repository skill for writing e2e tests
A repository skill named `flisk-e2e-author` SHALL guide an AI assistant through the same steps as the guide: decide whether an e2e is required, choose the group, scaffold the suite from the reference, use the shared helpers, run the cases against a real stack, and capture pass and deliberate-break evidence. It SHALL be available under `.claude/skills/` and `.agents/skills/`. Syncing skills from the upstream skills repository SHALL NOT delete it.

#### Scenario: Skills sync runs
- **WHEN** `scripts/sync-tdk-skills.sh` runs against an upstream that does not contain `flisk-e2e-author`
- **THEN** `flisk-e2e-author` and its `.agents/skills` link are kept

#### Scenario: Assistant asked to add a feature
- **WHEN** an assistant using the skill is asked to add a new resource type
- **THEN** it reports that a resource-type suite is required and scaffolds it under `tests/e2e/resource-types/<type>/`
