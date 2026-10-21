# Change: Publish the importer the runbook already refuses to run

## Why
`tdk-import#9` and `#10` are merged. npm `latest` is still
`@tdk-landscape/tdk-import@0.1.0`, which dry-runs a plan before refusing.
The runbook tells the user not to use `npx` until a release after 0.1.0 exists.
This change publishes that release and pins the docs to it.

## What changes
- Publish `@tdk-landscape/tdk-import@0.1.1` from the commit that contains #9 and #10.
- Prove the published tarball, not a local build.
- Pin the core runbook and the importer readme to 0.1.1.
- Leave core 1.3.104 as the minimum for `flisk up` on an imported service.

## Impact
- Affected: tdk-import package, `docs/operator-runbook.md`, importer README
- Out of scope: new detectors, adopters, Windows `flisk up`, premium features

---

# Spec: published package

### Requirement: 0.1.1 is the safeguard release
`npm view @tdk-landscape/tdk-import version` MUST report `0.1.1` after publish.
The tarball MUST be built from the commit that contains tdk-import#9 and #10.
The publish workflow MUST run with `dry_run` off.

#### Scenario: latest is not 0.1.0
- GIVEN the publish workflow succeeded
- WHEN a clean machine runs `npx -y @tdk-landscape/tdk-import@0.1.1 --version`
- THEN it prints 0.1.1
- AND it does not install 0.1.0

---

# Spec: refusal on the published tarball

### Requirement: unsupported-only directories exit 2
`Chart.yaml` is Helm. `kustomization.yaml` is Kustomize. A directory that has
only those files MUST exit 2, name the unsupported type, and write nothing.
`--dry-run` on that directory MUST print the refusal, exit 2, and write nothing.
It MUST NOT print an import plan.

#### Scenario: Helm only
- GIVEN a directory with `Chart.yaml` and no Compose, Dockerfile, package.json script, or Procfile
- WHEN the user runs the published 0.1.1 package
- THEN the command exits 2
- AND no files are written

#### Scenario: dry-run does not plan
- GIVEN a directory with only `kustomization.yaml`
- WHEN the user runs the published 0.1.1 package with `--dry-run`
- THEN the command exits 2
- AND the output names Kustomize
- AND no files are written

---

# Spec: mixed Procfile

### Requirement: Node is written, other runtimes are skipped
A command that starts with `node`, `npm`, `pnpm`, `yarn`, or `bun` is eligible.
Any other command is skipped unless that process already has a Dockerfile or image.
A mixed Procfile MUST write the eligible services, print each skip, and exit 0.
Exit 2 only when every process was skipped.

#### Scenario: Python and Node
- GIVEN a Procfile with `web: python app.py` and `worker: node worker.js`, and no Dockerfile
- WHEN the user runs the published 0.1.1 package with `--yes`
- THEN a service.json is written for worker
- AND no service.json is written for web
- AND the output says to add a Dockerfile or image for web
- AND the command exits 0

---

# Spec: docs pin

### Requirement: commands name 0.1.1
`docs/operator-runbook.md` and the importer README MUST show
`npx -y @tdk-landscape/tdk-import@0.1.1`. They MUST keep the core gate:
imported services need Flisk CLI core 1.3.104 or later, and the importer does not
check the installed core version.

#### Scenario: reader follows the runbook
- GIVEN 0.1.1 is the latest published safeguard release
- WHEN a reader copies the import command
- THEN the command includes `@0.1.1`
- AND the page still says not to run `flisk up` on a core older than 1.3.104
