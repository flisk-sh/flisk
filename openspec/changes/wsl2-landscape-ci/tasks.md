## 1. Configure Windows WSL2 CI

- [x] 1.1 Update the existing `.github/workflows/wsl2-smoke.yml` to trigger on every push to the default branch as well as pull requests; remove the current `paths` filter so unrelated changes cannot suppress the required run. Retain `windows-2022`, Ubuntu 24.04 WSL2, and Docker Engine inside the distro.
- [x] 1.2 Ensure the existing WSL2 workflow runs `scripts/wsl2-smoke.sh`, always cleans up after failures, and exposes doctor, startup, and routed health-check output in its logs.
- [x] 1.3 Configure the existing WSL2 workflow as a required check on the default branch while preserving Ubuntu `example-e2e` as a separate required gate. Main branch protection requires `example-e2e`, `wsl2-smoke`, and `windows-smoke`.

## 2. Verify native Windows contract

- [x] 2.1 Extend the existing `.github/workflows/windows-smoke.yml` to run `tdk --version`, `tdk doctor`, and `tdk up --dry-run` on native Windows AMD64.
- [x] 2.2 In the existing Windows smoke workflow, run `tdk up shop` and assert non-zero exit, WSL2 Ubuntu guidance, and no container startup.
- [x] 2.3 Configure the native Windows refusal check as a required default-branch check. Main branch protection requires `windows-smoke`.

## 3. Publish and verify platform evidence

- [x] 3.1 Run both jobs on a pull request and resolve runner or smoke failures without weakening the specified checks.
- [x] 3.2 Link the stable WSL2 workflow history from `docs/wsl2.md` after a successful default-branch run, and label that it tests Docker Engine inside WSL2 rather than Docker Desktop integration.
- [x] 3.3 Confirm skipped, cancelled, and neutral results do not count as success; keep the rating formula, Job-fit axes, other score axes, and 1.x stability caveat unchanged. With the current Docker Desktop guide, rescore Platforms to 4 only after both required jobs succeed and the Engine-in-WSL2 link is documented; reserve 5 for a tested Desktop path or a guide updated to make the tested Engine path the supported route. The [WSL2 smoke run](https://github.com/flisk-sh/tdk-cli-core/actions/runs/36903887190) succeeded on `ad7c5c0`; the successful [main reconfirmation](https://github.com/flisk-sh/tdk-cli-core/actions/runs/36905524644) was on `d8bc46b`. Skipped, cancelled, and neutral conclusions are not passing evidence.
