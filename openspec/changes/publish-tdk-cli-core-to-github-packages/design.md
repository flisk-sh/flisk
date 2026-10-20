# Design

## Context

See `proposal.md` for motivation and scope. The package already has a canonical scoped name and repository URL and is released to npm. GitHub Packages requires scoped package names, registry-specific authentication, and repository Actions permission to publish. npm remains the default registry and existing release path.

## Goals / Non-Goals

**Goals:**
- Publish the release artifact to GitHub Packages without changing the npm publication behavior.
- Keep registry selection explicit per publish step so credentials and registry destinations cannot be confused.
- Document consumer authentication without committing tokens or requiring a PAT for repository-owned publishing.

**Non-Goals:**
- Replacing npm, changing package naming/versioning, or introducing separate package contents for each registry.
- Automatically making the package public if GitHub creates it with restricted visibility; visibility is an explicit release setup action.

## Decisions

- **Use a separate registry-targeted publish step.** Build/package once and publish the generated package artifact to npm and GitHub Packages. Set the GitHub registry only for its publish invocation, rather than changing the package's global `publishConfig`, which could redirect existing npm releases.
- **Authenticate repository-owned publishing with `GITHUB_TOKEN`.** Grant only `packages: write` to the publishing job, retain existing permissions needed for the npm job, and use the repository/package link from `package.json`. Use a classic PAT only for consumers or future cross-repository publishing that cannot use the repository token.
- **Keep release triggers aligned.** Run both registry publish steps for the existing release tag trigger. A failure in either registry must be visible as a failed release job; avoid silently treating a partial dual publish as complete.
- **Keep public npm as the default consumer channel.** Document the scoped `.npmrc` mapping and token setup for GitHub Packages consumers, while leaving existing installation commands and npm configuration unchanged.
- **Treat package visibility as a one-time setup decision.** Verify the first published package's visibility and document the repository/package settings action needed to make it public. Do not assume the first publish is public.

## Risks / Trade-offs

- [First-publish visibility may default to restricted] → Verify package settings after initial publication and make the package public if the intended distribution is public.
- [Registry versions can drift after partial failures] → Publish the same built artifact and version to both registries and fail the release if either registry step fails; document recovery by rerunning only the missing registry step.
- [Token leakage or overbroad permissions] → Use the job-scoped `GITHUB_TOKEN`, least-privilege package permission, and secret references in examples; never commit credentials.
- [Consumers may misconfigure npm registry mapping] → Provide a copyable scoped mapping and an install verification procedure while preserving npm as the default.

## Migration Plan

1. Add and review the registry-specific publish workflow and consumer documentation without altering the npm path.
2. On the next eligible release, publish to GitHub Packages using the same package artifact; verify package visibility and adjust it to public if intended.
3. Verify registry metadata and install the released version in a clean environment using documented authentication.
4. If GitHub Packages publishing fails, retain the successful npm release and rerun the GitHub Packages step for that exact version; do not rebuild a different artifact under the same version.

## Open Questions

None. The proposal calls for a public alternate registry; the one-time package visibility action is part of first-publish verification.
