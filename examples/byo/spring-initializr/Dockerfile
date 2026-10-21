# A real Spring Initializr project (Maven, Java, Spring Web + Actuator, no database), downloaded at build time.
FROM maven:3-eclipse-temurin-21@sha256:9b4877723dadf350b452dd97d9a6401e7b56f98fa9dfe420c32ad909989c7e4c AS build
WORKDIR /work
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl unzip >/dev/null \
 && curl -fsSL https://start.spring.io/starter.zip \
      -d type=maven-project -d language=java -d name=app -d artifactId=app -d groupId=dev.tdk \
      -d dependencies=web,actuator -o starter.zip \
 && unzip -q starter.zip && rm starter.zip
RUN mvn -q -B -DskipTests package && ls target/*.jar

FROM eclipse-temurin:21-jre@sha256:cff19e6215689161eb6162c11b86b0c60ddf802164f2eaf48d570f8fb79a36c5
WORKDIR /app
COPY --from=build /work/target/app-*.jar /app/app.jar
# Ubuntu-based Temurin images already have an `ubuntu` user at uid 1000, so use 1001.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid app --no-create-home app
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8080}" || exit 1
# Spring binds all interfaces by default; the port comes from SERVER_PORT, which we set from Flisk's PORT.
CMD ["sh", "-c", "SERVER_PORT=${PORT:-8080} exec java -jar /app/app.jar"]
