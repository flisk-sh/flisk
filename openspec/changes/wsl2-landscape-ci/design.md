## Context

The repository already has `scripts/wsl2-smoke.sh`, `docs/wsl2.md`, a native Windows refusal contract, and an Ubuntu-only quickstart E2E. Those assets do not produce evidence that the landscape boots through WSL2 on a Windows host. The CI design must exercise the existing smoke path on an actual Windows runner and keep native Windows CLI behavior separately observable.

## Goals / Non-Goals

**Goals:**
- Produce a required, reproducible WSL2 landscape boot result on the available GitHub-hosted `windows-2022` runner, using Ubuntu 24.04 WSL2 and Docker Engine inside the distro.
- Verify the native Windows CLI inspection and refusal contract in CI.
- Make the passing WSL2 run discoverable from `docs/wsl2.md`, clearly stating which Docker runtime CI exercised.
- Keep Docker Desktop WSL integration explicitly unverified by this CI path.

**Non-Goals:**
- Booting the landscape natively on Windows.
- Changing the score formula, Job-fit axes, Stability or Adoption assessment, or the 1.x stability caveat.
- Replacing the existing Ubuntu quickstart E2E.

## Decisions

- **Tighten the existing WSL2 workflow instead of adding another smoke.** Keep `.github/workflows/wsl2-smoke.yml` on the hosted `windows-2022` runner, provision Ubuntu 24.04 WSL2, install Docker Engine inside the distro, and invoke the existing `scripts/wsl2-smoke.sh`. Add a push trigger for the default branch while retaining pull request coverage. The job must be configured as a required check. It does not represent the Docker Desktop integration path described in `docs/wsl2.md`; that claim remains untested. Only a successful conclusion on the default branch is evidence for the runtime it actually exercises.
- **Extend the existing native Windows smoke workflow.** Add the version, doctor, dry-run, and startup refusal assertions to `.github/workflows/windows-smoke.yml`. `flisk up shop` must exit non-zero, direct the user to WSL2 Ubuntu, and start no containers. Keep this validation separate from the WSL2 boot result.
- **Link and qualify the workflow from `docs/wsl2.md`.** Use a stable workflow or badge link to the Actions history, not a transient run URL. Label the CI backend as Docker Engine inside WSL2 and state that Docker Desktop integration is not tested, so readers do not confuse the two environments.
- **Preserve the scorecard boundary.** This proposal specifies evidence collection only. It does not edit the rating formula or treat a script, proposal, or unmerged workflow as a score change.
- **Do not award the Platforms 5 anchor for a backend mismatch.** With `docs/wsl2.md` still prescribing Docker Desktop, a successful Engine-in-WSL2 job plus native refusal evidence supports Platforms 4. Platforms 5 requires either a successful Docker Desktop integration test or an explicit documentation change making the Engine-in-WSL2 path the supported Windows route, followed by successful required jobs and a linked run.

## Risks / Trade-offs

- [The hosted workflow exercises Docker Engine inside WSL2 while the user guide describes Docker Desktop integration] → Label the tested runtime in the workflow and guide, and do not use this result as evidence for Docker Desktop support.
- [A passing workflow may not be configured as a branch protection requirement] → Name the job consistently and configure the corresponding required status check on the default branch as part of rollout.
- [Smoke failures can leave containers or resources behind] → Preserve the script's cleanup behavior and ensure workflow cleanup runs even when startup or health checks fail.

## Migration Plan

Update the existing WSL2 workflow trigger and required-check configuration, extend the existing native Windows workflow, and exercise both on a pull request. After a successful default-branch WSL2 run exists, add the stable, clearly qualified Actions link to `docs/wsl2.md`. Rollback consists of removing the new required-check policy and evidence link if the runner cannot reliably provide the specified environment; the WSL2 documentation and smoke script remain useful independently.

## Open Questions

- Which exact job names will be configured as required branch protection checks?
