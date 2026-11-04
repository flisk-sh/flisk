# A minimal Echo v4 app (Echo has no project generator, so the app is the two files next to this Dockerfile).
FROM golang:1.26-alpine@sha256:27f2d3b83cfc5803c8078f8e730af0f7c431bf067afaec8f60a36fb763187cba AS build
WORKDIR /src
COPY go.mod main.go ./
# `go mod tidy` resolves Echo and writes go.sum at build time, so no go.sum is committed.
RUN go mod tidy && CGO_ENABLED=0 go build -o /out/app .

FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
COPY --from=build /out/app /app
RUN addgroup -g 1000 -S app && adduser -u 1000 -S -G app app
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
CMD ["/app"]
