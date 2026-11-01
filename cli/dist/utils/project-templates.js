/** Public starter repositories plus the bundled default product example. */
export const PROJECT_TEMPLATES = {
    demo: {
        repo: "https://github.com/flisk-sh/flisk-restaurant-example.git",
        description: "The demo stack: restaurant ops with reservations, kitchen and floor control",
        fixedDir: "flisk-demo",
    },
    restaurant: {
        repo: "https://github.com/flisk-sh/flisk-restaurant-example.git",
        description: "Restaurant ops: reservations, kitchen, floor control (Hono + Vite + Bun)",
    },
    saas: {
        repo: "https://github.com/flisk-sh/flisk-saas-starter.git",
        description: "SaaS starter: account dashboard and a working checkout button (Hono + Vite + Bun)",
    },
    erp: {
        repo: "https://github.com/flisk-sh/flisk-erp-system.git",
        description: "Enterprise ERP: 100 microservices across 7 business domains",
    },
    "user-management": {
        repo: "https://github.com/flisk-sh/flisk-user-management.git",
        description: "User/auth management services",
    },
    ecommerce: {
        repo: "https://github.com/flisk-sh/flisk-ecommerce-example.git",
        description: "Vue 3 storefront and Hono catalog API (needs Flisk 1.3.75+ for --framework vue)",
    },
    example: {
        repo: "https://github.com/flisk-sh/flisk-example.git",
        bundledPath: "examples/flisk-example",
        description: "Hono + Postgres + NATS worker + Vite example with a routed write path",
    },
    "agent-stack": {
        repo: "https://github.com/flisk-sh/flisk-agent-stack.git",
        description: "AI agent stack: Bun agent + MCP tool server + Postgres + NATS",
    },
    swarm: {
        repo: "https://github.com/flisk-sh/flisk.git",
        generated: "swarm",
        description: "Multi-agent swarm: a coordinator splits a goal, three workers pull and finish subtasks (local processes, no Docker)",
    },
    security: {
        repo: "https://github.com/flisk-sh/flisk.git",
        generated: "security",
        description: "Security agents: a scanner, a triage agent and a reporter in a line (local processes, no Docker)",
    },
    "super-agent": {
        repo: "https://github.com/flisk-sh/flisk.git",
        generated: "super-agent",
        description: "Super agent: a planner, an MCP tool server and researcher, writer and checker sub-agents; plans with Claude when ANTHROPIC_API_KEY is set (local processes, no Docker)",
    },
    langgraph: {
        repo: "https://github.com/flisk-sh/flisk.git",
        generated: "langgraph",
        description: "LangGraph agent: a StateGraph (plan, research, write, check) with durable checkpoints and retries, and an MCP tool server (local processes, no Docker)",
    },
    launch: {
        repo: "https://github.com/flisk-sh/flisk-template-launch.git",
        ref: "f97e03a11d026715573a610a8370c3c7546c5af8",
        description: "Launch-ready web tool: one Bun + Hono service with SEO, icons, a JSON API and an /mcp endpoint; no database",
    },
    portal: {
        repo: "https://github.com/flisk-sh/flisk-template-portal.git",
        ref: "0d57988acca78ff6649d861edcc683ece2afff22",
        description: "API portal and model gateway: GitHub sign-in, API keys, usage and a metered OpenAI-style /v1 proxy (one Bun service)",
    },
    // Not "stack": that is a command name, and `flisk <template>` is the one-command flow.
    fullstack: {
        repo: "https://github.com/flisk-sh/flisk-stack.git",
        ref: "fff53f3c77d0daea1f34498c70fe48a9e372b682",
        description: "Full-stack app skeleton: Hono API, Postgres job worker, Prisma migrator and Vue 3 web app",
    },
};
/** The template catalog in registration order: key, repo, description and, for a pinned template, its ref. */
export function listProjectTemplates() {
    return Object.entries(PROJECT_TEMPLATES).map(([key, template]) => ({
        key,
        repo: template.repo,
        description: template.description,
        ...(template.ref ? { ref: template.ref } : {}),
    }));
}
/**
 * The git invocations that fetch a repository template into `destination`: a clone and, for a pinned template, a
 * detached checkout of its exact commit.
 */
export function templateGitCommands(template, destination) {
    const commands = [["clone", template.repo, destination]];
    if (template.ref) {
        commands.push(["-C", destination, "checkout", "--quiet", "--detach", template.ref]);
    }
    return commands;
}
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
