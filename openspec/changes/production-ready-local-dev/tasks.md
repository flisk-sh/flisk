# Tasks

This change ships the command boundaries. Sections 4 and 5 are not this change.

## 1. Regenerate

- [x] 1.1 `flisk config regenerate` rewrites generated files and leaves every `service.json` byte-identical
- [x] 1.2 `flisk config regenerate --dry-run` writes nothing
- [x] 1.3 A second regenerate on unchanged `.tdk/project.json` is byte-identical
- [x] 1.4 `flisk config verify` exits 0 on that output and still says generated files are in sync

## 2. Migrate

- [x] 2.1 A missing `schemaVersion` is written only by `flisk config migrate`
- [x] 2.2 Migrate does not rewrite generated Docker or Tilt files
- [x] 2.3 An unsupported `schemaVersion` fails and writes nothing
- [x] 2.4 A file that is already current is left byte-identical

## 3. Import and doctor

- [x] 3.1 `flisk import` does not call regenerate or migrate
- [x] 3.2 Import npx failure stays exit 127
- [x] 3.3 Doctor JSON stays `{ schemaVersion, data.ready, data.checks, errors }` and exit codes stay 0/1/2

## 4. Not this change

- [ ] 4.1 Do not add a command, alias, or flag
- [ ] 4.2 Do not make `flisk up` idempotent here
- [ ] 4.3 Do not add port-owner detection, Ctrl+C recovery, or a lock file here
- [ ] 4.4 Do not add a golden suite or platform-matrix CI here
