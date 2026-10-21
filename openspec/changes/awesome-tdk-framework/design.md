## Context

The TDK ecosystem already has an organization profile and multiple public repositories, but useful material is distributed across project READMEs, documentation, gists, articles, examples, and third-party tools. The catalog is a public GitHub repository with two tracked files: a root `README.md` for discovery and a root `CONTRIBUTING.md` for detailed contribution guidance. It does not need source code, data files, generated indexes, assets, or automation.

## Goals / Non-Goals

**Goals:**
- Make the catalog a comprehensive, skimmable map of the TDK framework and its surrounding landscape.
- Give each resource a concise description and identify official, community, and archived status where relevant.
- Provide stable anchors, consistent Markdown formatting, and a clear path for suggesting additions.
- Keep the repository focused on the root `README.md` catalog and root `CONTRIBUTING.md` guide.
- Reuse links from the existing TDK organization profile and repositories, verifying each destination as the catalog is assembled.

**Non-Goals:**
- Building a website, link-checking service, registry API, or automated synchronization system.
- Copying the contents of linked projects or maintaining their documentation.
- Listing every project indiscriminately; the catalog is curated and TDK-relevant.
- Adding source code, data files, assets, CI, or automation. Repository visibility and license policy are managed through GitHub settings where applicable.

## Decisions

1. **Two focused Markdown files.** The repository contains only root `README.md` and `CONTRIBUTING.md`. The README is the landing page and resource catalog; the contribution guide holds detailed curation and submission rules, while the README links to it. This keeps discovery direct and avoids repeating instructions. A larger documentation or automation structure remains out of scope.

2. **One curated catalog with a linked table of contents.** Use Markdown headings and a compact linked table of contents so the document remains navigable as it grows. Organize primarily by what a reader is looking for, rather than by organization/repository ownership. Use short link entries (`[Name](URL) — description`) and tables only where a few comparable items benefit from them. Alternative: a flat link dump; rejected because it does not scale or communicate relevance.

3. **Broad, extensible taxonomy.** Start with sections for: official starting points; core CLI and framework; documentation and architecture; tutorials and learning; examples and demo applications; starters, templates, and scaffolding; extensions, plugins, and adapters; integrations and supported technologies; local development and orchestration; deployment and operations; observability and debugging; security and identity; community projects and showcases; articles and blog posts; gists and code snippets; talks, videos, and podcasts; ecosystem tools and related projects; contribution and community channels. Add or merge sections when the content warrants it, keeping section labels task-oriented and avoiding empty headings.

4. **Explicit provenance and maintenance signals.** Mark resources as official or community-maintained when useful, and mark archived/unmaintained resources rather than silently presenting them as current. Each item includes a human-readable title and a one-sentence description; avoid duplicate entries and link to the most authoritative canonical destination. Alternative: relying on link domains alone; rejected because ownership and maintenance status are not always obvious.

5. **Dedicated contribution guide.** Put detailed inclusion criteria, provenance labels, entry format, and issue/pull-request steps in `CONTRIBUTING.md`; keep a short pointer in the README. GitHub surfaces a root contribution guide alongside the README, and this avoids a long contribution section in the catalog itself. No issue template or contribution automation is needed.

6. **Manual link verification for the initial release.** During implementation, check that every included destination resolves to the intended public resource and that descriptions do not claim unsupported capabilities. No ongoing link-check CI is added. Alternatives: no verification or a CI workflow; the former risks shipping a poor directory, while the latter violates the repository constraint.

## Risks / Trade-offs

- A large README can become difficult to maintain → Use a concise linked table of contents, consistent entry format, and merge redundant or obsolete categories.
- Links can rot or project status can change → State that maintainers may update/remove stale links and label known archived resources; periodically review the catalog as ordinary maintenance.
- Official and community content may be confused → Add clear provenance labels and describe community resources without implying endorsement.
- The additional guide may make the repository feel less minimal → Limit it to contribution criteria and workflow; keep the catalog itself in the README.
- Public-repository creation and organization settings are external to this change's local codebase → Treat repository creation, visibility, and profile-link update as explicit implementation tasks and report any access limitation rather than creating a substitute repository elsewhere.

## Migration Plan

1. Assemble and verify the initial link inventory from the existing organization profile, TDK repositories, docs, public gists, and other known ecosystem resources.
2. Create the public `flisk-sh/awesome-tdk-framework` repository with root `README.md` and `CONTRIBUTING.md`; publish the curated taxonomy and link the README to the guide.
3. Add a prominent catalog link to the existing TDK organization profile README and check the link in the rendered profile.
4. Confirm the final tracked file list is exactly `README.md` and `CONTRIBUTING.md`, and confirm both render from the public repository.

Rollback is limited to reverting the profile link or removing/renaming the new repository if publication is premature; no software runtime migration is involved.

## Open Questions

- None blocking. Use the organization namespace `flisk-sh` based on the existing public profile and repositories. The repository's public visibility and repository-level license/feature settings should be chosen during repository creation.
