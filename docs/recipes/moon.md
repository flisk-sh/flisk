# Running a Flisk landscape from moon

[moon](https://moonrepo.dev) is a task runner for monorepos. It does not replace Flisk: Flisk owns the local
landscape (Docker, Tilt, Traefik, ports), moon owns task orchestration. The one thing to wire up is a
long-running (persistent) moon task that runs `flisk up`, so `moon run` starts the landscape like any other
dev server.

Verified with moon 2.5.6 and Flisk 1.3.86: `moon run api:up` started the landscape and a bring-your-own
Fastify service answered `200` through Traefik.

## Setup

`.moon/workspace.yml`:

```yaml
projects:
  api: services/app/shop-api
vcs:
  client: git
  defaultBranch: main
```

`services/app/shop-api/moon.yml`:

```yaml
language: javascript
tasks:
  up:
    command: flisk up app
    preset: server
```

`preset: server` makes the task persistent, uncached and not part of CI, which is what a dev server needs.
(moon 1.x used `local: true` and `options.persistent`; moon 2.x rejects `local`.)

The service itself is an ordinary bring-your-own resource, see [byo.md](../byo.md):

```bash
flisk resource shop-api --type bring-your-own --stack app --dockerfile ./Dockerfile --yes
```

Start and check it:

```bash
moon run api:up                    # runs flisk up app, stays in the foreground
curl http://api.<project>.localhost/api/shop/health
```

## Known limits

- Stopping moon (Ctrl+C) does not stop the landscape. Tilt and the containers keep running; run `flisk down`.
- moon caching and affected-file detection do not apply to what happens inside the containers. Flisk decides
  what to rebuild.
- Several Flisk projects on one Docker daemon share Traefik's view of containers, so resource names must be
  unique across projects.
- Each project creates a handful of Docker networks. When Docker runs out of address pools
  (`all predefined address pools have been fully subnetted`), `flisk up` does not report it and fails later
  with `network ... declared as external, but could not be found`. Free unused networks with
  `flisk down --prune-networks` in projects you no longer use (or `docker network prune` for every unused network).
