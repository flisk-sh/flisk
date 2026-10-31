import { matchStarter } from "./starters.js";

// Composes a demo stack from whatever Grok sends: the thread text (`q`) and an
// optional list of parts. Words pick parts from a fixed menu; code renders the
// service.json files, so the output can't contain invented appTypes or fields.
// A model can later choose the parts instead of the keyword match; the menu and
// the rendering stay the same.

const PARTS = {
  chain: ["solidity", "contract", "contracts", "evm", "foundry", "anvil", "hardhat", "onchain", "web3", "dapp", "nft", "defi", "token", "mint"],
  indexer: ["indexer", "index", "events", "subgraph"],
  db: ["db", "database", "postgres", "postgresql", "sql", "prisma", "users", "orders", "catalog", "profiles", "analytics", "crud", "inventory", "seed", "seeds", "seeded"],
  jobs: ["worker", "workers", "jobs", "queue", "background", "email", "emails", "notifications", "webhooks", "retries", "cron", "nats", "snapshot", "snapshots"],
  cache: ["redis", "cache", "caching"],
  realtime: ["websocket", "websockets", "realtime", "chat"],
  agent: ["agent", "agents", "llm", "ai", "assistant", "rag", "chatgpt", "gpt", "chatbot", "openai"],
  mcp: ["mcp"],
  commerce: ["shop", "store", "storefront", "ecommerce", "commerce", "checkout", "cart", "b2b", "headless"],
  admin: ["admin", "backoffice"],
};
// Several APIs: "3 apis", "two apis". At most three, so one demo cannot take a whole runner.
export const MAX_APIS = 3;
const NUMBER_WORDS = { one: 1, two: 2, three: 3 };
export function countApis(w) {
  const i = w.findIndex((x) => x === "api" || x === "apis");
  if (i < 0) return 1;
  const before = w[i - 1];
  const n = /^\d+$/.test(before ?? "") ? Number(before) : NUMBER_WORDS[before] ?? 1;
  return Math.min(MAX_APIS, Math.max(1, n));
}
const FRONTENDS = ["react", "vue", "svelte", "solid", "preact", "lit", "qwik"];
const LANGUAGES = { python: ["python", "fastapi", "django", "flask"], go: ["golang"] };

// Platforms with a hand-built, working integration. Any other named platform
// becomes an integration request: that wiring took days for Thor and is not
// generated.
export const INTEGRATIONS = {
  thor: {
    name: "Thor Commerce",
    repo: "https://github.com/flisk-sh/flisk-thor-storefront",
    stack: "store",
    frontend: "vue",
    env: [
      "THOR_STOREFRONT_URL=https://api.thorcommerce.io/<org>/storefront/graphql",
      "THOR_ADMIN_URL=https://api.thorcommerce.io/<org>/admin/graphql",
      "THOR_ACCESS_TOKEN=",
      "THOR_CHANNEL=",
      "THOR_MARKET=",
      "THOR_CURRENCY=",
    ],
  },
};

const NOT_VENDORS = new Set([
  "shop",
  "store",
  "the", "a", "an", "our", "my", "your", "their", "its", "this", "that", "same", "own", "rest", "graphql", "public",
  "admin", "storefront", "an", "any", "some", "new", "existing", "external", "third", "party", "backend", "web", "it",
]);

