import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/project-templates.js
var PROJECT_TEMPLATES = {
  demo: {
    repo: "https://github.com/flisk-sh/flisk-restaurant-example.git",
    description: "Restaurant demo: take table bookings, run the kitchen and manage the dining room",
    fixedDir: "flisk-demo"
  },
  restaurant: {
    repo: "https://github.com/flisk-sh/flisk-restaurant-example.git",
    description: "Restaurant app: table bookings, kitchen orders and the dining room in one place"
  },
  saas: {
    repo: "https://github.com/flisk-sh/flisk-saas-starter.git",
    description: "Online subscription app: a customer account page and a working payment button"
  },
  erp: {
    repo: "https://github.com/flisk-sh/flisk-erp-system.git",
    description: "Company back office: 100 small services for sales, stock, finance and more"
  },
  "user-management": {
    repo: "https://github.com/flisk-sh/flisk-user-management.git",
    description: "Sign-up and log-in: user accounts, passwords and who may do what"
  },
  ecommerce: {
    repo: "https://github.com/flisk-sh/flisk-ecommerce-example.git",
    description: "Online shop: a shop front with a product catalogue"
  },
  example: {
    repo: "https://github.com/flisk-sh/flisk-example.git",
    bundledPath: "examples/flisk-example",
    description: "Order tracker: a web page that saves orders and finishes work in the background"
  },
  "agent-stack": {
    repo: "https://github.com/flisk-sh/flisk-agent-stack.git",
    description: "AI assistant: an assistant that can use tools and remember what it did"
  },
  swarm: {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "swarm",
    description: "AI team: one assistant splits a goal into tasks and three helpers finish them"
  },
  security: {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "security",
    description: "Security checker: one assistant scans, one sorts what it found, one writes the report"
  },
  "super-agent": {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "super-agent",
    description: "AI researcher: plans a task, looks things up, writes and checks the result (uses Claude when you add an Anthropic key)"
  },
  langgraph: {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "langgraph",
    description: "Step-by-step AI writer: plans, researches, writes and checks, and picks up where it stopped"
  },
  "tool-loop": {
    repo: "https://github.com/flisk-sh/flisk.git",
    generated: "tool-loop",
    description: "Simple AI helper: an assistant that uses tools, with a practice model so it works offline"
  },
  launch: {
    repo: "https://github.com/flisk-sh/flisk-template-launch.git",
    ref: "f97e03a11d026715573a610a8370c3c7546c5af8",
    description: "Launch page: a ready-to-publish website with a search-friendly page, icons and a small data feed"
  },
  portal: {
    repo: "https://github.com/flisk-sh/flisk-template-portal.git",
    ref: "0d57988acca78ff6649d861edcc683ece2afff22",
    description: "Developer portal: sign in with GitHub, hand out access keys and see who uses what"
  },
  // Not "stack": that is a command name, and `flisk <template>` is the one-command flow.
  fullstack: {
    repo: "https://github.com/flisk-sh/flisk-stack.git",
    ref: "fff53f3c77d0daea1f34498c70fe48a9e372b682",
    description: "Full app to build on: a website, the part behind it, background jobs and a database"
  }
};
function listProjectTemplates() {
  return Object.entries(PROJECT_TEMPLATES).map(([key, template]) => ({
    key,
    repo: template.repo,
    description: template.description,
    ...template.ref ? { ref: template.ref } : {}
  }));
}
function templateGitCommands(template, destination) {
  const commands = [["clone", template.repo, destination]];
  if (template.ref) {
    commands.push(["-C", destination, "checkout", "--quiet", "--detach", template.ref]);
  }
  return commands;
}
function bareTemplateArg(args) {
  const first = args[2];
  if (!first || first.startsWith("-"))
    return void 0;
  return first in PROJECT_TEMPLATES ? first : void 0;
}

export {
  PROJECT_TEMPLATES,
  listProjectTemplates,
  templateGitCommands,
  bareTemplateArg
};
