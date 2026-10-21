# micronaut

**Stack:** a real Micronaut project from [Micronaut Launch](https://launch.micronaut.io) (Maven, Java 25, Management feature, no
database)

**Notes:**
- The project is downloaded from `launch.micronaut.io` at build time (`features=management`), so the Micronaut version is whatever
  the service offers by default and the build needs network access to it.
- **Java 25 is required, to build and to run.** The current Micronaut libraries and Maven plugin are compiled for Java 25 (class file
  version 69). A Java 21 JDK stopped the build with `TypeNotPresentException: TestResourcesLifecycleExtension` (caused by
  `UnsupportedClassVersionError`), and a Java 21 JRE failed at start with `UnsupportedClassVersionError` on
  `io.micronaut.runtime.Micronaut`. When this was written the generator offered only `JDK_25`.
- The build uses the project's own Maven wrapper (`./mvnw`) on `eclipse-temurin:25-jdk`; the jar runs on `eclipse-temurin:25-jre`.
- Micronaut's Netty server listens on all interfaces; the port comes from `MICRONAUT_SERVER_PORT`, which the start command sets from
  Flisk's `PORT`.
- Health path is `/health` (the Management endpoint answers `{"status":"UP"}`). The generated app has no route on `/`.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; Micronaut accepted it with no host configuration (checked through a
  real `flisk up`).
- For the other JVM examples see [spring-initializr](../spring-initializr/README.md) and [quarkus](../quarkus/README.md).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
VERIFY_WAIT_SECONDS=120 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh micronaut /health
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh micronaut /health
```

## Register it in a Flisk project

```bash
flisk resource micronaut-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /health --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
