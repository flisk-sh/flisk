// "Flisk App Builder" as an MCP server for the Claude directory: say what app you want, get a plain-words plan and
// the exact commands to build and run it on your own computer. Read-only, no key, no storage, no model: the plan
// comes from the same planner as the demos (plan.js), so nothing is invented. MCP over HTTP, JSON-RPC 2.0, one POST per
// message, no sessions. Source of truth: the flisk repo (workers/app-builder-mcp).
import { buildPlan } from "./plan.js";
import { STARTERS } from "./starters.js";

const PROTOCOL = "2025-03-26";
const CLI = "npx @flisk-sh/flisk";

const KINDS = {
  restaurant: "Restaurant booking and kitchen",
  saas: "Dashboard with billing",
  store: "Online shop",
  crud: "People list (create, edit, delete)",
  auth: "Login and reports",
};

const PART_WORDS = {
  frontend: "the website people see",
  backend: "the server behind it",
  worker: "does background jobs",
  migrator: "sets up the database",
  agent: "an AI helper",
  mcp: "tools for an AI helper",
  "bring-your-own": "a ready-made service such as a database",
};

export const TOOLS = [
  {
    name: "plan_app",
    description:
      "Plan an app from a plain description (an online shop, a website with login, a booking app, an AI helper). Returns what the app is made of in everyday words and the exact commands to build and run it on the user's own computer. Needs Docker Desktop. Nothing is created or sent anywhere.",
    inputSchema: {
      type: "object",
      properties: {
        what: { type: "string", minLength: 3, maxLength: 600, description: "What the app should do, in plain words, for example: an online shop with login and a worker" },
      },
      required: ["what"],
    },
    annotations: { title: "Plan my app", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_app_starters",
    description: "List the ready-made starter apps (online shop, restaurant booking, dashboard with billing, people list, login and reports) and the words that pick each one.",
    inputSchema: { type: "object", properties: {} },
    annotations: { title: "List starter apps", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

export const PROMPTS = [
  {
    name: "build_my_app",
    title: "Build my app",
    description: "Plan an app from what the user wants, then give the commands to run it on their own computer.",
    arguments: [{ name: "what", description: "What the app should do, in plain words", required: true }],
  },
  {
    name: "pick_a_starter",
    title: "Pick a ready-made starter",
    description: "Show the ready-made starter apps and help the user choose one.",
    arguments: [],
  },
];

const promptMessage = (text) => ({ role: "user", content: { type: "text", text } });

function getPrompt(name, args) {
  if (name === "build_my_app") {
    const what = typeof args?.what === "string" ? args.what.trim() : "";
    if (what.length < 3 || what.length > 600) return null;
    return {
      description: "Plan an app and run it on your own computer.",
      messages: [promptMessage(`Plan this app with the plan_app tool, using this description: "${what}". Show what it is made of, then the commands to run it on my computer. Nothing is created or sent.`)],
    };
  }
  if (name === "pick_a_starter") {
    return {
      description: "Choose a ready-made starter app.",
      messages: [promptMessage("Call list_app_starters, show the ready-made apps, and help me choose the one closest to what I want to build.")],
    };
  }
  return null;
}

const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const reply = (value, isError = false) => ({ isError, content: [{ type: "text", text: JSON.stringify(value) }] });
const npx = (cmd) => cmd.replace(/^flisk /, `${CLI} `);

function planApp(args) {
  const what = typeof args?.what === "string" ? args.what.trim() : "";
  if (what.length < 3 || what.length > 600) return reply({ error: "bad_input", hint: "Say what the app should do, in 3 to 600 characters." }, true);
  const plan = buildPlan({ user: "you", q: what });
  const parts = plan.services.map((s) => ({ name: s.name, is: PART_WORDS[s.appType] ?? s.appType, detail: s.note }));
  const starter = plan.starter;
  const steps = plan.commands.filter((c) => !c.startsWith("npm install")).map(npx);
  return reply({
    you_get: parts.map((p) => `${p.name}: ${p.is}`).join("; "),
    parts,
    start_here: `${CLI} demo`,
    needs: "Docker Desktop, and Node.js for npx",
    steps,
    // flisk resource has no flag for these, so they are edits to each service.json after the commands above.
    then_edit: plan.services
      .filter((s) => (s.params && !s.scaffoldedBy) || (s.dependsOn?.length && !s.scaffoldedBy))
      .map((s) => ({ file: `services/${plan.stack}/${s.name}/service.json`, ...(s.dependsOn?.length && { dependsOn: s.dependsOn }), ...(s.params && { params: s.params }) })),
    ...(plan.integration ? { integration: plan.integration } : {}),
    ...(plan.env?.length ? { env: plan.env } : {}),
    ...(starter ? { or_start_from_a_ready_made_app: { kind: KINDS[starter] ?? starter, repo: `https://github.com/${STARTERS[starter].repo}` } } : {}),
    notes: plan.notes,
    runs_on: "your own computer; nothing is hosted for you",
  });
}

function listStarters() {
  return reply({
    starters: Object.entries(STARTERS).map(([key, s]) => ({
      kind: KINDS[key] ?? key,
      say_something_like: s.words.slice(0, 4),
      repo: `https://github.com/${s.repo}`,
      parts: s.services.map((x) => x.name),
    })),
    start_here: `${CLI} demo`,
  });
}

export async function appBuilderMcpRoute(request, json) {
  const cors = { "access-control-allow-origin": "*" };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, mcp-protocol-version" } });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed", hint: "POST JSON-RPC 2.0 messages to /mcp" }, 405, { allow: "POST, OPTIONS" });
  let msg;
  try {
    msg = await request.json();
  } catch {
    return json(fail(null, -32700, "Parse error"), 400);
  }
  const scalarId = (v) => v === undefined || v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
  if (Array.isArray(msg) || !msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string" || !scalarId(msg.id)) return json(fail(scalarId(msg?.id) ? msg?.id : null, -32600, "Invalid Request"), 400);
  const { id, method, params } = msg;
  if (id === undefined) return new Response(null, { status: 202, headers: cors });
  if (method === "initialize") {
    return json(
      rpc(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "flisk-app-builder", version: "1.0.0" },
        instructions: "plan_app turns a plain description of an app into the parts it needs and the commands to run it on the user's own computer. list_app_starters shows ready-made apps. Prompts build_my_app and pick_a_starter start those two flows.",
      }),
    );
  }
  if (method === "ping") return json(rpc(id, {}));
  if (method === "tools/list") return json(rpc(id, { tools: TOOLS }));
  if (method === "prompts/list") return json(rpc(id, { prompts: PROMPTS }));
  if (method === "prompts/get") {
    const prompt = getPrompt(params?.name, params?.arguments);
    if (!prompt) return json(fail(id, -32602, `Unknown prompt or missing argument: ${params?.name}`));
    return json(rpc(id, prompt));
  }
  if (method === "tools/call") {
    const name = params?.name;
    if (name === "plan_app") return json(rpc(id, planApp(params?.arguments)));
    if (name === "list_app_starters") return json(rpc(id, listStarters()));
    return json(fail(id, -32602, `Unknown tool: ${name}`));
  }
  return json(fail(id, -32601, `Method not found: ${method}`));
}
