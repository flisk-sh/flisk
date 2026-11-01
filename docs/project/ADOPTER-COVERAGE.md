# Adopter coverage

What a real project needs from Flisk when it moves from Docker Compose, which of those things Flisk covers today, since which version, and what is still open. Each row comes from importing a real repository's Compose file; whether it was also *run* is stated in the Status column (**covered** means it was run on a real repository, **tested** means it was only checked with the importer, generator and `docker compose config` tests). [ADOPTERS.md](ADOPTERS.md) lists the projects that use Flisk; this file covers only the repositories in the next table. A gap found here is a Flisk bug: it gets an issue, a fix and a row update, not a workaround in the adopter's repository.

**How to read a row.** *Compose* is what the project writes. *service.json* is where it goes. *Since* is the first Flisk core release that contains it, taken from the release tags (the importer and exporter are separate npm packages; their own release notes say which version added each mapping). *Needed by* names the repositories that hit it. *Status*: **covered** (works, checked on a real run of a repository that needs it), **tested** (works in Flisk's tests and `docker compose config`; not yet run on a repository that needs it), **partial** (works with a stated limit), **open** (not covered, issue linked), **by design** (Flisk does it differently on purpose).

## Repositories checked

| Repository | Kind | State | Compose features it needed |
|---|---|---|---|
| biolend83/tubehaus | 6 services, Caddy proxy, WARP | Flisk setup merged as an option (#40, #42) | ports with a host address from `.env`, `cap_add`, `init`, named volumes, `sidecarOf`, `env` with `${VAR:-default}` |
| dilolabs/nosia | Rails, Postgres, Caddy | Draft proposal | `command`, `models`, `on-failure:N`, `depends_on` conditions, healthcheck, published ports on every interface, named volumes |
| LycheeOrg/Lychee | Laravel, MariaDB, sidecars | Draft spec | profiles, `tmpfs`, `env_file`, `deploy` limits, renamed services, `start_period`, volume names, bind mounts |
| karatektus/pl_mail | Symfony, Postgres | Issue open | image with `${VAR}`, `entrypoint`, `stop_grace_period`, network aliases, `healthcheck: disable`, ports with variables, a committed `.env` |
| labsai/EDDI | Java, MongoDB | Not opened | `$$` escapes in commands, one-shot jobs, `service_completed_successfully` (its image does not start on every CPU) |
| anyproto/any-sync-dockercompose | 15 services | Not opened | bind sources from variables, SELinux labels, `${VAR:?message}` images |
| wger-project/docker | Django, nginx | Not opened | `include:` files, `logging` |
| open-mercato/open-mercato | Node, many overlays | Not opened | `extra_hosts` with a variable, bind sources `${VAR:-./path}` |
| liketrek/TREK, open-wanderer/wanderer | Single app plus database | Discussions open | bare published ports, host-based routing for a web app |

## Compose features

| Compose | service.json | Since (core release) | Importer and exporter | Needed by | Status |
|---|---|---|---|---|---|
| `image`, `build` | `image`, `buildContext`, `dockerfile` | 1.4.0 | yes | all | covered |
| `command`, `entrypoint` on an image | a generated Dockerfile next to the service | n/a (importer) | yes | nosia, pl_mail, EDDI | covered |
| `environment` with `${VAR}`, `${VAR:-d}`, `${VAR-d}` | `env` | 1.4.24; `${VAR-d}` 1.4.27 | yes | all | covered |
| required secrets | `secrets.required` | 1.4.0 | yes | nosia | covered |
| `ports` (host address, host port) | `extraPorts` `bind`, `hostPort` | 1.4.24 | yes | tubehaus, nosia | covered |
| `ports` with `${VAR:-d}` host side | `extraPorts` `publish` | 1.4.26 | yes | tubehaus, EDDI | covered |
| `ports` with a variable and no default | `extraPorts` `publish` | 1.4.29 | yes | any-sync | tested, limit: the container port stays literal |
| named volumes | `volumes` | 1.4.24 | yes | all | covered |
| volume with its own Docker name | `volumes[].name` | 1.4.27 | yes | nosia, Lychee, pl_mail | covered |
| bind mounts inside the project | `volumes` (relative path) | 1.4.24 | yes | Lychee | covered |
| bind source `${VAR:-./path}` | `volumes[].source` | 1.4.28 | yes | open-mercato | tested |
| bind source `${VAR}` with no default | `volumes[].source` | 1.4.29 | yes | any-sync | tested, limit: the value must be an absolute path in `.env` |
| SELinux `:z`, `:Z` | `volumes[].selinux` | 1.4.28 | yes | any-sync | tested |
| bind mount outside the project | none | n/a | skipped with a note | any-sync | by design |
| `healthcheck` command, interval, timeout, retries | `healthCheck` | 1.4.0 (`healthCheck`) | yes | nosia, Lychee | covered |
| `healthcheck.start_period` | `healthCheck.startPeriod` | 1.4.27 | yes | Lychee, EDDI | covered |
| `healthcheck: disable` | `healthCheck: false` | 1.4.0 (`healthCheck: false`) | yes | pl_mail | covered |
| `depends_on` with conditions | `dependsOn` objects | 1.4.28 | yes | nosia, EDDI, wger | partial: the condition is kept in the exported Compose, it does not change the start order inside Flisk |
| `restart: on-failure:N` | `restart` | 1.4.27 | yes | nosia | covered |
| no `restart` set | none (Flisk restarts after a crash or reboot) | n/a | yes | pl_mail, EDDI | by design: Compose would not restart |
| `cap_add`, `cap_drop`, `read_only`, `user`, `security_opt`, `shm_size`, `init` | `container` | 1.4.24 | yes | tubehaus, Lychee | covered |
| `tmpfs`, `env_file` | `container.tmpfs`, `envFile` | 1.4.27 | yes | Lychee | covered |
| `deploy.resources.limits` | `container.cpus`, `container.memory` | 1.4.24 (`cpus`, `gpus`) | yes | Lychee | covered |
| `deploy.resources.reservations` | none | n/a | dropped with a note | Lychee | open |
| `profiles` | `profiles` | 1.4.24 | yes | Lychee, EDDI, any-sync | covered |
| `models` | `models` | 1.4.27 | yes | nosia | tested, never started here (needs Docker Model Runner) |
| `stop_grace_period` | `container.stopGracePeriod` | 1.4.27 | yes | pl_mail | covered |
| network aliases | `container.networkAliases` | 1.4.27 | yes | pl_mail, Lychee | covered |
| `extra_hosts` | `container.extraHosts` | 1.4.27 | yes | open-mercato | tested |
| `extra_hosts` with a variable address | `container.extraHosts` | 1.4.29 | yes | open-mercato | tested |
| `ulimits` | `container.ulimits` | 1.4.27 | yes | EDDI | tested |
| build `args` | `buildArgs` | 1.4.28 | yes | pl_mail | tested |
| `logging` | `logging` | 1.4.28 | yes | wger | tested |
| image with `${VAR}` or `${VAR:-d}` | `image` | 1.4.27 | yes | pl_mail | covered |
| image with `${VAR:?message}` | `image` | 1.4.28 | yes | any-sync | tested |
| `network_mode: service:x` | `sidecarOf` | 1.4.24 | yes | tubehaus | covered |
| `include:`, `extends:`, anchors | resolved by the importer | n/a (importer) | yes | wger, nosia | tested, a plan note says when Compose is missing |
| `container_name` | none, Flisk names containers | n/a | dropped with a note | Lychee | by design |
| several or named custom `networks` | the default network | n/a | ignored with a note | Lychee | open: a service that needs two isolated networks is not expressible |
| `command` on a service that has `build:` | none | n/a | noted, not carried over | none yet | open |
| top-level Compose `secrets:` and `configs:` | none | n/a | not handled | none yet | open, not yet tested on a real repository |
| a web UI behind the proxy | `webUi: true` | 1.4.29 | set by hand | TREK, wanderer | tested, not checked in a browser; the importer cannot tell UI from API |

## Flisk behaviour that surprised adopters

| What happened | Issue | State |
|---|---|---|
| Flisk injected its own `DATABASE_URL` into services that never asked for the shared Postgres | #2991 | fixed in 1.4.30 (#3010) |
| a hidden 512 MB memory limit killed images that need more | #2992 | fixed in 1.4.29 (#3001) |
| an uppercase project name refused to start | #1519, #2995 | fixed in 1.4.29 (#3001), import 0.17 lowercases it |
| the platform Compose file kept the old project name after a rename | #2993 | fixed in 1.4.29 (#3001) |
| the unused router and a Postgres start for a project that only has bring-your-own services | #2963 | fixed on main (#3025, #3034), not in a release yet: the npm 1.4.30 package was published from a commit before #3025 |
| the router's ports are read from the shell, not from `.env` | #2971 | fixed on main (#3028), not in a release yet (same reason) |
| status and logs read another project's Tilt | #2943 | fixed in 1.4.29 (#2969, by a contributor); not yet re-checked with two projects running |
| `flisk up` writes a workspace `package.json`, `.tiltignore` and `shared-platform-engineering/` into the repository root | #3030 | fixed on main (#3031, adds them to `.gitignore`), not in a release yet |

## Updating this file

- Add a repository when its Compose file has been imported and its stack started for real. A dry run is not enough.
- Add a row when a repository needs something that is not in the table, with the issue link, and change *Status* only after a real run shows the fix.
- Keep the *Since* column to released versions. Take it from the tags (`git tag --contains <merge commit>`), not from the pull request date or from memory.
