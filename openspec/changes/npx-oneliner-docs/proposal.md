## Why

Public markdown opens with bare `flisk project` / `flisk up` or with a global install, so a first-time reader must install something before trying the CLI. The package already runs via `npx`, but the invocation is written inconsistently (`npx … flisk <cmd>`, npx flags after CLI args), and the one-liners do not say which host tools each step needs. This change fixes one canonical `npx` form and applies it across public docs.

## What Changes

- Define the canonical form `npx -y @flisk-sh/flisk <tdk-args>` (npx flags first, package name is the bin, no second `flisk` token).
- Specify per-command host requirements so docs do not imply npx removes Docker or Tilt.
- Rewrite first-run commands in README (all locales), `docs/README.md`, example READMEs, the website quickstart, and the `awesome-tdk-framework` install line to lead with npx; global install and curl follow as keep-it options.

## Capabilities

### New Capabilities
- `npx-one-liners`: Public markdown presents copy-pasteable `npx` first-run commands with accurate prerequisites.

### Modified Capabilities
- None.

## Non-goals

- Rewriting generated `service.json`, Tiltfiles, or claims numbers.
- Changing CLI behavior, installer behavior, or the bin name.
- Claiming npx removes the Docker or Tilt requirement.

## Impact

- `README.md`, `README-zh_cn.md`, `README-zh_tw.md`, `README-ja.md`, `README-ko.md` (same commands, translated prose only), `docs/README.md`.
- Example READMEs that open with bare `flisk project` / `flisk up`.
- Website quickstart install options; `awesome-tdk-framework` install line.
