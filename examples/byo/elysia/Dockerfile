# A real Elysia app from `bun create elysia`: the scaffolder runs at build time.
FROM oven/bun:1@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895
WORKDIR /work
RUN bun create elysia app
WORKDIR /work/app
# The generated app hard-codes `.listen(3000)`; Flisk assigns the port through PORT. Patch it, and fail the build if the line is not there.
RUN sed -i 's/\.listen(3000)/.listen(Number(process.env.PORT ?? 3000))/' src/index.ts \
 && grep -q 'process.env.PORT' src/index.ts
RUN chown -R bun:bun .
USER bun
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT:-3000}" || exit 1
# `bun run dev` is `bun run --watch src/index.ts`.
CMD ["bun", "run", "dev"]
