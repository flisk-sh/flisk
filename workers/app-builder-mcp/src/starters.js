// Starter repos for demo categories. A request that matches one starts from that
// repo and adds only the resources the plan still needs. Data only: which repo to
// clone, the menu words that pick it, and the services it already ships.
// Chosen from the audit in the PR description: only repos that use the current
// flisk CLI layout and pass `flisk config verify` (apart from generated snapshots)
// are listed. Categories with no working repo (agent, erp, user management) stay
// on the generated path.

export const STARTERS = {
  restaurant: {
    repo: "flisk-sh/flisk-restaurant-example",
    words: ["restaurant", "restaurants", "reservation", "reservations", "kitchen", "bistro", "diner"],
    services: [
      { name: "reservation-api", appType: "backend" },
      { name: "reservation-app", appType: "frontend" },
      { name: "kitchen-api", appType: "backend" },
      { name: "kitchen-worker", appType: "worker" },
      { name: "floor-app", appType: "frontend" },
      { name: "menu-api", appType: "backend" },
    ],
  },
  saas: {
    repo: "flisk-sh/flisk-saas-starter",
    words: ["saas", "dashboard", "billing", "subscription"],
    services: [
      { name: "dashboard-api-migrator", appType: "migrator" },
      { name: "dashboard-api", appType: "backend" },
      { name: "dashboard-app", appType: "frontend" },
      { name: "billing-api-migrator", appType: "migrator" },
      { name: "billing-api", appType: "backend" },
      { name: "checkout-app", appType: "frontend" },
    ],
  },
  store: {
    repo: "flisk-sh/flisk-ecommerce-example",
    words: ["shop", "store", "storefront", "ecommerce", "commerce"],
    services: [
      { name: "catalog-api", appType: "backend" },
      { name: "storefront-web", appType: "frontend" },
    ],
  },
  crud: {
    repo: "flisk-sh/flisk-person-crud-example",
    words: ["crud", "person", "people"],
    services: [
      { name: "person-api", appType: "backend" },
      { name: "person-app", appType: "frontend" },
      { name: "person-events", appType: "worker" },
      { name: "mongo", appType: "bring-your-own" },
      { name: "redis", appType: "bring-your-own" },
      { name: "rabbitmq", appType: "bring-your-own" },
    ],
  },
  auth: {
    repo: "flisk-sh/flisk-auth-queue-email-example",
    words: ["auth", "authentication", "login", "oidc"],
    services: [
      { name: "auth-emulator", appType: "backend" },
      { name: "reports-api", appType: "backend" },
      { name: "report-worker", appType: "worker" },
      { name: "web", appType: "frontend" },
    ],
  },
};

// Types a starter service can stand in for. Bring-your-own infrastructure (databases,
// queues, a chain node) is never counted as covered: the plan's own copy is always added.
const COVERABLE = new Set(["frontend", "backend", "worker", "agent", "mcp"]);

const words = (text) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

// The one category whose words appear in the request. Two categories, or none, means no starter.
export function matchStarter(text) {
  const w = words(text);
  const hits = Object.keys(STARTERS).filter((key) => STARTERS[key].words.some((x) => w.has(x)));
  return hits.length === 1 ? hits[0] : null;
}

// Which starter a build uses. Off unless STARTERS=1, so the generated path stays the default until reviewed.
export function starterForBuild(plan, env = {}) {
  if (env.STARTERS !== "1") return null;
  return plan.starter ?? null;
}

// Plan services the starter does not already provide. Counts per appType: a starter with two
// frontends covers the plan's web and admin. Migrators are never added: a starter keeps its own
// data layer, and the generated Prisma migrator only goes with a generated api.
export function extraResources(plan, key) {
  const free = {};
  for (const s of STARTERS[key].services) {
    if (COVERABLE.has(s.appType)) free[s.appType] = (free[s.appType] ?? 0) + 1;
  }
  return plan.services.filter((s) => {
    if (s.scaffoldedBy || s.appType === "migrator") return false;
    if (!COVERABLE.has(s.appType)) return true;
    if (free[s.appType] > 0) {
      free[s.appType] -= 1;
      return false;
    }
    return true;
  });
}

// Argument list for `git clone` into an empty directory. Shallow: only the starter's files are needed.
export function cloneArgs(key) {
  return ["clone", "--depth", "1", `https://github.com/${STARTERS[key].repo}.git`, "."];
}
