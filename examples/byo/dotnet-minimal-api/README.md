# dotnet-minimal-api

**Stack:** a real `dotnet new web` project (ASP.NET Core minimal API, .NET 9)

**Notes:**
- The template is generated at build time, then `dotnet publish -c Release`. Multi-stage build: the `dotnet/sdk:9.0` image
  builds, the `dotnet/aspnet:9.0` image runs.
- Kestrel is told to listen on `0.0.0.0` and on Flisk's `PORT` through `ASPNETCORE_URLS`.
- The template's `/` route returns `Hello World!` and is the health route. Register it with `--health-path /`.
- The SDK and runtime images are pinned to .NET 9; the template contents are whatever that SDK generates.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=60 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh dotnet-minimal-api /
```

## Register it in a Flisk project

```bash
flisk resource dotnet-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
