# Add a tool by name: `flisk tool add`

`flisk tool add <tool> [name]` adds a tool to your Flisk project by the name you already know it by: React, PostgreSQL, FastAPI, RAG. You do not need to know Flisk's resource types or framework ids.

```bash
flisk tool add                 # list every tool, grouped
flisk tool add react           # a React website, named web
flisk tool add postgresql      # the project's Postgres database, named db
flisk tool add fastapi orders  # a Python FastAPI service, named orders
flisk tool add rag --dry-run   # show what would be created, write nothing
flisk up                  # start everything
```

Names are forgiving: `Next.js`, `nextjs` and `next` are the same tool, and names of several words work with or without quotes (`flisk tool add spring boot`, `flisk tool add google cloud platform`). A word after the tool is the resource name: `flisk tool add spring boot orders`.

## What happens for each tool

`flisk tool add` keeps no generators of its own. Each tool has one of four outcomes:

| Outcome | What `flisk tool add` does | Exit code |
| --- | --- | --- |
| **adds a resource** | Runs the real `flisk resource` command for it and prints that command first, so you can see and reuse it. | 0, or the command's failure |
| **built in** | Tells you Flisk already does it. Nothing changes. | 0 |
| **manual steps** | Flisk cannot generate it (a licensed product, or a framework with no generator yet). Prints the steps to run it under Flisk as your own container. Nothing changes. | 0 |
| **rejected** | Refuses, says why, and lists local tools that cover the same need. Nothing changes. | 1 |

## The tools

| Group | Tool (`flisk tool add …`) | Outcome | What you get |
| --- | --- | --- | --- |
| Frontend | `react` | adds a resource | `flisk resource web --type frontend --framework react` |
| Frontend | `nextjs` | adds a resource | `flisk resource web --type frontend --framework next` |
| Frontend | `angular` | manual steps | An Angular app in your own Dockerfile, run as a `bring-your-own` resource on port 4200 |
| Frontend | `tailwind` | manual steps | Tailwind CSS added to a frontend you have, through `postcss.config.mjs` |
| Backend | `nodejs` | adds a resource | `flisk resource server --type backend --language node` |
| Backend | `fastapi` | adds a resource | `flisk resource server --type backend --language python` (Python 3.12 + FastAPI) |
| Backend | `spring-boot` (also `java`) | manual steps | A Spring Initializr app in your own Dockerfile, run as a `bring-your-own` resource with `/actuator/health` |
| Data | `postgresql` | adds a resource | The project's shared Postgres: `flisk resource db --type database` |
| Data | `mysql` | adds a resource | `flisk resource mysql --type database --framework mysql` |
| Data | `mongodb` | adds a resource | `flisk resource mongo --type database --framework mongodb` |
| AI | `rag` | adds a resource | A Qdrant vector store: `flisk resource vectors --type database --framework qdrant` |
| AI | `embeddings` | adds a resource | A local model server (Ollama): `flisk resource embeddings --type inference`; pull an embedding model such as `nomic-embed-text` into it |
| AI | `llm-api` | adds a resource | A local OpenAI-compatible API at `/v1` (Ollama): `flisk resource llm --type inference`; no API key |
| DevOps | `docker` | built in | Flisk already runs container stacks on Docker; check it with `flisk doctor` |
| DevOps | `github-actions` | manual steps | A workflow that runs `flisk config verify` on every push |
| Guidewire | `jutro` | manual steps | Your Jutro app (licensed, from Guidewire's private registry) as a `bring-your-own` resource |
| Guidewire | `policycenter` | manual steps | Your licensed PolicyCenter image as a `bring-your-own` resource |
| Cloud | `aws`, `google-cloud`, `azure` | **rejected** | Flisk runs your stack on your own computer and never creates cloud resources |
| Cloud | `kubernetes` | **rejected** | Flisk does not write Kubernetes manifests; keep that in your cluster workflow |

A RAG app is the three AI tools together: `flisk tool add rag`, `flisk tool add embeddings` and `flisk tool add llm-api`.

## Why cloud providers are rejected

Flisk is a local development loop: `flisk up` starts every service on your laptop, and nothing it does reaches a cloud account. Adding AWS or Google Cloud would mean credentials, billing and resources Flisk never touches, so `flisk tool add aws` stops with exit 1 and suggests the local equivalent instead:

```text
❌ flisk tool add does not add Google Cloud. Flisk runs your whole stack on your own computer and never creates cloud resources, so it does not add cloud providers.

💡 Suggestions:
   → Use instead:
   →   flisk tool add postgresql   (a database)
   →   flisk resource files --type storage   (S3-compatible storage, MinIO)
   →   flisk resource jobs --type queue   (a queue, NATS)
   →   flisk export render   (write render.yaml when you deploy; it never calls a cloud API)
```

## Options

| Option | Meaning |
| --- | --- |
| `[name]` | The resource name. Each tool has a default (`web`, `server`, `db`, `vectors`…). If a resource already has that name, `flisk tool add` stops with exit 1 and adds nothing; pass another name: `flisk tool add nextjs site`. |
| `-s, --stack <stack>` | The stack to put the resource in. Left out, the project's only stack is used; with several stacks `flisk tool add` stops and prints one `--stack` command per stack. |
| `--dry-run` | Forwarded to `flisk resource`: shows the resource and files without writing anything. |
| `--json` | Prints one JSON envelope: the tool, its outcome, the command, and the `flisk resource` result. With no tool it lists the catalog. |
| `-y, --yes` | Accepted for scripts; `flisk tool add` already runs `flisk resource` with `--yes`. |

## For coding agents

The `flisk-tool-add` skill tells an agent to use `flisk tool add` whenever the user names a tool, to stop on a rejected tool instead of working around it, and to show manual steps rather than writing Dockerfiles for licensed products. The catalog lives in [`cli/src/utils/tool-catalog.ts`](../cli/src/utils/tool-catalog.ts); a new tool is one entry there and a row in the table above.
