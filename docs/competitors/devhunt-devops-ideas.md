# DevHunt DevOps: competitors and the features they argue for

Maintainers' notes from DevHunt's DevOps category. Only **page 1** of that category was read, on 2026-11-03; **pages 2 to 5 were not read**, so this is not a survey of the category. The products change — re-read the page before relying on a line. Nothing here is a commitment; it is a ranking to pick the next feature from.

## The competitors

| Product | Upvotes | What it offers | Overlap with Flisk |
| --- | --- | --- | --- |
| Daytona | 339 | A dev environment on any infrastructure with one command | HIGH |
| DevZero | 85 | Cloud dev environments for microservices | MEDIUM |
| ServBay | 63 | A local web development environment (bundled language runtimes and services) | MEDIUM |
| Livecycle | 52 | Preview environments per pull request | LOW |
| PullPreview | 13 | Preview environments per pull request on your own cloud | LOW |
| Miller Dev Shell | 13 | Dev environment setup | LOW |

## Ranked ideas

| # | Feature | User value | Effort | State |
| --- | --- | --- | --- | --- |
| 1 | `flisk up <git-url>` | Clone and run a repo in one command | M | Shipped in flisk#3188 |
| 2 | `flisk import devcontainer` | Read `.devcontainer/devcontainer.json` into Flisk resources | M | Not started |
| 3 | `flisk share <service>` | Share a running local service through a tunnel | M | Needs a decision |
| 4 | List Flisk on DevHunt | Increase discoverability on the DevHunt platform | S | The user decides |

### 1. `flisk up <git-url>`

The idea: a newcomer or an agent turns a repo URL into a running, health-checked local stack with printed URLs in one command, rather than cloning, then importing, then upping. Composing three pieces that already exist here (`cloneMissingRepos`, `flisk import compose`, `flisk up`) rather than adding a subsystem.

State: shipped in flisk#3188.

### 2. `flisk import devcontainer`

The idea: a developer in a repo with a `.devcontainer/` folder runs `flisk import devcontainer` once and gets a Flisk stack that mirrors the container's environment on the host, with no Docker knowledge required.

Challenge: mapping features and lifecycle hooks from the container definition into Flisk resources is more than a file copy. The container's defined tools must be bound to the host instead of isolated, work with existing Compose stacks or standalone `.devcontainer.json` without Compose, and run on the local machine rather than rebuild on every `git pull`.

State: not started.

### 3. `flisk share <service>`

The idea: a developer runs `flisk share <service>` to reach a service that is running locally from outside the machine, which is what the preview-environment products (Livecycle, PullPreview) are for.

Two things have to be settled before any code: which tunnel provider, and whether it is allowed at all — `AGENTS.md` bars calling cloud APIs outside the agreed export scope, and a tunnel is such a call.

State: needs a decision.

### 4. List Flisk on DevHunt

A submission on DevHunt, no code in this repository.

It is public promotion of Flisk, so the user decides whether and when it happens.

State: the user decides.

## Recommendation

Do **idea 2, `flisk import devcontainer`**, next. Idea 1 has shipped, idea 3 is blocked on a decision about cloud APIs, and idea 4 is not ours to start.
