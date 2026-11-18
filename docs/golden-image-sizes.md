# Golden image sizes

`flisk up` builds (or pulls) eight golden layer images. Every project's service images start from them, so their size is
the floor of every service image. This page records what each layer holds and the size budget CI enforces.

Sizes are the **compressed registry size of one platform image** (what a pull downloads), measured on `ghcr.io/flisk-sh`
on 2026-11-18 for golden hash `fc63c4669fb5`. The larger of `linux/amd64` and `linux/arm64` is shown. Uncompressed
sizes on disk are larger; `docker images` is the place to read those.

| Layer | Built from | What it adds | Measured | Budget (+10%) |
| --- | --- | --- | --- | --- |
| `l1` | `oven/bun:alpine` | `ca-certificates`, `tzdata`, `curl`, `bash`, `openssl`, an `app` user | 52.2 MB | 57.5 MB |
| `l2` | `l1` | `netcat-openbsd`, `jq`, `bind-tools`, cache directories | 56.0 MB | 61.7 MB |
| `l3-backend` | `l2` | Nothing beyond `l2`. There is no global Prisma: each service pins its own in `node_modules` (flisk#3709) | 56.0 MB | 61.7 MB |
| `l3-frontend` | `l2` | Nothing beyond `l2`; no Prisma | 56.0 MB | 61.7 MB |
| `l4-backend` | `l1` | Bun production runtime: `NODE_ENV=production`, `--smol`, user `bun` | 52.2 MB | 57.5 MB |
| `l4-backend-node` | `node:22-alpine` | Node.js runtime, `ca-certificates`, `tzdata`, `curl`, user `app` | 64.3 MB | 70.8 MB |
| `l4-frontend` | `nginx:alpine` | nginx plus `curl` | 26.1 MB | 28.8 MB |
| `l4-migrator` | `l1` | `jq`, `netcat-openbsd`, `/cache/bun` owned by `bun`. No global Prisma (removed in flisk#3208: it sat under `/root`, which the `bun` user cannot read) | 52.6 MB | 57.9 MB |

The sizes the first report on flisk#2692 listed (`l3-backend` 650 MB and `l4-migrator` 555 MB, uncompressed, Flisk 1.4.12)
were a global Prisma install in `l3-backend` and a copy of it in `l4-migrator`. Both are gone. A service's own migrator
image adds its `node_modules` on top of `l4-migrator`; that is checked by e2e P5, which enforces a 400 MB budget.

## The budget check

`scripts/golden/size-budgets.json` holds the measured size and the budget of each layer. The publish workflow runs
`scripts/golden/verify-golden-images.py` after pushing, and it fails when any platform image of any layer is over that
layer's budget, so a layer that grows by more than 10% blocks the publish.

To grow a layer on purpose, raise its `budget_bytes` (and update `measured_bytes` and the table above from a fresh
`python3 -I scripts/golden/verify-golden-images.py <golden-layers.Dockerfile> ghcr.io/flisk-sh`) in the same PR, and say
why in the PR description.
