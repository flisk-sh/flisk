// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { FliskError } from "../utils/errors.js";
import type { FrontendFrameworkProvider } from "./types.js";

/**
 * A plain Vite config for a frontend that runs on the host (`flisk resource --local`).
 *
 * The engine writes the full config under `flisk up` (runtime/engine/.../vite/frameworks/*.star), and that needs Tilt, so a
 * scaffold made for the host carries this small one instead: the framework's own plugins (from the provider's `vite` setup),
 * one port, and an optional proxy to the backend so the page can call it without CORS.
 */
export function renderLocalViteConfig(
  provider: FrontendFrameworkProvider,
  options: { port: number; proxyTarget?: string },
): string {
  if (!provider.vite) {
    throw new FliskError(
      `The ${provider.id} frontend has no Vite setup, so it cannot be written for the host.`,
      ["Scaffold it without --local to use the Docker and Tilt route."],
    );
  }
  const imports = ["import { defineConfig } from 'vite';", ...provider.vite.imports];
  const proxy = options.proxyTarget
    ? `\n    proxy: {\n      '/health': { target: '${options.proxyTarget}', changeOrigin: true },\n      '/api': { target: '${options.proxyTarget}', changeOrigin: true },\n    },`
    : "";
  return `${imports.join("\n")}

// Written by \`flisk resource --local\`: a plain Vite config, so \`npm run dev\` needs no Docker, Tilt or generated files.
export default defineConfig({
  plugins: [${provider.vite.plugins.join(", ")}],
  server: {
    host: 'localhost',
    port: Number(process.env.PORT ?? ${options.port}),
    // Flisk checks and opens this exact port: if it is taken, fail instead of moving to the next one.
    strictPort: true,${proxy}
  },
});
`;
}

/** The scripts of a host-run Vite frontend: no `--config` into the engine's output, and no pre-scripts that wait for it. */
export const LOCAL_VITE_SCRIPTS = {
  dev: "vite",
  build: "tsc && vite build",
  preview: "vite preview",
} as const;

/** The programs a frontend scaffolded with `--local` needs on the host to install and start. */
export const LOCAL_FRONTEND_REQUIRES: readonly string[] = ["node", "npm"];
