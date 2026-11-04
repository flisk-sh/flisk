# Design: first slice (local processes without Docker)

Covers tasks 1.5, 2.3 and 2.5, and the `command` half of 2.1 and 2.4 (issues #2226, #2227, #2229, #2231).

## Contract

A `service.json` with a non-empty top-level `command` is a local process. It needs `appName`, `appType` and `schemaVersion`, but no `stack`; `port`, `env`, `dependsOn`, `healthCheckPath` and `restart: "no"` are optional. There is no `name` alias and no legacy `type` for it, and no default `appType`. `command` next to `image` or `dockerfile` is refused, naming the service. `dev.command` keeps its meaning (the dev command inside a generated container) and does not make a service native.

## Which runtime runs a selection

- Every selected service declares `command`: local processes (`utils/native-up.ts`). This is decided at the top of `flisk up`, before any Docker or Tilt check.
- No service in the project declares `command`: the Docker + Tilt path, unchanged. This is every existing project; the existing suites and golden tests pass unchanged.
- Anything else (a mixed selection, or a container selection in a project that also has `command` services, which Tilt would discover): refused with `MIXED_RUNTIME`. Supporting both in one project is follow-up work.

Outside a project, a directory whose `service.json` files all declare `command` is adopted: `flisk up` writes the default `.flisk/project.json` (what `flisk project --yes` writes, without generating anything else), so `down`, `doctor`, `status` and `logs` find it.

## Supervisor (`utils/native-runtime.ts`)

- Foreground, like `tilt up`: Ctrl+C stops it; `flisk down` signals it through `.flisk/native/run.json` (supervisor and service pids, readiness), and stops leftover service processes itself if the supervisor was killed.
- Each service runs through the shell in its own process group, so a stop reaches what the shell started.
- Start order is `dependsOn` waves. A service starts once its dependencies are ready: health URL below 400, else the port accepts connections, else alive after one second. 60 seconds per service.
- Output is prefixed with the service name and appended, timestamped, to `.flisk/native/logs/<service>.log` (`flisk logs` merges these by time). `.flisk/native/` ignores itself in git.
- Restart on exit after 1, 2, 4, 8 seconds; five exits within 10 seconds of starting stop the restarts.
- Before starting: missing programs, ports already in use (with the owning process), duplicate ports, and `dependsOn` names that are not `command` services are refused.

## Tilt as an optional watch layer

Not in this slice. The supervisor is the no-Tilt path and needs nothing else; live reload comes from the service's own watch mode (`node --watch`, `uvicorn --reload`). Registering `command` services as Tilt `local_resource`s is the natural way to run them next to containers in one project, so it belongs with mixed projects (3.3, and the provider work in 5.2).

## Doctor and preflight

`flisk doctor` and the cold preflight treat a project whose services all declare `command` as native: they run the native checks (program on PATH, dependsOn, ports, schemaVersion, running services answer) and skip Docker, Compose, Colima, Tilt, Bun, the host port plan, NATS and Prisma. Any project with a container service gets every check, as before.
