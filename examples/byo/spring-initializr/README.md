# spring-initializr

**Stack:** a real Spring Boot project from the [Spring Initializr](https://start.spring.io) service (Maven, Java, Spring Web
and Actuator, no database)

**Notes:**
- The project is downloaded from `start.spring.io` at build time with `dependencies=web,actuator`, so the Spring Boot and
  Java-plugin versions are whatever the service offers by default. The build needs network access to it.
- Multi-stage build: `maven:3-eclipse-temurin-21` runs `mvn package`, and a `eclipse-temurin:21-jre` image runs the jar.
- Spring binds all interfaces by default. The port comes from `SERVER_PORT`, which the start command sets from Flisk's `PORT`.
- Health path is `/actuator/health` (Actuator, which exposes only `health` by default). Register it with `--health-path`.
- The first image build downloads the Maven dependencies and takes several minutes.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/actuator/health`:

```bash
VERIFY_WAIT_SECONDS=120 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh spring-initializr /actuator/health
```

## Register it in a Flisk project

```bash
flisk resource spring-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /actuator/health --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
