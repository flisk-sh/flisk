## ADDED Requirements

### Requirement: WSL2 landscape boot is a required CI result
The existing `.github/workflows/wsl2-smoke.yml` SHALL run `scripts/wsl2-smoke.sh` on the GitHub-hosted `windows-2022` runner using Ubuntu 24.04 WSL2 and Docker Engine installed inside the distro. It SHALL run on pull requests and on every push to the default branch, without path filters that can suppress those runs. The smoke SHALL boot the bundled example and verify its routed health URL. The job SHALL be configured as a required check. Only a job conclusion of `success` on the default branch counts as evidence for the tested WSL2 plus Docker Engine path. This job SHALL NOT be represented as testing Docker Desktop WSL integration, which remains unverified.

#### Scenario: WSL2 landscape job passes
- **WHEN** the required WSL2 job completes on the default branch
- **THEN** its log shows doctor, `flisk up`, and a successful health check against the routed URL
- **AND** `docs/wsl2.md` links to the workflow history and identifies Docker Engine inside WSL2 as the tested backend
- **AND** the link does not claim that Docker Desktop integration was tested

#### Scenario: Only local WSL2 assets exist
- **WHEN** `scripts/wsl2-smoke.sh` and `docs/wsl2.md` exist but no required green WSL2 job exists on the default branch
- **THEN** the Platforms evidence remains at 3

#### Scenario: WSL2 workflow did not succeed
- **WHEN** the WSL2 workflow is skipped, cancelled, neutral, or has any conclusion other than `success`
- **THEN** it does not count as green evidence and Platforms remains at 3

#### Scenario: WSL2 workflow runs on the default branch
- **WHEN** a commit is pushed to the default branch
- **THEN** the existing WSL2 workflow runs and produces a check result for that commit

#### Scenario: Pull request cannot affect the WSL2 path
- **WHEN** a pull request is a draft, or changes only documentation, bring-your-own examples, tests, committed build output (`cli/dist`), or the TUI screen
- **THEN** the WSL2 job is skipped, which satisfies the required check, because Windows runner minutes are limited
- **AND** the job runs when the pull request leaves draft, and on every push to the default branch regardless of paths

#### Scenario: Unrelated default-branch change is pushed
- **WHEN** a commit that does not change the workflow or smoke script is pushed to the default branch
- **THEN** the WSL2 workflow still runs because the push trigger has no path filter

### Requirement: Native Windows CI verifies inspection and refusal behavior
A native Windows AMD64 job in the existing `.github/workflows/windows-smoke.yml` SHALL run `flisk --version`, `flisk doctor`, and `flisk up --dry-run`. It SHALL then run `flisk up shop` and verify that the command exits non-zero, prints guidance to use WSL2 Ubuntu, and does not start containers.

#### Scenario: Native Windows landscape startup is refused
- **WHEN** the native Windows CI job runs `flisk up shop`
- **THEN** the command exits non-zero, directs the user to WSL2 Ubuntu, and starts no containers

### Requirement: Platform rescore is gated on main-branch evidence
When `docs/wsl2.md` continues to describe Docker Desktop integration, successful required jobs for Ubuntu 24.04 WSL2 plus Docker Engine inside WSL2 SHALL support Platforms 4, not 5. A Platforms score of 5 SHALL require either a successful required CI test of Docker Desktop WSL integration or an explicit change to `docs/wsl2.md` making the tested Engine-in-WSL2 path the supported Windows route. In either case, both required jobs SHALL conclude `success` on the default branch and the WSL2 workflow history SHALL be linked with the tested backend identified. A rescore SHALL leave other axes and the rating formula unchanged. With the current guide unchanged and all other axes unchanged, the expected rescore after successful evidence is Job-fit 8.0, Adoptability 6.0, and headline 6.9.

#### Scenario: Both jobs succeed while the guide still prescribes Docker Desktop
- **WHEN** both required jobs conclude `success` on the default branch, the WSL2 workflow history is linked with Docker Engine inside WSL2 identified, and `docs/wsl2.md` still prescribes Docker Desktop integration
- **THEN** Platforms may be scored 4, and the expected unchanged-axis rescore is Job-fit 8.0, Adoptability 6.0, headline 6.9

#### Scenario: The tested runtime and supported Windows path match
- **WHEN** both required jobs conclude `success` on the default branch, the linked workflow tests Docker Desktop integration or `docs/wsl2.md` explicitly makes the tested Engine-in-WSL2 path the supported Windows route
- **THEN** Platforms may be scored 5 for that documented and tested path

#### Scenario: Platform jobs are absent or not green
- **WHEN** either required job is missing or not green on the default branch
- **THEN** Platforms remains 3 and the headline remains 6.6 with all other axes unchanged

#### Scenario: Either platform job is skipped, cancelled, or neutral
- **WHEN** either required job concludes `skipped`, `cancelled`, or `neutral`
- **THEN** the jobs are not both successful evidence, Platforms remains 3, and the headline remains 6.6 with all other axes unchanged
