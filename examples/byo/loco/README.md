# loco

**Stack:** a real `loco new` app (Rust, no database, async background workers, no assets)

**Notes:** `loco new --db none --bg async --assets none` runs at build time; multi-stage build, so the final image holds
only the release binary and `config/`. The generated `config/development.yaml` reads `PORT` and `BINDING`, so the image
sets `BINDING=0.0.0.0`. Health path `/_ping` is built into Loco. The first build compiles the whole dependency tree and
takes several minutes.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/_ping`:

```bash
VERIFY_WAIT_SECONDS=30 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh loco /_ping
```

## Register it in a TDK project

```bash
tdk resource loco-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /_ping --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
