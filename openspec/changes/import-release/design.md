## Context

The change spans two repositories. The importer lives in `tdk-landscape/tdk-import`; the operator runbook and `up.test.ts` live in `tdk-cli-core`. The published importer 0.1.0 already recognizes Helm/Kustomize-only inputs, but its dry-run path prints a plan before refusing. It also keeps Procfile processes even when neither the importer nor Flisk can build them. Core release 1.3.104 is the first release listing tdk-cli-core#525, which adds `buildContext`.

## Goals / Non-Goals

**Goals:**
- Refuse unsupported-only inputs with exit 2 and no writes; make dry-run print only the refusal for those inputs.
- Preserve valid imports from supported files when unsupported Helm/Kustomize files are also present.
- Filter unbuildable non-Node Procfile processes while importing buildable sibling processes.
- Document the 1.3.104 core prerequisite without adding core-version detection to the importer.
- Keep the three named test imports before all mocks.

**Non-Goals:**
- Add language or importer detector support, adopter onboarding, Windows `flisk up`, or premium features.
- Publish the importer package as part of this change.
- Change the core runtime to detect which importer or core version was used.

## Decisions

- Build the importer plan first, then refuse without printing the plan when there are no importable services and the input contains unsupported files. This gives dry-run and normal mode the same exit 2 and no-write outcome.
- Keep unsupported-file detection independent from supported detectors. When a plan includes an importable service, Helm/Kustomize entries remain skips and do not block writing supported services.
- Classify a Procfile command as supported only when the first command token starts with `node`, `npm`, `pnpm`, `yarn`, or `bun`. Do not strip wrappers or environment prefixes to infer support. Skip a nonmatching process only when the merged process has no image or Dockerfile. Keep buildable siblings in the plan; return 0 for a partial import and 2 if every valid process was skipped.
- State that core 1.3.104 is the first release with `buildContext`, and require 1.3.104 or newer in the importer README and operator runbook. This is a documentation contract; the binary does not inspect the installed Flisk version.
- Move the three named test imports into the top import block before every `vi.mock` call; this PR carries that import-order fix with the importer change.

## Risks / Trade-offs

- [The published 0.1.0 tarball can differ from the checked-in source] → Inspect the tarball and record its observed refusal behavior; this change does not publish a new package.
- [A Procfile command may use a wrapper for a supported runtime] → Follow the explicit command-prefix list and ask users to provide an image or Dockerfile for commands outside it.
- [The importer and core changes cannot share one GitHub PR because they are separate repositories] → Keep importer implementation in tdk-landscape/tdk-import#9 and core specs/docs in tdk-cli-core#558.
