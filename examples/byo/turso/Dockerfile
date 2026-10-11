# Turso's open-source server (libSQL "sqld") as a TDK resource.
# The upstream image listens on 8080 and ignores PORT; TDK assigns the port, so bind sqld to $PORT instead.
FROM ghcr.io/tursodatabase/libsql-server:latest@sha256:6dd3eb276d9d3604e4a48ac4a999a2e267814732d57d7e94c04ba71482333a67
# The image's entrypoint wrapper must start as root (it prepares the data directory and then gosu-drops to sqld), so run
# sqld directly as the sqld user instead. The flags are what the wrapper passes for a primary node.
USER sqld
ENTRYPOINT []
# The image has bash but no curl or wget, so probe the HTTP listener with a bash /dev/tcp connect.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8080}"]
CMD ["sh", "-c", "exec sqld --db-path ${SQLD_DB_PATH:-iku.db} --http-listen-addr 0.0.0.0:${PORT:-8080} --grpc-listen-addr 0.0.0.0:5001"]