const words = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function findVendor(text) {
  const patterns = [
    /\b([\w.-]{2,30})(?:'s)?\s+(?:graphql\s+|rest\s+|storefront\s+|admin\s+)?api\b/gi,
    /\b(?:connected to|connect(?:s|ing)? to|(?:integrate[sd]?|integrating) with|wired to|hooked up to|on top of)\s+([\w.-]{2,30})/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const name = m[1].replace(/'s$/i, "");
      if (!NOT_VENDORS.has(name.toLowerCase())) return name;
    }
  }
  const w = words(text);
  return Object.keys(INTEGRATIONS).find((k) => w.includes(k)) ?? null;
}

export function detect(text) {
  const w = words(text);
  const hits = {};
  for (const [part, keys] of Object.entries(PARTS)) {
    const found = keys.filter((k) => w.includes(k));
    if (found.length) hits[part] = found;
  }
  const frontend = FRONTENDS.find((f) => w.includes(f)) ?? null;
  const language = Object.keys(LANGUAGES).find((l) => LANGUAGES[l].some((k) => w.includes(k))) ?? null;
  const nextjs = w.includes("nextjs") || w.includes("next.js") || (w.includes("next") && w.includes("js"));
  return { hits, frontend, language, vendor: findVendor(text), nextjs, apis: countApis(w) };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

export function buildPlan({ user, q = "", parts = "", stack: wanted }) {
  const d = detect(`${q} ${parts}`);
  const has = (p) => Boolean(d.hits[p]);
  const vendorKey = d.vendor && slug(d.vendor);
  const known = vendorKey ? INTEGRATIONS[vendorKey] : null;

  const chain = has("chain");
  const language = d.language;
  const bun = !language;
  // The Flisk Board keeps its items in Postgres, so every Bun api gets a database.
  const db = has("db") || has("indexer") || chain || has("jobs") || bun;
  const migrator = db && bun;
  const frontend = d.frontend ?? known?.frontend ?? "react";
  const stack =
    (wanted && /^[a-z][a-z0-9-]{1,19}$/.test(wanted) && wanted) ||
    known?.stack ||
    (chain ? "dapp" : has("commerce") || d.vendor ? "store" : has("agent") || has("mcp") ? "agents" : "app");

  const services = [];
  const add = (s) => services.push(s);
  let next = 4000;
  const port = () => (next += 100) - 100;
  const dir = (name) => `services/${stack}/${name}`;

  add({ name: "web", appType: "frontend", port: 3000, framework: frontend, dependsOn: ["api"], note: `${frontend} app` });
  add({
    name: "api",
    appType: "backend",
    port: port(),
    ...(language && { language }),
    featuresEnabled: [db && bun && "prisma", has("cache") && "redis", has("realtime") && "websocket"].filter(Boolean),
    healthCheckPath: "/health",
    ...(migrator && { dependsOn: ["api-migrator"] }),
    note: d.vendor
      ? `backend-for-frontend: the only service holding ${known?.name ?? d.vendor} keys`
      : `${language ?? "bun + hono"} API`,
  });
  // `flisk resource api --feature prisma` scaffolds this one alongside the api.
  // Extra APIs share the database and the migrator; each is its own service with its own service.json and route.
  for (let i = 2; i <= d.apis; i += 1) {
    add({ name: `api-${i}`, appType: "backend", port: port(), ...(language && { language }), healthCheckPath: "/health", ...(migrator && { dependsOn: ["api-migrator"] }), note: `API ${i} of ${d.apis}, ${language ?? "Bun + Hono"}` });
  }
  if (migrator) add({ name: "api-migrator", appType: "migrator", scaffoldedBy: "api", dependsOn: undefined, note: "runs Prisma migrations against the shared Postgres before the api starts" });
  // An admin panel is a second frontend on the same api: its own service, the same framework as the web app.
  if (has("admin")) add({ name: "admin", appType: "frontend", port: 3100, framework: frontend, dependsOn: ["api"], note: `admin panel (${frontend})` });
  if (has("jobs")) {
    add({ name: "jobs", appType: "worker", port: port(), featuresEnabled: ["nats"], ...(migrator && { dependsOn: ["api-migrator"] }), note: `background work: ${d.hits.jobs.join(", ")}` });
  }
  if (chain) {
    const chainPort = port();
    add({
      name: "chain",
      appType: "bring-your-own",
      port: chainPort,
      image: "ghcr.io/foundry-rs/foundry:stable",
      experimental: true,
      note: `local Anvil node for your contracts. Not yet run end to end with flisk up: start anvil with --port ${chainPort} so it listens on the port Flisk routes to`,
    });
    add({ name: "indexer", appType: "worker", port: port(), featuresEnabled: ["nats"], params: { RPC_URL: `http://chain:${chainPort}` }, dependsOn: ["chain", ...(migrator ? ["api-migrator"] : [])], note: "reads contract events into Postgres" });
  }
  if (has("mcp")) add({ name: "tools", appType: "mcp", port: port(), note: "MCP server over Streamable HTTP at /mcp" });
  if (has("agent")) {
    const assistantPort = port();
    add({ name: "assistant", appType: "agent", port: assistantPort, ...(has("mcp") && { dependsOn: ["tools"] }), note: "/health, /ready, x-session-id routing, checkpoints survive restarts" });
    // The chat api forwards messages to the assistant over the stack's Docker network, by service name (as the indexer reaches chain).
    services.find((s) => s.name === "api").params = { ASSISTANT_URL: `http://assistant:${assistantPort}` };
  }

  for (const s of services) {
    s.file = `${dir(s.name)}/service.json`;
    s.manifest = renderManifest(s, stack);
  }

  const notes = [];
  if (db && !bun) notes.push(`No Prisma migrator for a ${language} api: run your migrations as a one-shot bring-your-own job (flisk docs: byo.md#one-shot-jobs-migrations-seeders).`);
  // Next.js frontends land with the next flisk release (flisk-sh/flisk#2289); until then the demo uses React.
  if (d.nextjs && d.frontend === null) notes.push("Next.js support is coming in the next flisk release, so this demo uses React for now.");
  else if (d.frontend === null) notes.push("No frontend framework named, so this uses React. Say vue, svelte or solid to switch.");

  const env = known?.env ?? (d.vendor ? [`${slug(d.vendor).toUpperCase().replace(/-/g, "_")}_API_URL=`, `${slug(d.vendor).toUpperCase().replace(/-/g, "_")}_API_KEY=`] : []);

  return {
    user,
    stack,
    // A starter only for a plain Bun stack: integrations, chains and other languages stay generated.
    starter: d.vendor || chain || language ? null : matchStarter(`${q} ${parts}`),
    detected: d.hits,
    summary: services.map((s) => s.name).join(" · "),
    integration: d.vendor
      ? known
        ? { vendor: known.name, status: "ready", repo: known.repo }
        : { vendor: d.vendor, status: "requested" }
      : null,
    env,
    notes,
    services,
    commands: known
      ? ["npm install -g @flisk-sh/flisk", `git clone ${known.repo}.git`, `cd ${known.repo.split("/").pop()}`, "cp .env.example .env   # add your keys", "flisk doctor", `flisk up ${stack}`, "flisk status"]
      : [
          "npm install -g @flisk-sh/flisk",
          "flisk doctor",
          "flisk project --yes",
          ...services.filter((s) => !s.scaffoldedBy).map((s) => resourceCommand(s, stack)),
          `flisk up ${stack}`,
          "flisk status",
        ],
  };
}

function renderManifest(s, stack) {
  const m = {
    $schema: "https://flisk.sh/schema.service.json",
    schemaVersion: 1,
    appName: s.name,
    appType: s.appType,
    stack,
  };
  for (const key of ["port", "framework", "language", "image", "healthCheckPath", "params", "dependsOn"]) {
    if (s[key] !== undefined) m[key] = s[key];
  }
  if (s.featuresEnabled?.length) m.featuresEnabled = s.featuresEnabled;
  return m;
}

// Argument list for `flisk resource`; shared by the page and the CI scaffold.
export function resourceArgs(s, stack) {
  const args = ["resource", s.name, "--type", s.appType, "--stack", stack];
  if (s.framework) args.push("--framework", s.framework);
  if (s.language) args.push("--language", s.language);
  if (s.image) args.push("--image", s.image);
  if (s.featuresEnabled?.length) args.push("--feature", ...s.featuresEnabled);
  return [...args, "--yes"];
}

function resourceCommand(s, stack) {
  return `flisk ${resourceArgs(s, stack).join(" ")}`;
}

// One line for Grok to copy under the link: frontends -> backends -> postgres, then the other parts.
export function diagramLine(plan) {
  const names = (pred) => plan.services.filter(pred).map((s) => s.name);
  const front = names((s) => s.appType === "frontend");
  const back = names((s) => s.appType === "backend");
  const rest = names((s) => !["frontend", "backend", "migrator"].includes(s.appType));
  const chain = [front.join(", "), back.join(", "), plan.services.some((s) => s.appType === "backend") ? "postgres" : ""].filter(Boolean);
  return `${chain.join(" -> ")}${rest.length ? ` + ${rest.join(", ")}` : ""}`;
}
