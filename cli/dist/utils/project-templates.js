/** Public starter repositories plus the bundled default product example. */
export const PROJECT_TEMPLATES = {
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
        description: "SaaS starter: account dashboard and a working checkout button (Hono + Vite + Bun)",
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
/**
 * The template of the one-command flow (`flisk demo`), read from the raw arguments.
 *
 * Only the first argument can name a template. A command that takes a template of its
 * own — `flisk project demo` clones a starter and configures it, `flisk up demo` is not a
 * command at all — is that command, not the one-command flow. Looking further down the
 * arguments hijacked every command that mentioned a template name anywhere.
 */
export function bareTemplateArg(args) {
    const first = args[2];
    if (!first || first.startsWith("-"))
        return undefined;
    return first in PROJECT_TEMPLATES ? first : undefined;
}
