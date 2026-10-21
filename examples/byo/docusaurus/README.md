# docusaurus

**Stack:** a real Docusaurus site (`create-docusaurus`, classic template, TypeScript)

**Notes:**
- The scaffolder runs at build time with `app classic --typescript --skip-install` and stdin closed, then the Dockerfile
  installs the dependencies. The Docusaurus version is whatever `create-docusaurus@latest` ships.
- `docusaurus start --host 0.0.0.0 --port $PORT --no-open` makes the dev server reachable, uses the port Flisk assigns and does
  not try to open a browser.
- **The image is `node:22-slim` (glibc), not Alpine.** On `node:22-alpine` the dev server exited at start with
  `Cannot find native binding ... @rspack/binding-linux-arm64-musl`: the current classic template turns on Docusaurus' Rspack bundler
  and npm did not install its musl binding. This was seen on arm64; I did not test x86_64.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; the dev server accepted it with no host configuration (checked
  through a real `flisk up`).
- Docusaurus owns its webpack config, so this is a bring-your-own resource, not a Flisk frontend provider.
- The first start compiles the site, so it takes a while before `/` answers.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=180 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh docusaurus /
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh docusaurus /
```

## Register it in a Flisk project

```bash
flisk resource docs-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
