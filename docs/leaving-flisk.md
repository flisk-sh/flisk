# Leaving Flisk: what you keep and what you lose

If Flisk stops being maintained, or your team decides not to use it, what is left in the repository? Facts here come from running Flisk 1.3.86 (`origin/main`) in a scratch project: `flisk project --yes`, then `flisk resource` for a generated backend, a generated frontend and a bring-your-own resource with `--image nginx:alpine`, then `flisk eject --dry-run` and `flisk eject --yes`. `docker compose config` was used to validate YAML. **Nothing was started**: no `flisk up`, no `docker compose up`, no `tilt up`. So "works" below means "the file parses", not "the stack runs".

Core is MIT ([FAQ](faq-teams.md#what-if-the-project-stops-being-maintained)), so you can also fork it. This page is about carrying on without it.

## Short answer

- Your **service source code**, your **own Dockerfiles** and your **bring-your-own images** do not depend on Flisk.
- There is **no command that turns a Flisk project into plain Docker Compose**. `flisk eject` does not do that; see below.
- The files that run the stack (Tiltfile, per-service Compose files, the golden-layer Dockerfile, the Traefik file) are **generated into git-ignored folders** and, for the most part, only exist after `flisk up` has run once.
- Moving to plain Compose or Helm is manual work, and nothing keeps `service.json` and your new files in step.

## What `flisk eject` really does

Before [#610](https://github.com/flisk-sh/flisk/issues/610), `flisk eject --help` said "Take ownership of the generated Tilt and Docker files" and the command printed "Ejected. Tilt and Docker files are yours." and "Next: tilt up". Neither was true. Its output now says what happens. Run in a project with a backend, a frontend and a bring-your-own service (output shown is from the fixed CLI; the observations below were made on 1.3.86):

```text
$ flisk eject --yes
Wrote EJECTED.md. Nothing was copied, moved or generated.
Generated files stay in .tdk/.tdk-out/ (git-ignored) and still need Flisk inputs.
Run from the project root: tilt up -f .tdk/.tdk-out/Tiltfile -- --focus=<stack>
Replace <stack> with a stack name under services/, or omit --focus to use the Tiltfile's default phase.
Read EJECTED.md
$ git status --short
?? EJECTED.md
```

What was observed:

- It writes **one file**, `EJECTED.md`, at the project root, and nothing else. No file is copied, moved or generated. A second run changes nothing and also exits 0.
- On 1.3.86, `EJECTED.md` said "Keep: Tiltfile, Dockerfiles, compose files Flisk wrote, Traefik / proxy config Flisk wrote". In the scratch project (before any `flisk up`) none of those existed outside `.tdk/.tdk-out/`, which `.gitignore` excludes (`git check-ignore` confirms `.tdk/.tdk-out/Tiltfile`). After eject a fresh clone still has to run Flisk to get them. The note now says that: it lists where the generated files are, says Tilt writes the Compose, golden-layer and Traefik files when it runs, and that the Tiltfile still reads `.tdk/project.json` and the `service.json` files. An `EJECTED.md` written by an older CLI is never overwritten, so delete it and run `flisk eject` again to get the new text.
- `flisk eject --dry-run` prints the contents of `.tdk/.tdk-out/` (315 lines: the Tiltfile, `spec.master`, and the vendored engine under `tdk-cli-ext/`) under "Generated files, left where they are (git-ignored):". If a root `Tiltfile` exists, it is listed separately as user-owned and not git-ignored. It has no `--out` option and no per-service file.
- 1.3.86 printed "Next: tilt up", which cannot work: there is no `Tiltfile` at the project root after eject, and `tilt alpha tiltfile-result` there answered `No Tiltfile found at paths '<project>/Tiltfile'`. Flisk runs `tilt up -f <project>/.tdk/.tdk-out/Tiltfile -- --focus=<stack>` (`flisk up shop --dry-run` printed exactly that, from `cli/src/utils/tilt.ts`). The command now prints that form. `flisk up` also chooses host ports and exports them before Tilt starts; a hand-run Tilt skips that. Starting it by hand was **not tried**.
- Without `.tdk/.tdk-out/` it fails: `Generated Tilt files are missing. Run \`flisk project --yes\` before ejecting.` (exit 1). Outside a project: `flisk eject: no .tdk/project.json in this directory or parents` (exit 1).

Treat `flisk eject` as a note-writer, not as an exit path. A command that exports plain Compose files and Dockerfiles does not exist.

## What exists on disk, and when

| File | Exists after `flisk project` + `flisk resource` | Committed? |
| --- | --- | --- |
| `services/<stack>/<name>/service.json` | Yes | Yes |
| `services/<stack>/<name>/Dockerfile` (generated services) | Yes. A starting point; `flisk up` builds a different file ([scope](scope.md#is-the-dockerfile-flisk-builds-the-one-we-ship)) | Yes |
| `services/platform/database-management/docker-compose.yml` | Yes. Shared Postgres | Untracked, not ignored |
| `.tdk/.tdk-out/Tiltfile`, `spec.master`, `tdk-cli-ext/` (vendored engine) | Yes (242 files) | Ignored |
| `.tdk/.tdk-out/docker-compose.traefik.yml`, `golden-layers.Dockerfile`, `traefik-dynamic/` | **No**, written when Tilt runs | Ignored |
| `services/<stack>/<name>/.autogenerated/docker-compose.app.autogenerated.yml` and `Dockerfile.app.autogenerated` | **No**, written when Tilt runs | Ignored |

The last two rows were read from a different scratch project that had been through an earlier Flisk run (I did not produce those files in this session). The generator code that writes them is in the vendored engine (`compose.star`, `golden_image_build.star`).

## What was validated

`docker compose config` (parse and interpolate only) exited 0 for:

- `services/platform/database-management/docker-compose.yml`. Compose warned that `DB_PASSWORD` was not set, because it reads `.env` from the Compose file's own folder. Pass `--env-file <project>/.env`. Note that `config` prints the resolved password; do not paste its output into a ticket.
- `.tdk/.tdk-out/docker-compose.traefik.yml` and a generated service's `docker-compose.app.autogenerated.yml` from the earlier run.

Passing `config` does **not** show that the stack starts. What each file needs beyond itself:

- **External networks.** Every one declares `external: true` networks named `<project>_traefik-public`, `<project>_backend`, `<project>_database` (and `<project>_infisical-network` for services). Compose will not create them. Flisk creates them; I did not create any, so what `docker compose up` does without them was not observed.
- **Golden layer images.** `Dockerfile.app.autogenerated` starts `FROM <project>-l1:latest`, `-l2`, `-l3-backend` and `-l4-backend`. Those images are built locally from `.tdk/.tdk-out/golden-layers.Dockerfile` with one `docker build --target ...` per layer (nine, see `golden_image_build.star`). They are not published, so the file cannot be built until you build them. Building them by hand was **not tried**.
- **Environment.** The service file needs `DB_PASSWORD` and `JWT_SECRET` (it fails with `JWT_SECRET is not set` otherwise; both come from the project `.env`), reads `.autogenerated/.env.backend.autogenerated`, and refers to a NATS host `<project>_nats` that is not one of the files above.
- **Traefik labels.** Routes are `traefik.*` labels on each service. Without a Traefik that watches the same network (`--providers.docker.network=<project>_traefik-public`) they do nothing; a plain Compose stack needs ports published instead.
- **Bring-your-own.** I did not see a generated Compose file for the `--image` service, so I cannot say what it contains. With your own image you already have what you need to write one.

## What you lose

- **Live update.** The sync and rebuild rules are Tilt's. Plain Compose rebuilds on `docker compose up --build`, or you use `docker compose watch` with rules you write.
- **Ordering and readiness.** `dependsOn` in `service.json` is read by Flisk. You write `depends_on` with health conditions yourself.
- **Routes and hosts.** The `*.localhost` hosts, path prefixes and the Traefik wiring.
- **Discovery.** New services are no longer found by scanning `services/**`.
- **Ports.** Flisk picks free host ports and records them; you choose them.
- **`flisk doctor`, `flisk config verify`, smoke checks** and the stack commands.
- **Per-stack Postgres databases and generated secrets.** The database `<project>_<stack>` and `JWT_SECRET` in `.env` are Flisk's choices. The Postgres data survives in its Docker volume ([local data](data.md)).

## A manual route

Not run end to end; it follows from the facts above.

1. Keep a copy of what Flisk generated, from a machine where it ran: `.tdk/.tdk-out/` (or at least the Compose files, `golden-layers.Dockerfile` and `traefik-dynamic/`) and each `.autogenerated/` folder. Add them with `git add -f` since they are ignored. Do not copy them into a Helm chart ([scope](scope.md#your-existing-compose-and-helm-files)).
2. Better, write a small Compose file from `service.json` (image or Dockerfile, `port`, `healthCheckPath`) and use your own Dockerfiles. A [bring-your-own resource](byo.md) with your own `Dockerfile` or `--image` is already that shape.
3. Replace the `external: true` networks and the golden-layer base images, or build those images yourself first.

## Taking Flisk out of the repository

`flisk down --prune-networks` first (it also removes the project's networks that no container uses; volumes are kept, see [local data](data.md#does-it-survive-flisk-down)), then follow [gradual adoption](gradual-adoption.md#taking-it-out-again): delete `.tdk/`, `services/platform/database-management/`, `shared-platform-engineering/docker-templates/`, `EJECTED.md` if you ran eject, `.env`, the four `.gitignore` lines, and any `services/<stack>/` that exists only for Flisk.

What survives: service source and your own Dockerfiles. `service.json`, `AGENTS.md`, `health.conf` and the placeholder Dockerfiles of bring-your-own resources are harmless to other tools but Flisk-specific; delete them if you do not want the clutter. Remove the Postgres volume yourself if you do not need the data ([local data](data.md)).

## Not checked

- Starting anything, with Flisk or without it, including a plain `docker compose up` and the `tilt up -f .tdk/.tdk-out/Tiltfile -- --focus=<stack>` that eject now prints.
- Whether a built set of golden layers makes the service file build outside Flisk.
- The Compose output for a bring-your-own service and for a frontend (only a generated backend's file was read).
- Helm: nothing here produces a chart.
