# A real Deno Fresh 2 app (Vite, no Tailwind): the scaffolder runs at build time.
FROM denoland/deno:latest@sha256:fa335acdf6b72106eda2cb6a8cb5f4187e7630e357467489db4b2e7352d5e432
ENV DENO_NO_PROMPT=1
WORKDIR /work
RUN deno run -A jsr:@fresh/init app --force --tailwind=false --vscode=false --docker=false </dev/null
WORKDIR /work/app
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app
RUN chown -R app:app /work/app
USER app
# Fresh 2's dev server is Vite: listen beyond loopback (--host) and on the port TDK assigns.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD sh -c 'deno eval --allow-net=127.0.0.1 "const r = await fetch(\"http://127.0.0.1:${PORT:-5173}\"); Deno.exit(r.ok ? 0 : 1)"'
CMD ["sh", "-c", "deno task dev --host 0.0.0.0 --port ${PORT:-5173}"]
