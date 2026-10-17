# angular-cli

**Stack:** a real Angular CLI app (`ng new`, CSS, routing, no SSR, npm)

**Notes:** scaffolder runs at build time with `--defaults --skip-git --skip-install --routing --style=css --ssr=false
--ai-config=none --package-manager=npm`; `ng serve --host 0.0.0.0 --port $PORT` makes the dev server reachable and uses
the port TDK assigns. Angular owns its builder and config (`angular.json`), so this is a bring-your-own resource, not a TDK
frontend provider. Through TDK, Traefik sends `Host: api.<project>.localhost`; Angular's dev server accepted it with no host-check flag (checked through a real `tdk up`).
The Angular version is whatever `@angular/cli@latest` ships. For Angular with Vite see the Analog example.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=180 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh angular-cli /
```

Through a real `tdk up` and Traefik (needs Docker, Tilt and a built CLI), (the first run also builds TDK's shared base images, so allow several minutes on a cold Docker cache):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh angular-cli /
```

## Register it in a TDK project

```bash
tdk resource angular-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
