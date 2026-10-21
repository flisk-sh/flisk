# quarkus

**Stack:** a real Quarkus project from the Quarkus generator ([code.quarkus.io](https://code.quarkus.io); Maven, Java, REST and
SmallRye Health, no database)

**Notes:**
- The project is downloaded from `code.quarkus.io` at build time (`e=rest`, `e=smallrye-health`, `nc=true` for no starter code), so
  the Quarkus version is whatever the service offers by default and the build needs network access to it.
- Multi-stage build: `maven:3-eclipse-temurin-21` runs `mvn package`, and an `eclipse-temurin:21-jre` image runs the fast-jar layout
  (`quarkus-run.jar`). It is the JVM build, not a GraalVM native image.
- A packaged Quarkus jar listens on all interfaces by default; the port comes from `QUARKUS_HTTP_PORT`, which the start command sets
  from Flisk's `PORT`.
- Health path is `/q/health` (SmallRye Health). Register it with `--health-path /q/health`.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; Quarkus accepted it with no host configuration (checked through a
  real `flisk up`).
- The first image build downloads the Maven dependencies and takes several minutes.
- For the other JVM example see [spring-initializr](../spring-initializr/README.md).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/q/health`:

```bash
VERIFY_WAIT_SECONDS=120 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh quarkus /q/health
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh quarkus /q/health
```

## Register it in a Flisk project

```bash
flisk resource quarkus-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /q/health --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
