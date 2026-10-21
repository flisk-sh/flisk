---
title: Stop hand-writing docker-compose.yml for a five-service app
published: false
tags: docker, typescript, devtools, backend
canonical_url: https://tdk-landscape.github.io/tdk-website/docs/quickstart/
---

<!-- Draft for #1447. Question source: flisk-sh/tdk-cli-core#756 ("move a small docker-compose project to Flisk and ask where you got stuck"). Every command below was run against flisk 1.3.178. -->

"I have a docker-compose.yml with a handful of services. What do I do when I want Flisk to run them, and what happens to my file?"

That is the question behind [issue #756](https://github.com/flisk-sh/tdk-cli-core/issues/756). The short answer: you stop writing the compose file for your app. You write one `service.json` per service, and Flisk generates the local runtime files.

## What you write

Each service gets a `service.json`. This one is from the runnable [one-backend example](https://github.com/flisk-sh/tdk-cli-core/tree/main/examples/one-backend):

```json
{
  "$schema": "https://raw.githubusercontent.com/flisk-sh/tdk-cli-core/main/engine/schemas/service-schema.json",
  "schemaVersion": 1,
  "appName": "api-backend",
  "appType": "backend",
  "stack": "one-backend",
  "port": 4000,
  "healthCheckPath": "/health",
  "dependsOn": []
}
```

To create a project and a few services from scratch, I ran:

```bash
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
flisk resource users-api --type backend --stack shop --yes
flisk resource legacy-api --type bring-your-own --stack shop --yes
```

The `bring-your-own` type is the one for a service that already has a Dockerfile. It writes a `service.json` that points at your code. Those three resources land in `services/shop/`, and `flisk resources --ports` shows them on ports 4000, 4001 and 4002.

## What Flisk generates

Nothing in your service folders is a compose file. The generated files live in `.tdk/.tdk-out/`, and each one starts with a header that says it is generated:

```bash
flisk up shop --dry-run
```

The dry run lists the services it would start, their URLs, and the exact Tilt command. Nothing starts. The `Would run:` line is the answer to "what is it actually doing?", and [the next post](02-local-stack-for-ai-agents.md) and [the third one](03-tilt-without-tiltfile.md) go into it.

Compose still appears, for the stack's infrastructure. In the one-backend example, the only compose file Flisk writes is `services/platform/database-management/docker-compose.yml`, which runs Postgres. Its header reads `SYSTEM-GENERATED - DO NOT EDIT`, and it is regenerated from `.tdk/project.json`.

## Where you got stuck

If your compose project has a `build:` section, the question is usually where the build context goes. Point `build.context` and `build.dockerfile` in the service's `service.json` at your code, and the `bring-your-own` guide walks through the rest. Your existing Dockerfiles stay as they are.

## Try it

The [one-backend example](https://github.com/flisk-sh/tdk-cli-core/tree/main/examples/one-backend) is the smallest runnable version: one service, one generated compose file for Postgres, one command to preview it. Start with the [quickstart](https://tdk-landscape.github.io/tdk-website/docs/quickstart/), then run `flisk up one-backend --dry-run` in the example folder to see what it would start.
