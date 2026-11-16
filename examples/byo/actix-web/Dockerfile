# A minimal Actix Web 4 app (Actix has no project generator, so the app is the files next to this Dockerfile).
FROM rust:1-slim@sha256:cc9edbcadf2c27013a642b1d1bb7504e26b1142d6b5ebe58f64cf2eb2bc128ae AS build
WORKDIR /app
COPY Cargo.toml ./
# Build the dependencies first so source edits do not recompile them.
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM debian:stable-slim@sha256:fbfb4059d2127120aa05b6e6064523d2102552f0cf0026ddf0701c12f1f8f3e0
COPY --from=build /app/target/release/actix-app /usr/local/bin/actix-app
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8080}" || exit 1
CMD ["actix-app"]
