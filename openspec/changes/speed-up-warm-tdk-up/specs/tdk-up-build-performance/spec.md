## ADDED Requirements

### Requirement: Golden images are not rebuilt when unchanged

`tdk up` SHALL skip building the golden layer images when every golden image tag exists locally and carries a `tdk.golden.hash` label equal to the hash of the current golden Dockerfile and its pinned base images. When any tag is missing or has a different hash, `tdk up` SHALL build all golden images and label each with the current hash.

#### Scenario: Warm start with unchanged golden Dockerfile
- **WHEN** a user runs `tdk up` and all golden images exist with the current hash label
- **THEN** `golden-layers-build` completes without invoking `docker build` or `docker buildx bake`
- **AND** its log states that the golden images are up to date

#### Scenario: Golden Dockerfile changed
- **WHEN** the generated golden Dockerfile differs from the one the images were built from
- **THEN** `golden-layers-build` rebuilds every golden image
- **AND** each image carries the new hash label

#### Scenario: A golden image is missing
- **WHEN** one golden image tag has been removed
- **THEN** `golden-layers-build` rebuilds the golden images

#### Scenario: User forces a rebuild
- **WHEN** a user requests a forced golden rebuild
- **THEN** the golden images are rebuilt even if the hash matches

### Requirement: Golden images build in one parallel invocation

When golden images must be built, TDK SHALL build all golden targets with a single `docker buildx bake` invocation so independent stages build in parallel. If `docker buildx` is not installed, TDK SHALL fall back to building each target with `docker build` and SHALL log that it did so. A bake failure fails the golden resource; it does not fall back.

#### Scenario: Bake available
- **WHEN** golden images need building and `docker buildx bake` is available
- **THEN** all golden targets are built by one bake invocation with the same targets and tags as the serial build

#### Scenario: Buildx not installed
- **WHEN** golden images need building and `docker buildx` is not installed
- **THEN** TDK builds each golden target with `docker build`
- **AND** the resource log explains that it fell back to serial builds

### Requirement: Image build concurrency matches the Docker engine

The generated Tiltfile SHALL set Tilt's maximum parallel updates from the Docker engine's CPU count and memory, with a minimum of 3 and a maximum of 8. A `TDK_MAX_PARALLEL_BUILDS` environment variable SHALL override the computed value. If the engine's resources cannot be read, the Tiltfile SHALL leave Tilt's default in place and log why.

#### Scenario: Engine with spare capacity
- **WHEN** the Docker engine reports enough CPUs and memory for more than 3 concurrent builds
- **THEN** more than 3 service images build at the same time
- **AND** the Tiltfile log shows the chosen value and that it came from the engine

#### Scenario: User override
- **WHEN** `TDK_MAX_PARALLEL_BUILDS` is set to a positive integer
- **THEN** Tilt uses that value as its maximum parallel updates

#### Scenario: Engine resources unavailable
- **WHEN** `docker info` fails during Tiltfile load
- **THEN** Tilt keeps its default concurrency
- **AND** the Tiltfile log states why the value was not computed

### Requirement: Frontend type-checking does not block the frontend image

For a frontend whose `build` script has the standard form `tsc` (optionally `--noEmit` or `-b`) followed by `&& vite build`, the generated image build SHALL run the Vite production build directly with the generated build config, and TDK SHALL register a separate, non-blocking type-check resource for that frontend. For any other `build` script form, the image build SHALL run the service's `build` script as before.

#### Scenario: Standard build script
- **WHEN** a frontend's `build` script is `tsc --noEmit && vite build`
- **THEN** its image build runs Vite with the generated build config and does not run `tsc`
- **AND** Tilt shows a `<service>-typecheck` resource that runs the type-check

#### Scenario: Type error in a frontend
- **WHEN** a frontend with the standard build script has a TypeScript type error that Vite can still bundle
- **THEN** the frontend image builds and the service starts
- **AND** the `<service>-typecheck` resource fails and shows the error

#### Scenario: Custom build script
- **WHEN** a frontend's `build` script has any other form
- **THEN** the image build runs the service's `build` script with the generated build config, as before
- **AND** no type-check resource is added for it

#### Scenario: Focus mode enables the typecheck with its service
- **WHEN** a user runs `tdk up` in focus mode for a frontend that has a type-check resource
- **THEN** the `<service>-typecheck` resource is enabled alongside the service
- **AND** it is not left disabled by the focus filter

#### Scenario: User scripts are not rewritten
- **WHEN** TDK regenerates a project
- **THEN** it does not modify the frontend's `package.json` scripts
