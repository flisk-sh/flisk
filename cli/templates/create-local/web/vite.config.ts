import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

// A tiny API next to the page, so `npm run dev` gives you both on one port.
// Replace it with your own API when you are ready.
function api(): Plugin {
  return {
    name: "api",
    configureServer(server) {
      server.middlewares.use("/api/hello", (_request, response) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ message: "Hello from your API" }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), api()],
  server: { host: "localhost", port: Number(process.env.PORT ?? 3000) },
});
