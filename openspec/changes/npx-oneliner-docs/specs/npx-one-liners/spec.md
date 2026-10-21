## ADDED Requirements

### Requirement: Canonical npx form
Public markdown SHALL write npx commands as `npx -y flisk <tdk-args>`. The package is `flisk` and its bin is `flisk` (`package.json` `bin.tdk`). The npx `-y` flag SHALL precede the package name; it only suppresses the npx install prompt and is distinct from Flisk's own `--yes`. Docs SHALL NOT write `npx … flisk <cmd>`, SHALL NOT place `-y` after the CLI args, and SHALL NOT use `npm install -g` as the first public command. Bare `flisk` remains valid after a global install or the curl binary.

#### Scenario: Scaffolding command is written
- **WHEN** a doc shows the backend scaffold command
- **THEN** it reads `npx -y flisk resource orders-api --type backend --stack shop --yes`

#### Scenario: Forbidden forms are absent
- **WHEN** public markdown is searched for `flisk flisk ` or an npx command ending in ` -y`
- **THEN** no first-run command matches

### Requirement: Host requirements are stated per command
Docs SHALL state what each command needs on the host and SHALL NOT claim npx removes Docker or Tilt.

| Command (after the npx prefix) | Host needs | Does not need yet |
| --- | --- | --- |
| `--version` | Node.js 22.12+ | Docker, Tilt, Bun |
| `doctor` | Node.js 22.12+ | a running stack |
| `project --yes` | Node.js 22.12+ | containers |
| `resource orders-api --type backend --stack shop --yes` | a project dir from `project` | Docker, Tilt |
| `up shop --dry-run` | generated project files | containers |
| `up shop` | Docker running, Tilt installed | a global `flisk` |

Bun, Prisma, and NATS are generated stack contents after `project`; cold npx neither installs nor starts them.

#### Scenario: First real startup is labeled
- **WHEN** a doc shows `up` without `--dry-run`
- **THEN** it is labeled as the Docker + Tilt step

#### Scenario: Native Windows is called out
- **WHEN** a doc shows an `up` one-liner
- **THEN** it states native Windows is inspect-only and landscape startup needs Ubuntu on WSL2

### Requirement: Public blocks
Docs SHALL use these blocks, each prefixed `npx -y flisk`:

- Try: `--version`
- Scaffold one backend: `mkdir shop && cd shop`, then `project --yes`, then `resource orders-api --type backend --stack shop --yes`
- Spin the stack (Docker + Tilt already installed): `up shop`, then `curl http://api.shop.localhost/api/orders/health`
- Single line: the three commands above chained with `&&`
- Preview, no containers: `up shop --dry-run`
- Frontend: `resource web --type frontend --stack shop --yes` and `resource web --type frontend --framework vue --stack shop --yes`
- Keep-it options, placed after the npx block: `npm install -g @flisk-sh/flisk` and `curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh | sh`

#### Scenario: Install options ordering
- **WHEN** a doc lists install options
- **THEN** the npx line comes first and global install / curl follow it

### Requirement: Files in scope
The rewrite SHALL cover `README.md`; `README-zh_cn.md`, `README-zh_tw.md`, `README-ja.md`, `README-ko.md` (commands identical, prose translated); `docs/README.md`; example READMEs opening with bare `flisk project` / `flisk up`; the website quickstart; and the `awesome-tdk-framework` install line. It SHALL NOT rewrite generated `service.json`, Tiltfiles, or claims numbers.

#### Scenario: Doc change is conformant
- **WHEN** a doc change is reviewed
- **THEN** every first-run command is copy-pasteable, starts with `npx -y flisk`, and the first `up` without `--dry-run` is labeled as the Docker + Tilt step
