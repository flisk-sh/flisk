# Qdrant MCP server: long-term agent memory, one collection per customer

`flisk tool add rag` gives you a Qdrant vector store. This recipe puts the Qdrant MCP server in front of it, so an agent
stores and finds facts through two MCP tools, `qdrant-store` and `qdrant-find`, and keeps each customer's memory in a
collection of its own.

Versions that were run: `qdrant/mcp-server-qdrant` 0.8.1 (from PyPI), `qdrant/qdrant:v1.12.5` (the image `flisk tool add rag`
uses), the default embedding model `sentence-transformers/all-MiniLM-L6-v2`.

## What it does

- `qdrant-store` takes `information` (text) and optional `metadata`, and saves it as one point.
- `qdrant-find` takes a `query` and returns the closest stored entries.
- The server embeds on the way in and on the way out, so the agent never handles vectors.

## 1. Add Qdrant, then the MCP server

```bash
flisk tool add rag                    # a Qdrant resource named vectors
git clone --depth 1 --branch v0.8.1 https://github.com/qdrant/mcp-server-qdrant qdrant-mcp-src
docker build -t qdrant-mcp:0.8.1 qdrant-mcp-src
flisk resource qdrant-mcp-acme --type bring-your-own --image qdrant-mcp:0.8.1 --port 4310 --yes
```

There is no published image for the server, so you build the one in its repository. The image runs `uvx mcp-server-qdrant`,
which installs the package when the container starts.

Then edit `services/<stack>/qdrant-mcp-acme/service.json`:

```json
{
  "healthCheck": { "port": 4310, "startPeriod": 300 },
  "env": {
    "FASTMCP_SERVER_HOST": "0.0.0.0",
    "FASTMCP_SERVER_PORT": "4310",
    "QDRANT_URL": "http://vectors:6333",
    "COLLECTION_NAME": "customer-acme"
  }
}
```

- `FASTMCP_SERVER_HOST` and `FASTMCP_SERVER_PORT` are the names version 0.8.1 reads. Its README says `FASTMCP_HOST`, but with
  that name the server still bound `127.0.0.1` and nothing outside the container could reach it.
- The port must be in Flisk's bring-your-own range (4000 to 5999), and the server must listen on it, hence `FASTMCP_SERVER_PORT`.
- `healthCheck.port` is a TCP check. The server's `/sse` route is a stream that never ends, so an HTTP health path does not fit.
- `startPeriod` is long because `uvx` downloads the package and its dependencies on every container start. The first start
  took a couple of minutes here.
- `QDRANT_URL` uses the resource name from step one, which is how services reach each other inside the stack.

Start the stack so the server runs:

```bash
flisk up
```

The server speaks MCP over server-sent events at `/sse` (the image's default transport).

## 2. One collection per customer

In 0.8.1 the two tools take no collection argument: the collection is fixed for the server by `COLLECTION_NAME`. So the
pattern is one server per customer, all pointing at the same Qdrant:

- `qdrant-mcp-acme` with `COLLECTION_NAME=customer-acme`
- `qdrant-mcp-globex` with `COLLECTION_NAME=customer-globex`

Your agent picks the server URL from the customer it is working for (the session or tenant id it already has). A server for
one customer cannot read another customer's collection, because it never names it.

## What was run

On Docker, with a Qdrant container and two server containers on one network, through the MCP SDK client over SSE:

- `tools/list` returned `qdrant-find` and `qdrant-store`.
- Storing "Acme prefers invoices in EUR and pays on the 15th." through the acme server, then asking "which currency does the
  customer pay in?", returned that entry.
- Storing "Globex pays in USD." through the globex server, then asking "which currency" on each server, returned the Acme
  entry from the acme server and the Globex entry from the globex server, and nothing across.
- Calling a tool with a `collection_name` argument failed validation, which is why the collection is set per server.

The `flisk resource` command above produced a resource that `flisk config verify --json` accepted, with the `healthCheck` and
`env` edits in place.

## What was not run

- `flisk up` for the stack. The Docker runtime needs WSL2 on Windows, which this machine does not have, so the service.json
  settings above are checked against the schema and against the container, not through a real `flisk up`.
- A model other than the default `EMBEDDING_MODEL`.

## Limits

- One server per customer is fine for a handful of customers. For thousands, write a small MCP server of your own that stores
  a `tenant_id` payload and filters on it (keyed from the `x-session-id` header), instead of one container each.
- The embedding model is fetched from Hugging Face inside the container, so the first call needs network access.
