# A real Quarkus project from the Quarkus generator (code.quarkus.io: Maven, REST + SmallRye Health, no database),
# downloaded at build time.
FROM maven:3-eclipse-temurin-21@sha256:9b4877723dadf350b452dd97d9a6401e7b56f98fa9dfe420c32ad909989c7e4c AS build
WORKDIR /work
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl unzip >/dev/null \
 && curl -fsSL "https://code.quarkus.io/d?g=dev.tdk&a=app&b=MAVEN&e=rest&e=smallrye-health&nc=true" -o starter.zip \
 && unzip -q starter.zip && rm starter.zip && ls
WORKDIR /work/app
RUN mvn -q -B -DskipTests package && ls target/quarkus-app

FROM eclipse-temurin:21-jre@sha256:cff19e6215689161eb6162c11b86b0c60ddf802164f2eaf48d570f8fb79a36c5
WORKDIR /app
COPY --from=build /work/app/target/quarkus-app/ /app/
# Ubuntu-based Temurin images already have an `ubuntu` user at uid 1000, so use 1001.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid app --no-create-home app
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8080}" || exit 1
# Quarkus listens on 0.0.0.0 by default in a packaged jar; the port comes from QUARKUS_HTTP_PORT, set from Flisk's PORT.
CMD ["sh", "-c", "QUARKUS_HTTP_PORT=${PORT:-8080} exec java -jar /app/quarkus-run.jar"]
