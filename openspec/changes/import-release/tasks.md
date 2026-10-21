## 1. Correct unsupported-format refusal

- [x] 1.1 Inspected published `@tdk-landscape/tdk-import@0.1.0`: Helm and Kustomize each exit 2 without writes, but `--dry-run` prints the import plan before refusing.
- [x] 1.2 Added Helm and Kustomize-only coverage using `Chart.yaml` and `kustomization.yaml`; both refuse with exit 2 and write nothing.
- [x] 1.3 Made unsupported-only `--dry-run` print the refusal, not a plan, and exit 2 without writes.
- [x] 1.4 Added end-to-end coverage showing supported Compose, Dockerfile, package.json script, and Procfile services still write beside unsupported files.

## 2. Document the core prerequisite

- [x] 2.1 Confirmed core 1.3.104 is the first released version containing `buildContext` from tdk-cli-core#525.
- [x] 2.2 Updated the importer README with the command and core 1.3.104-or-later prerequisite; no binary version detection was added.
- [x] 2.3 Added `docs/operator-runbook.md` with the same command and prerequisite, gated `flisk up` on a compatible core.
- [x] 2.4 Confirmed npm latest is still 0.1.0 and documented that the importer workflow must wait for a package containing tdk-import#9.

## 3. Skip unbuildable Procfile processes

- [x] 3.1 Added coverage for the exact command-prefix allowlist and non-Node skips without a matching Dockerfile or image.
- [x] 3.2 Implemented partial imports: supported processes remain, skipped processes produce no manifest, skip guidance prints, and exit status is 0 for a partial import or 2 when all valid processes are skipped.
- [x] 3.3 Covered Python alongside Node and non-Node processes with a matching image or Dockerfile.

## 4. Keep the test file valid

- [x] 4.1 Moved `parseTiltPort`, `resolveTiltPort`, and `stopTiltForUp` into the top import block before every `vi.mock`.
