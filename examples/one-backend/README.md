# One backend on your machine

This example is one authored `service.json` and one small Hono service. TDK creates the local orchestration files; Docker builds the service and Tilt runs it with hot reload. No Kubernetes cluster is needed.

## Prerequisites

Install Docker (Desktop, OrbStack, or Colima), Tilt 0.25.0 or newer, Bun 1.2.0 or newer, Node.js 22.12 or newer, and the TDK CLI. Ports 80, 443, and 5432 must be available.

From the repository root:

```bash
cd examples/one-backend
tdk project --yes
bun install --cwd services/one-backend/api
tdk up one-backend
```

The service is routed at `http://api.one-backend.localhost/api/api-backend`. Check it with:

```bash
curl --fail http://api.one-backend.localhost/api/api-backend/health
# {"status":"ok"}
```

Open the Tilt dashboard at `http://localhost:10350`. Stop the local stack with `tdk down`.

The companion [`one-backend-helm`](../one-backend-helm/README.md) example shows handwritten app-template values for an image built from the same source. Publishing that image to a registry reachable by your cluster is part of your existing CI/build workflow; TDK does not publish it for you.
