# Importer 0.1.1 release evidence

## Source and publication

- Importer release PR: https://github.com/tdk-landscape/tdk-import/pull/11 (merged).
- Tag: `v0.1.1`, commit `14480fb3425a3876b9cc8c6f07fdf430bfa10af8`.
- Verified the commit descends from #9 (`b4502a0`) and #10 (`d335c0e`).
- Build, typecheck, lint, and all 55 tests passed locally and in importer PR CI.
- Lint reported only the existing configuration schema version informational notice.
- Publish workflow: https://github.com/flisk-sh/tdk-cli-core/actions/runs/37298395884
- Inputs: `ref=v0.1.1`, `dry_run=false`.
- First publish attempt returned npm E404. After updating the Actions credential, attempt 2 published successfully using the same tested artifact.
- `npm view @tdk-landscape/tdk-import version` reports `0.1.1`.

## Published tarball verification

The registry tarball matches the workflow build artifact byte for byte and has integrity:

```text
sha512-8Ddn94Liy6U1AKImOd9JexKHdpsT8ktpsK60M7ybiD4zpfR5b1Pzt6tCBuS1nft4uvBP0kQlsmdHcM0T4QSRug==
```

These checks ran via `npx -y @tdk-landscape/tdk-import@0.1.1` in isolated directories with a fresh npm cache, using the published package rather than the source build:

| Scenario | Exit | Observed result |
| --- | --- | --- |
| `--version` | 0 | Prints 0.1.1; no files written |
| Helm-only | 2 | Names Helm; writes nothing; no import plan |
| Helm-only dry-run | 2 | Names Helm; writes nothing; no import plan |
| Kustomize-only | 2 | Names Kustomize; writes nothing; no import plan |
| Kustomize-only dry-run | 2 | Names Kustomize; writes nothing; no import plan |
| Mixed Python/Node Procfile | 0 | Writes worker service.json; skips web; says to add Dockerfile or image |
| Python-only Procfile | 2 | Skips process; writes nothing |

Raw output and file snapshots are in `published-evidence.json`. Core `flisk up` was not rerun for this package release; the existing core 1.3.104 prerequisite is unchanged.

## Reproduce

```bash
gh run download 37298395884 --repo flisk-sh/tdk-cli-core --name tdk-import-tarball --dir /tmp/import-release-artifact
node openspec/changes/archive/2026-10-05-import-publish/verify-published.mjs /tmp/import-release-artifact/tdk-landscape-tdk-import-0.1.1.tgz /tmp/import-published-evidence.json
```

The workflow artifact has a one-day retention. After it expires, use the recorded integrity to verify the npm tarball; byte comparison to a newly built tarball does not prove the original workflow artifact.
