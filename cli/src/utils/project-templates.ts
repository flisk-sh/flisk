// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export interface ProjectTemplate {
  repo: string;
  description: string;
  bundledPath?: string;
  fixedDir?: string;
}

/** Public starter repositories plus the bundled default product example. */
export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  demo: {
    repo: "https://github.com/flisk-sh/tdk-restaurant-example.git",
    description: "The demo stack: restaurant ops with reservations, kitchen and floor control",
    fixedDir: "flisk-demo",
  },
  restaurant: {
    repo: "https://github.com/flisk-sh/tdk-restaurant-example.git",
    description: "Restaurant ops: reservations, kitchen, floor control (Hono + Vite + Bun)",
  },
  saas: {
    repo: "https://github.com/flisk-sh/tdk-saas-starter.git",
    description:
      "SaaS starter: account dashboard and a working checkout button (Hono + Vite + Bun)",
  },
  erp: {
    repo: "https://github.com/flisk-sh/tdk-erp-system.git",
    description: "Enterprise ERP: 100 microservices across 7 business domains",
  },
  "user-management": {
    repo: "https://github.com/flisk-sh/tdk-user-management.git",
    description: "User/auth management services",
  },
  ecommerce: {
    repo: "https://github.com/flisk-sh/tdk-ecommerce-example.git",
    description: "Vue 3 storefront and Hono catalog API (needs Flisk 1.3.75+ for --framework vue)",
  },
  example: {
    repo: "https://github.com/flisk-sh/tdk-example.git",
    bundledPath: "examples/tdk-example",
    description: "Hono + Postgres + NATS worker + Vite example with a routed write path",
  },
  "agent-stack": {
    repo: "https://github.com/flisk-sh/tdk-agent-stack.git",
    description: "AI agent stack: Bun agent + MCP tool server + Postgres + NATS",
  },
};
