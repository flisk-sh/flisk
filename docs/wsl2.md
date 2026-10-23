# Flisk on WSL2

Flisk supports Ubuntu running in WSL2. Native Windows can inspect the CLI, but `flisk up` requires Linux, Docker, and Tilt; run it from Ubuntu in WSL2.

## Prepare Docker Desktop

1. Install Docker Desktop on Windows and select the WSL2 backend.
2. In Docker Desktop, open **Settings → Resources → WSL Integration** and enable integration for the Ubuntu distribution you will use.
3. Start Ubuntu from Windows Terminal. Confirm Docker is available with `docker version` and `docker compose version`.
4. Install Tilt and Flisk in Ubuntu:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash
   curl -fsSL https://flisk.sh/install.sh | sh
   ```

## Install and boot the bundled example

Run these commands in the Ubuntu shell. The first `flisk project example` copies the bundled example into your home directory; `flisk project --yes` configures that copy.

```sh
flisk doctor
flisk project example --path "$HOME/tdk-example"
cd "$HOME/tdk-example"
flisk project --yes
sed -i 's/^INFISICAL_ENABLED=.*/INFISICAL_ENABLED=false/' .env
flisk config verify
flisk doctor
flisk up shop
```

Leave `flisk up shop` running. From another Ubuntu terminal, check the routed API and UI, create an order, and wait for the NATS worker to mark it:

Set `HTTP_PORT` to the HTTP port `flisk up` printed (80, or 8080 on WSL2 when 80 is not available):

```sh
set -euo pipefail
: "${HTTP_PORT:?set HTTP_PORT to the port flisk up printed}"
api=http://api.tdk-example.localhost:$HTTP_PORT/api/orders
curl -fsS "$api/health"
curl -fsS "$api/worker-ready"
curl -fsS http://app.tdk-example.localhost:$HTTP_PORT/orders-app/ >/dev/null
order_id="$(curl -fsS -X POST "$api" -H 'content-type: application/json' \
  -d '{"item":"WSL2 smoke test"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).order.id)))')"
echo "Created order $order_id"

seen=no
for _ in $(seq 1 60); do
  result="$(curl -fsS "$api/$order_id")"
  seen="$(printf '%s' "$result" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).order.workerSeenAt ? "yes" : "no"))')"
  [ "$seen" = yes ] && break
  sleep 1
done
[ "$seen" = yes ] || { echo "Worker did not observe order $order_id" >&2; exit 1; }
echo "Worker observed order $order_id"
```

Stop the stack from the first terminal with `Ctrl+C`, then run `flisk down` from the example directory.

## The one-command demo

The demo is the shortest path to a running stack: it clones the starter into `~/.flisk/flisk-demo`, installs the CLI globally, installs the service dependencies, boots everything and opens the frontend. On native Windows it refuses with the WSL2 guidance, because native Windows is inspection-only; in Ubuntu under WSL2 it works.

```sh
flisk demo
```

## Automated smoke

With Flisk and Docker Desktop WSL integration already available, run `bash scripts/wsl2-smoke.sh` from the Flisk repository checkout inside Ubuntu. It copies the bundled example into a temporary directory, checks doctor and generated configuration, boots the stack, exercises the same routed write and worker observation, and tears the stack down. Pass a directory path to keep the copied example for inspection.

`bash scripts/wsl2-demo.sh` does the same for the demo flow: it runs `flisk demo` the way a user runs it and then confirms that what it started works. Every resource has to be `ready` in `flisk status --json`, every routed service has to answer (the backend at its `/health` path, the frontend at its page), and `flisk down` has to stop the stack again. The demo output, the status and networks reports and the per-service HTTP results land in the evidence directory (the first argument, `/root/tdk-evidence` by default).

The WSL2 smoke workflow was removed at the end-to-end cutover (#1302), so no CI job runs it now. Its steps are the cases of [`tests/e2e/platforms/wsl2`](../tests/e2e/platforms/wsl2/run.sh), and it runs on `windows-2022`, provisions Ubuntu 24.04 under WSL2, and installs Docker Engine inside that distro. [The successful run on merge commit `ad7c5c0`](https://github.com/flisk-sh/flisk/actions/runs/36903887190) records HTTP 200 responses for the routed API, worker-readiness, and app checks, followed by a successful NATS worker observation. This CI path tests Docker Engine inside WSL2; it does not test Docker Desktop WSL integration.

The suite is back in CI as the **🐧 Platforms WSL2 E2E** workflow ([`.github/workflows/e2e-platforms-wsl2.yml`](../.github/workflows/e2e-platforms-wsl2.yml)). It is dispatched by hand: the setup needs a Windows runner and takes a while, and the old job was flaky on `wsl --update` and on the Ubuntu and Docker mirrors (#716, #717). Its `WS6` case runs the demo flow and the confirmation above, and the evidence it uploads is what an acceptance run links to.

## Troubleshooting

- If `docker version` cannot reach the server, enable the Ubuntu distribution under Docker Desktop's **Resources → WSL Integration** and restart Ubuntu.
- Flisk asks for HTTP ingress port 80 and uses it when it is free. Otherwise, or on WSL2 where a non-root user cannot check port 80, it selects a free port from 8080-8180, and it selects a fallback Postgres host port when needed. It prints the selected values; use the reported HTTP port in routed URLs if it differs from the URL without a port. Set `TDK_HTTP_PORT`, `TDK_HTTPS_PORT`, or `TDK_POSTGRES_PORT` to override a selection; a conflicting override is reported without stopping the process using it.
- Use the API and app URLs printed by Flisk if your project name differs from `tdk-example`.
