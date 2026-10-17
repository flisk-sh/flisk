# NestJS BYO Example: Native Project Proposal

Status: proposal for #512. This PR changes documentation only; implementation starts after maintainers agree on this scope.

## Scope

Refactor examples/byo/nestjs into a conventional NestJS 10 application while preserving the existing bring-your-own container contract. Keep this as a small HTTP example; do not add a database variant.

## Proposed choices

- Use the Nest CLI project layout: src/main.ts, src/app.module.ts, src/app.controller.ts, src/app.service.ts, nest-cli.json, and tsconfig.build.json.
- Use @nestjs/config to read PORT, retaining the current default of 3000, and bind to 0.0.0.0. Do not add a validation schema that rejects environment variables supplied by TDK. TDK also supplies DATABASE_URL; this example must ignore it and must not open a database connection.
- Use @nestjs/terminus for GET /health without database or external-service indicators. Do not add a global route prefix: TDK's proxy strips /api/nestjs and the app keeps serving from /.
- A successful health check must return HTTP 200. Terminus may return its standard status/info/error/details object; consumers and verification must not require the current hand-written { status: 'ok' } body.
- Keep the sample /orders response, moved into the app controller/service structure.
- Build with the local Nest CLI (nest build) in the Docker build stage. The build stage copies nest-cli.json and tsconfig.build.json. @nestjs/cli is a build-stage devDependency; @nestjs/config and @nestjs/terminus are runtime dependencies. The runtime stage installs production dependencies only and starts node dist/main.js.
- Call app.enableShutdownHooks() before listen(). No shutdown behavior is a pass/fail criterion unless a deterministic SIGTERM check is added to the verification.
- Do not add Postgres, Prisma, migrations, a second sample variant, or cluster-deployment configuration. The example remains a BYO resource, not a TDK-generated application.

## Acceptance criteria for the implementation

1. tests/e2e/resource-types/bring-your-own/verify-byo-example.sh nestjs builds the container and gets HTTP 200 from /health.
2. tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh nestjs /health gets HTTP 200 through tdk up at the NestJS resource route, with the path prefix stripped as documented.
3. The app still reads the assigned PORT, binds 0.0.0.0, preserves /orders, and starts successfully when TDK supplies DATABASE_URL without opening a database connection.
4. The Docker build uses Nest CLI output and the runtime image starts the compiled entry point with production dependencies only.
5. The per-folder README keeps its existing format and documents the commands actually run.
6. Verification scripts remove their containers, networks, and image tags.

A separate Nest testing-module setup is intentionally not required in this first pass: the existing verification scripts exercise both the standalone container contract and TDK routing. If maintainers want a framework-level test, add it after the implementation scope is agreed.

After the implementation lands, fold the approved decisions and actual commands into examples/byo/nestjs/README.md, then remove this proposal file so it cannot drift.

## Review requested

Please confirm or adjust the proposed use of @nestjs/config and @nestjs/terminus, and the decision to keep the example database-free. No example code should change until this proposal is accepted.
