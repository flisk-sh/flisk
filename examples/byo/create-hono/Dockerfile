# A real Hono app from `create-hono` (Bun template): the scaffolder runs at build time.
FROM oven/bun:1@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
WORKDIR /work
RUN bun create hono@latest app --template bun --install --pm bun
WORKDIR /work/app
RUN chown -R bun:bun .
USER bun
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD bash -c "exec 3<>/dev/tcp/127.0.0.1/${PORT:-3000}" || exit 1
# The template exports the app (`export default app`) and Bun serves it, reading PORT itself, so nothing needs patching.
# `bun run dev` is `bun run --hot src/index.ts`.
CMD ["bun", "run", "dev"]
