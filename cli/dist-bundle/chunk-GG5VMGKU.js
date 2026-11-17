import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  INFRA_PRESETS,
  LOCAL_FRONTEND_REQUIRES,
  frameworksOfType
} from "./chunk-MTFCEBG6.js";
import {
  DEFAULT_BACKEND_FRAMEWORK,
  DEFAULT_FRONTEND_FRAMEWORK,
  FRONTEND_FRAMEWORKS,
  listBackendFrameworks
} from "./chunk-2FFXENNE.js";
import {
  cliInvocation
} from "./chunk-CFZG7IYF.js";
import {
  installServiceDependencies
} from "./chunk-O5G2ZSHS.js";
import {
  PROJECT_TEMPLATES
} from "./chunk-4CRSIAQJ.js";
import {
  BACKEND_LANGUAGES,
  DEFAULT_BACKEND_LANGUAGE,
  getBackendLanguage
} from "./chunk-2ZNKJUYM.js";
import {
  addYesOption
} from "./chunk-MJGDAK6E.js";
import {
  CREATABLE_RESOURCE_TYPES,
  DATABASE_FRAMEWORK,
  DATABASE_FRAMEWORKS,
  DATABASE_RESOURCE_TYPE,
  PRESET_RESOURCE_TYPES
} from "./chunk-U3566SRZ.js";
import {
  BRING_YOUR_OWN_TYPE,
  FliskError,
  findOnPath,
  isWindows,
  runCommand,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/create.js
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";

// dist/utils/arrow-prompt.js
import { emitKeypressEvents } from "node:readline";
var PromptCancelled = class extends Error {
  constructor() {
    super("Cancelled");
    this.name = "PromptCancelled";
  }
};
var defaultStreams = () => ({ input: process.stdin, output: process.stdout });
function moveIndex(index, count, delta) {
  if (count <= 0)
    return 0;
  return (index + delta + count) % count;
}
function filterChoices(choices, filter) {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0)
    return [...choices];
  return choices.filter((choice) => {
    const text = `${choice.title} ${choice.value} ${choice.hint ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
function menuAction(key) {
  if (key.ctrl && key.name === "c")
    return "cancel";
  if (key.name === "escape")
    return "cancel";
  if (key.name === "up" || key.name === "k")
    return "up";
  if (key.name === "down" || key.name === "j")
    return "down";
  if (key.name === "space" || key.sequence === " ")
    return "toggle";
  if (key.name === "return" || key.name === "enter")
    return "submit";
  return "none";
}
var MENU_CHROME = 5;
function visibleWindow(total, cursor, terminalRows) {
  const room = terminalRows === void 0 ? total : Math.max(3, terminalRows - MENU_CHROME);
  if (total <= room)
    return [0, total];
  const size = Math.max(1, room - 2);
  const start = Math.min(Math.max(0, cursor - Math.floor(size / 2)), total - size);
  return [start, start + size];
}
function renderMenu(frame) {
  const rows = [`${source_default.cyan("\u25C6")} ${source_default.bold(frame.message)}`];
  if (frame.filter !== void 0) {
    rows.push(`${source_default.dim("\u2502")} ${source_default.dim("filter:")} ${frame.filter || source_default.dim("type to narrow the list")}${source_default.dim("\u258F")}`);
  }
  const [from, to] = visibleWindow(frame.choices.length, frame.cursor, frame.terminalRows);
  if (from > 0)
    rows.push(source_default.dim(`\u2502   \u2191 ${from} more`));
  frame.choices.slice(from, to).forEach((choice, offset) => {
    const index = from + offset;
    const active = index === frame.cursor;
    const mark = frame.ticked ? frame.ticked.has(choice.value) ? "\u25FC" : "\u25FB" : active ? "\u25CF" : "\u25CB";
    const title = active ? source_default.cyan(choice.title) : source_default.dim(choice.title);
    const hint = choice.hint ? source_default.dim(`  ${choice.hint}`) : "";
    const pointer = active ? source_default.cyan("\u203A") : " ";
    rows.push(`${source_default.dim("\u2502")} ${pointer} ${active ? source_default.cyan(mark) : source_default.dim(mark)} ${title}${hint}`);
  });
  if (to < frame.choices.length)
    rows.push(source_default.dim(`\u2502   \u2193 ${frame.choices.length - to} more`));
  rows.push(source_default.dim(frame.ticked ? "\u2514 \u2191/\u2193 move \xB7 space tick \xB7 Enter confirm" : frame.filter !== void 0 ? "\u2514 \u2191/\u2193 move \xB7 type to filter \xB7 Enter choose" : "\u2514 \u2191/\u2193 move \xB7 Enter choose"));
  return rows;
}
function renderAnswered(message, answer) {
  return `${source_default.green("\u25C7")} ${message}  ${source_default.dim(answer)}`;
}
var WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u;
function cellWidth(grapheme) {
  if (new RegExp("^(?:\\p{Mn}|\\p{Me}|\\p{Cf}|[\\u{FE00}-\\u{FE0F}])+$", "u").test(grapheme))
    return 0;
  if (WIDE.test(grapheme))
    return 2;
  if (new RegExp("\\p{Emoji_Presentation}|\\u{FE0F}|\\p{Regional_Indicator}", "u").test(grapheme))
    return 2;
  return 1;
}
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function graphemes(line) {
  const plain = line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  return [...segmenter.segment(plain)].map((part) => part.segment);
}
function visibleWidth(line) {
  let width = 0;
  for (const grapheme of graphemes(line))
    width += cellWidth(grapheme);
  return width;
}
function framedLines(rows, columns) {
  const width = Math.max(1, columns);
  return rows.reduce((total, row) => total + Math.max(1, Math.ceil(visibleWidth(row) / width)), 0);
}
function fitRow(row, columns) {
  const max = Math.max(10, columns - 1);
  if (visibleWidth(row) <= max)
    return row;
  let kept = "";
  let width = 0;
  for (const grapheme of graphemes(row)) {
    const next = cellWidth(grapheme);
    if (width + next > max - 1)
      break;
    kept += grapheme;
    width += next;
  }
  return `${kept}\u2026`;
}
function eraseRows(output, lines) {
  if (lines > 0)
    output.write(`\x1B[${lines}A`);
  output.write("\r\x1B[0J");
}
function readKeys(streams, onKey) {
  const { input, output } = streams;
  emitKeypressEvents(input);
  const wasRaw = input.isRaw === true;
  input.setRawMode?.(true);
  input.resume();
  output.write("\x1B[?25l");
  return new Promise((resolve2, reject) => {
    const finish = (settle) => {
      input.off("keypress", handler);
      input.off("end", closed);
      input.off("close", closed);
      input.setRawMode?.(wasRaw);
      input.pause();
      output.write("\x1B[?25h");
      settle();
    };
    const handler = (str, key) => {
      const pressed = key ?? { sequence: str };
      if (menuAction(pressed) === "cancel") {
        finish(() => reject(new PromptCancelled()));
        return;
      }
      const result = onKey(pressed, str);
      if (result)
        finish(() => resolve2(result.done));
    };
    const closed = () => finish(() => reject(new PromptCancelled()));
    input.on("keypress", handler);
    input.once("end", closed);
    input.once("close", closed);
  });
}
async function arrowSelect(options, streams = defaultStreams()) {
  const { output } = streams;
  let filter = "";
  let cursor = Math.max(0, options.choices.findIndex((choice) => choice.value === options.initial));
  const visible = () => options.filterable ? filterChoices(options.choices, filter) : options.choices;
  let drawn = 0;
  const draw = () => {
    eraseRows(output, drawn);
    const shown = visible();
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));
    const rows = renderMenu({
      message: options.message,
      choices: shown,
      cursor,
      ...options.filterable ? { filter } : {},
      terminalRows: output.rows
    });
    if (shown.length === 0)
      rows.splice(options.filterable ? 2 : 1, 0, source_default.dim("\u2502   nothing matches \xB7 Backspace clears what you typed"));
    const width = output.columns ?? 80;
    const fitted = rows.map((row) => fitRow(row, width));
    output.write(`${fitted.join("\n")}
`);
    drawn = framedLines(fitted, width);
  };
  draw();
  try {
    const chosen = await readKeys(streams, (key, str) => {
      const action = menuAction(key);
      const shown = visible();
      const typed = options.filterable && str && str.length === 1 && str >= " " && !key.ctrl;
      if (options.filterable && key.name === "backspace") {
        filter = filter.slice(0, -1);
        draw();
        return void 0;
      }
      if (typed && action !== "submit") {
        filter += str;
        cursor = 0;
        draw();
        return void 0;
      }
      if (action === "up" || action === "down") {
        cursor = moveIndex(cursor, shown.length, action === "up" ? -1 : 1);
        draw();
      }
      const current = shown[cursor];
      return action === "submit" && current ? { done: current.value } : void 0;
    });
    eraseRows(output, drawn);
    const picked = options.choices.find((choice) => choice.value === chosen);
    output.write(`${renderAnswered(options.message, picked?.title ?? chosen)}
`);
    return chosen;
  } catch (error) {
    eraseRows(output, drawn);
    throw error;
  }
}
async function arrowMultiSelect(options, streams = defaultStreams()) {
  const { output } = streams;
  let cursor = 0;
  const ticked = new Set(options.choices.filter((choice) => choice.selected).map((choice) => choice.value));
  let drawn = 0;
  const draw = () => {
    eraseRows(output, drawn);
    const rows = renderMenu({
      message: options.message,
      choices: options.choices,
      cursor,
      ticked,
      terminalRows: output.rows
    });
    const width = output.columns ?? 80;
    const fitted = rows.map((row) => fitRow(row, width));
    output.write(`${fitted.join("\n")}
`);
    drawn = framedLines(fitted, width);
  };
  draw();
  try {
    await readKeys(streams, (key) => {
      const action = menuAction(key);
      const current = options.choices[cursor];
      if (action === "up" || action === "down") {
        cursor = moveIndex(cursor, options.choices.length, action === "up" ? -1 : 1);
        draw();
      } else if (action === "toggle" && current) {
        if (ticked.has(current.value))
          ticked.delete(current.value);
        else
          ticked.add(current.value);
        draw();
      }
      return action === "submit" ? { done: true } : void 0;
    });
    eraseRows(output, drawn);
    const titles = options.choices.filter((c) => ticked.has(c.value)).map((c) => c.title);
    output.write(`${renderAnswered(options.message, titles.length ? titles.join(", ") : "none")}
`);
    return options.choices.filter((c) => ticked.has(c.value)).map((c) => c.value);
  } catch (error) {
    eraseRows(output, drawn);
    throw error;
  }
}
async function arrowText(options, streams = defaultStreams()) {
  const { output } = streams;
  let typed = "";
  let problem = "";
  let drawn = 0;
  const draw = () => {
    eraseRows(output, drawn);
    const shown = typed.length > 0 ? source_default.cyan(typed) : source_default.dim(options.initial);
    const rows = [
      `${source_default.cyan("\u25C6")} ${source_default.bold(options.message)}  ${shown}${source_default.dim("\u258F")}`,
      problem ? source_default.red(`\u2502 ${problem}`) : source_default.dim("\u2514 Enter to accept, or type a name")
    ];
    const width = output.columns ?? 80;
    const fitted = rows.map((row) => fitRow(row, width));
    output.write(`${fitted.join("\n")}
`);
    drawn = framedLines(fitted, width);
  };
  draw();
  try {
    const value = await readKeys(streams, (key, str) => {
      const action = menuAction(key);
      if (action === "submit") {
        const candidate = typed.length > 0 ? typed : options.initial;
        const verdict = options.validate?.(candidate) ?? true;
        if (verdict === true)
          return { done: candidate };
        problem = verdict;
        draw();
        return void 0;
      }
      if (key.name === "backspace") {
        typed = typed.slice(0, -1);
      } else if (str && str.length === 1 && str >= " " && !key.ctrl) {
        typed += str;
      } else {
        return void 0;
      }
      problem = "";
      draw();
      return void 0;
    });
    eraseRows(output, drawn);
    output.write(`${renderAnswered(options.message, value)}
`);
    return value;
  } catch (error) {
    eraseRows(output, drawn);
    throw error;
  }
}

// dist/utils/create-catalog.js
function frontendCatalog() {
  const options = Object.values(FRONTEND_FRAMEWORKS).map((provider) => ({
    id: provider.id,
    title: provider.label,
    hint: provider.kind === "server" ? "runs its own dev server" : "Vite",
    // A server framework runs its own dev server on the host; a Vite one needs its plugin setup declared.
    local: provider.kind === "server" || provider.vite !== void 0
  }));
  return defaultFirst(options, DEFAULT_FRONTEND_FRAMEWORK);
}
function backendCatalog() {
  const frameworks = listBackendFrameworks();
  const options = Object.values(BACKEND_LANGUAGES).map((language) => ({
    id: language.id,
    title: language.label,
    // What the language needs on the host: its dev command's program, or its own id for the shared scaffold.
    hint: `needs ${localRequirements({ frontend: false, language: language.id }).join(", ")}`,
    local: true,
    frameworks: defaultFirst(frameworks.filter((entry) => entry.languages.includes(language.id)).map((entry) => ({ id: entry.id, title: entry.label, hint: "", local: true })), DEFAULT_BACKEND_FRAMEWORK)
  }));
  return defaultFirst(options, DEFAULT_BACKEND_LANGUAGE);
}
function plainStarterText(id, description) {
  const colon = description.indexOf(": ");
  if (colon > 0 && colon <= 40) {
    return { title: description.slice(0, colon), hint: description.slice(colon + 2) };
  }
  return { title: id, hint: description };
}
function starterCatalog() {
  return Object.entries(PROJECT_TEMPLATES).map(([key, template]) => ({
    id: key,
    ...plainStarterText(key, template.description),
    local: template.generated !== void 0
  }));
}
function extraCatalog() {
  const presetTypes = Object.keys(PRESET_RESOURCE_TYPES);
  const infra = [...presetTypes, DATABASE_RESOURCE_TYPE].flatMap((type) => (
    // `--type database` also takes the shared Postgres, which is not an infrastructure preset.
    (type === DATABASE_RESOURCE_TYPE ? DATABASE_FRAMEWORKS : frameworksOfType(type)).map((framework) => {
      const preset = INFRA_PRESETS[framework];
      return {
        id: `${type}:${framework}`,
        type,
        framework,
        title: framework,
        hint: preset?.description ?? `shared ${framework} database`
      };
    })
  ));
  const own = CREATABLE_RESOURCE_TYPES.filter((type) => !isAppPart(type) && type !== BRING_YOUR_OWN_TYPE).map((type) => ({ id: type, type, title: type, hint: `a ${type} resource` }));
  return [...own, ...infra];
}
function isAppPart(type) {
  return Object.hasOwn(APP_PARTS, type);
}
var APP_PARTS = { frontend: true, backend: true };
function localRequirements(parts) {
  const programs = /* @__PURE__ */ new Set();
  if (parts.frontend)
    for (const program of LOCAL_FRONTEND_REQUIRES)
      programs.add(program);
  if (parts.language) {
    const provider = BACKEND_LANGUAGES[parts.language];
    const hasPackageJson = provider?.createFiles?.("app").some((file) => file.filename === "package.json");
    if (!provider)
      programs.add(parts.language);
    else if (hasPackageJson || !provider.devCommand)
      programs.add("npm");
    else
      programs.add(provider.devCommand.split(" ")[0]);
  }
  return [...programs];
}
function defaultFirst(options, defaultId) {
  return [...options].sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
}

// dist/utils/create-plan.js
var CREATE_RUNTIMES = ["local", "docker"];
var CREATE_STACK = "app";
var LOCAL_FRONTEND_DIR = "web";
var LOCAL_BACKEND_DIR = "api";
var POSTGRES_EXTRA = `${DATABASE_RESOURCE_TYPE}:${DATABASE_FRAMEWORK}`;
var KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
var WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
function isValidProjectName(name) {
  return KEBAB.test(name) && name.length <= 48 && !WINDOWS_RESERVED.test(name);
}
function toProjectName(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
}
function starterInfo(id) {
  const found = starterCatalog().find((option) => option.id === id);
  return { title: found?.title ?? id, local: found?.local ?? false };
}
var extraSuffix = (id) => id.replace(":", "-");
function buildCreatePlan(answers) {
  const { name, starter, runtime } = answers;
  if (starter) {
    return [
      {
        label: `Writing the "${starterInfo(starter).title}" starter`,
        args: ["project", starter, "--path", name, "--yes"],
        inProject: false
      }
    ];
  }
  const local = runtime === "local";
  const steps = [
    { label: "Creating the project", args: ["project", "--yes"], inProject: true }
  ];
  const where = (dir) => local ? ["--path", dir, "--local"] : [];
  if (answers.backend) {
    const { language, framework } = answers.backend;
    const flavour = language === DEFAULT_BACKEND_LANGUAGE ? framework ? ["--framework", framework] : [] : ["--language", language];
    steps.push({
      label: `Adding the ${framework ?? language} API`,
      args: [
        "resource",
        `${name}-api`,
        "--type",
        "backend",
        ...flavour,
        // Postgres with an API: Prisma adds the `<api>-migrator` resource and makes the API wait for it.
        // Only the default (Node) language has it; the other languages' scaffolds ignore the feature.
        ...!local && language === DEFAULT_BACKEND_LANGUAGE && answers.extras.includes(POSTGRES_EXTRA) ? ["--feature", "prisma"] : [],
        ...where(LOCAL_BACKEND_DIR),
        "--stack",
        CREATE_STACK,
        "--yes"
      ],
      inProject: true
    });
  }
  if (answers.frontend) {
    steps.push({
      label: `Adding the ${answers.frontend} website`,
      args: [
        "resource",
        `${name}-web`,
        "--type",
        "frontend",
        "--framework",
        answers.frontend,
        ...where(LOCAL_FRONTEND_DIR),
        "--stack",
        CREATE_STACK,
        "--yes"
      ],
      inProject: true
    });
  }
  if (!local) {
    const known = new Map(extraCatalog().map((extra) => [extra.id, extra]));
    for (const id of answers.extras) {
      const extra = known.get(id);
      if (!extra)
        continue;
      steps.push({
        label: `Adding ${extra.title}`,
        args: [
          "resource",
          `${name}-${extraSuffix(id)}`,
          "--type",
          extra.type,
          ...extra.framework ? ["--framework", extra.framework] : [],
          "--stack",
          CREATE_STACK,
          "--yes"
        ],
        inProject: true
      });
    }
  }
  return steps;
}
function isEmptyApp(answers) {
  return !answers.starter && !answers.frontend && !answers.backend;
}
function asksToStart(answers) {
  return answers.runtime === "local" && !answers.starter;
}
function describeRequirements(answers, onPath = () => true) {
  if (answers.starter) {
    return starterInfo(answers.starter).local ? "runs on this computer; no Docker, no database" : "Docker (its README says what else)";
  }
  if (answers.runtime === "docker")
    return "Docker and Tilt (`flisk doctor` checks what is missing)";
  const programs = localRequirements({
    frontend: answers.frontend !== void 0,
    language: answers.backend?.language
  });
  const missing = programs.filter((program) => !onPath(program));
  const list = `${programs.join(", ")}. No Docker, no Tilt, no database`;
  return missing.length > 0 ? `${list}. Not found on this machine: ${missing.join(", ")}` : list;
}
function missingPrograms(answers, onPath = () => true) {
  if (answers.starter || answers.runtime === "docker")
    return [];
  return localRequirements({
    frontend: answers.frontend !== void 0,
    language: answers.backend?.language
  }).filter((program) => !onPath(program));
}
function describeParts(answers, steps) {
  if (answers.starter)
    return `the "${starterInfo(answers.starter).title}" starter`;
  const parts = steps.filter((step) => step.args[0] === "resource").map((step) => String(step.args[1]));
  return parts.join(", ");
}
function describeAnswers(answers) {
  const lines = [`name: ${answers.name}`];
  if (answers.starter)
    return [...lines, `starter: ${starterInfo(answers.starter).title}`];
  lines.push(`runtime: ${answers.runtime}`);
  lines.push(`website: ${answers.frontend ?? "none"}`);
  if (answers.backend) {
    const { language, framework } = answers.backend;
    lines.push(`api: ${framework ? `${language} + ${framework}` : language}`);
  } else {
    lines.push("api: none");
  }
  if (answers.runtime === "docker") {
    lines.push(`extras: ${answers.extras.length > 0 ? answers.extras.join(", ") : "none"}`);
  }
  return lines;
}

// dist/commands/create.js
var SHAPE_CHOICES = [
  {
    title: "A website that saves and shows information",
    value: "both",
    hint: "Pages people open in a browser, plus the part behind them (default)."
  },
  { title: "Just a website", value: "web", hint: "Pages people open in a browser." },
  {
    title: "Just the part behind the scenes",
    value: "api",
    hint: "A service other programs talk to (an API)."
  },
  {
    title: "A ready-made app to start from\u2026",
    value: "starter",
    hint: "An online shop, an AI helper, a team tool and more."
  },
  {
    title: "I know what I want: let me choose every part",
    value: "custom",
    hint: "Pick the framework, language and extras yourself."
  }
];
var INSTALL_HELP = {
  node: "Node.js (also gives you npm): https://nodejs.org",
  npm: "npm comes with Node.js: https://nodejs.org",
  bun: "Bun: curl -fsSL https://bun.sh/install | bash",
  go: "Go: https://go.dev/dl",
  cargo: "Rust: https://rustup.rs",
  python3: "Python: https://www.python.org/downloads",
  uvicorn: "uvicorn: pip install uvicorn"
};
function installHelp(missing) {
  return missing.flatMap((program) => INSTALL_HELP[program] ? [`  ${INSTALL_HELP[program]}`] : []);
}
function oneOf(flag, value, ids, extra = []) {
  const allowed = [...ids, ...extra];
  if (allowed.includes(value))
    return value;
  throw new FliskError(`Unknown --${flag} "${value}". Use one of: ${allowed.join(", ")}.`, [
    `flisk create --${flag} ${allowed[0] ?? "<id>"}`,
    "Leave the flag out to be asked, or to take the default."
  ]);
}
function isInteractive(options, tty) {
  return Boolean(tty.in && tty.out && !options.yes);
}
function toChoices(options) {
  return options.map((option, index) => ({
    title: index === 0 ? `${option.title} (default)` : option.title,
    value: option.id,
    hint: `${option.hint}${option.local ? "" : " \xB7 needs Docker"}`.trim()
  }));
}
function backendChoices(catalog) {
  const rows = [];
  for (const language of catalog) {
    if (language.frameworks.length === 0) {
      rows.push({ title: language.title, value: language.id, hint: language.hint });
      continue;
    }
    for (const [index, framework] of language.frameworks.entries()) {
      const globalDefault = index === 0 && language.id === catalog[0]?.id;
      rows.push({
        title: `${globalDefault ? language.title : framework.title}${globalDefault ? " (default)" : ""}`,
        value: `${language.id}/${framework.id}`,
        hint: language.hint
      });
    }
  }
  return rows;
}
function splitStackChoice(pick) {
  const [language, framework] = pick.split("/");
  return { language, ...framework ? { framework } : {} };
}
function resolveBackend(framework, language) {
  const catalog = backendCatalog();
  const languages = catalog.map((entry) => entry.id);
  const lang = language ? oneOf("language", language, languages) : void 0;
  const owner = framework ? catalog.find((entry) => entry.frameworks.some((option) => option.id === framework)) : void 0;
  if (framework) {
    const everyFramework = catalog.flatMap((entry) => entry.frameworks.map((option) => option.id));
    oneOf("backend", framework, everyFramework);
    if (lang && owner && lang !== owner.id) {
      throw new FliskError(`--backend ${framework} runs on ${owner.id}, not ${lang}.`, [
        `Use --language ${owner.id}, or leave --language out.`
      ]);
    }
    return { language: owner?.id ?? catalog[0]?.id ?? "", framework };
  }
  const chosen = catalog.find((entry) => entry.id === lang) ?? catalog[0];
  if (!chosen)
    return void 0;
  return {
    language: chosen.id,
    ...chosen.frameworks[0] && !lang ? { framework: chosen.frameworks[0].id } : {}
  };
}
async function collectAnswers(nameArg, options, interactive) {
  if (nameArg !== void 0 && !isValidProjectName(nameArg)) {
    throw new FliskError(`"${nameArg}" is not a usable project name. Use lowercase letters, digits and dashes, e.g. my-app.`, ["Pick a name like my-app or shop-2: flisk create my-app"]);
  }
  const starters = starterCatalog();
  const frontends = frontendCatalog();
  const backends = backendCatalog();
  const extrasCatalog = extraCatalog();
  if (options.backend === "none" && options.language !== void 0) {
    throw new FliskError(`--language ${options.language} has no API to apply to: --backend none leaves the API out.`, ["Drop --backend none to get an API in that language, or drop --language."]);
  }
  if (options.starter && options.extras !== void 0 && options.extras !== "none") {
    throw new FliskError("--extras cannot be combined with --starter: a starter carries its own parts.", ["Drop --extras, or drop --starter and add the parts with --runtime docker."]);
  }
  const flagged = {
    frontend: options.frontend !== void 0,
    backend: options.backend !== void 0 || options.language !== void 0
  };
  let shape = "both";
  if (options.starter)
    shape = "starter";
  else if (flagged.frontend || flagged.backend) {
    shape = options.frontend === "none" ? "api" : options.backend === "none" ? "web" : "both";
    if (!flagged.backend && flagged.frontend)
      shape = options.frontend === "none" ? "api" : "web";
    if (!flagged.frontend && flagged.backend)
      shape = options.backend === "none" ? "web" : "api";
  } else if (interactive) {
    shape = await arrowSelect({
      message: "What do you want to make?",
      choices: SHAPE_CHOICES
    });
  }
  const advanced = shape === "custom";
  if (advanced)
    shape = "both";
  let starter;
  if (shape === "starter") {
    starter = options.starter ? oneOf("starter", options.starter, starters.map((option) => option.id)) : await arrowSelect({
      message: "Which starter?",
      filterable: true,
      choices: [...starters].sort((x, y) => Number(y.local) - Number(x.local)).map((option) => ({
        title: option.title,
        value: option.id,
        hint: `${option.hint}${option.local ? " \xB7 runs on your computer" : " \xB7 needs Docker, see its README"}`
      }))
    });
  }
  const starterLocal = starters.find((option) => option.id === starter)?.local ?? false;
  let runtime = starter ? starterLocal ? "local" : "docker" : "local";
  let frontend;
  if (!starter && shape !== "api") {
    if (options.frontend && options.frontend !== "none") {
      frontend = oneOf("frontend", options.frontend, frontends.map((option) => option.id), ["none"]);
    } else if (!options.frontend) {
      frontend = interactive && advanced ? await arrowSelect({
        message: "Which website framework?",
        filterable: true,
        choices: toChoices(frontends)
      }) : frontends.find((option) => option.local)?.id;
    }
    const picked = frontends.find((option) => option.id === frontend);
    if (picked && !picked.local)
      runtime = "docker";
  }
  let backend;
  if (!starter && shape !== "web") {
    if (flagged.backend && options.backend !== "none") {
      backend = resolveBackend(options.backend, options.language);
    } else if (!flagged.backend) {
      if (interactive && advanced) {
        const stack = await arrowSelect({
          message: "Which API stack?",
          filterable: true,
          choices: backendChoices(backends)
        });
        backend = splitStackChoice(stack);
      } else {
        backend = resolveBackend(void 0, void 0);
      }
    }
  }
  let extras = [];
  if (options.extras !== void 0) {
    extras = options.extras === "none" ? [] : options.extras.split(",").map((value) => value.trim()).filter(Boolean).map((value) => oneOf("extras", value, extrasCatalog.map((extra) => extra.id), ["none"]));
  } else if (interactive && advanced && !starter) {
    extras = await arrowMultiSelect({
      message: "Add anything else?  Leaving it empty runs the app on this computer.",
      choices: extrasCatalog.map((extra) => ({
        title: extra.title,
        value: extra.id,
        hint: extra.hint
      }))
    });
  }
  if (options.runtime)
    runtime = oneOf("runtime", options.runtime, CREATE_RUNTIMES);
  else if (extras.length > 0 && !starter)
    runtime = "docker";
  if (runtime === "local" && extras.length > 0 && !starter) {
    throw new FliskError("--extras (queues, databases, workers) need the Docker runtime.", [
      "Use --runtime docker, or leave --extras out to run on your computer."
    ]);
  }
  let name = nameArg ?? "my-app";
  if (nameArg === void 0 && interactive) {
    const typed = await arrowText({
      message: "Project name?",
      initial: "my-app",
      // Anything readable is fine: "My Shop!" becomes the folder my-shop.
      validate: (value) => isValidProjectName(toProjectName(value)) || "Type a name with at least one letter, e.g. my-shop."
    });
    name = toProjectName(typed ?? "my-app");
  }
  const answers = {
    name,
    ...starter ? { starter } : {},
    runtime,
    ...frontend ? { frontend } : {},
    ...backend ? { backend } : {},
    extras
  };
  if (isEmptyApp(answers)) {
    throw new FliskError("There is nothing to create: no website, no API and no starter.", [
      "Pick a website or an API, or use --starter <name>."
    ]);
  }
  return answers;
}
function assertFolderIsFree(dir) {
  let entry;
  try {
    entry = lstatSync(dir);
  } catch (error) {
    if (error.code === "ENOENT")
      return;
    throw new FliskError(`Cannot check ${dir}: ${error.message}`, [
      "Check that you can read the parent folder, or pick another place: cd <folder> && flisk create <name>"
    ]);
  }
  if (entry.isSymbolicLink()) {
    throw new FliskError(`${dir} is a link to another place, not a folder.`, [
      "Pick another name: flisk create <name>"
    ]);
  }
  if (!entry.isDirectory()) {
    throw new FliskError(`${dir} already exists and is not a folder.`, [
      "Pick another name: flisk create <name>"
    ]);
  }
  if (readdirSync(dir).length === 0)
    return;
  throw new FliskError(`The folder ${dir} already exists and is not empty.`, [
    "Pick another name: flisk create <name>",
    "Or remove the folder first."
  ]);
}
function claimFolder(dir) {
  assertFolderIsFree(dir);
  const existed = existsSync(dir);
  if (existsSync(dir)) {
    try {
      rmdirSync(dir);
    } catch {
      throw new FliskError(`The folder ${dir} is no longer empty.`, [
        "Something wrote into it while create was starting. Nothing was written by create.",
        "Pick another name: flisk create <name>"
      ]);
    }
  }
  mkdirSync(dirname(dir), { recursive: true });
  try {
    mkdirSync(dir);
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new FliskError(`The folder ${dir} appeared while create was starting.`, [
        "Nothing was written. Pick another name: flisk create <name>"
      ]);
    }
    throw error;
  }
  return !existed;
}
function renderStep(step) {
  return `flisk ${step.args.join(" ")}`;
}
function reviewLines(answers, steps, onPath = (program) => findOnPath(program) !== null) {
  const chosen = describeAnswers(answers).filter((line) => !line.startsWith("name:")).join(" \xB7 ");
  const lines = [
    `Creating ${answers.name}: ${describeParts(answers, steps)}`,
    `Needs: ${describeRequirements(answers, onPath)}`,
    `Chosen: ${chosen}`
  ];
  if (answers.runtime === "local" && !answers.starter) {
    lines.push(`Runs on this computer. --runtime docker switches to containers, one gateway and live reload.`);
  }
  const missing = missingPrograms(answers, onPath);
  if (missing.length > 0) {
    lines.push(`To install what is missing:`, ...installHelp(missing));
  }
  return lines;
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return void 0;
  }
}
function splitCommand(command) {
  const words = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  for (let match = pattern.exec(command); match; match = pattern.exec(command)) {
    words.push(match[1] ?? match[2] ?? "");
  }
  return words;
}
function localInstallHint(hint) {
  return hint.split("#")[0]?.trim() ?? hint;
}
function generatedServices(projectDir, answers) {
  const found = [];
  for (const dir of [LOCAL_FRONTEND_DIR, LOCAL_BACKEND_DIR]) {
    const service = readJson(join(projectDir, dir, "service.json"));
    if (!service)
      continue;
    const pkg = readJson(join(projectDir, dir, "package.json"));
    const scripts = pkg?.scripts ?? {};
    const language = dir === LOCAL_BACKEND_DIR ? answers.backend?.language : void 0;
    found.push({
      dir,
      install: pkg ? "npm install" : language ? localInstallHint(getBackendLanguage(language).installHint) : void 0,
      run: scripts.dev ? "npm run dev" : String(service.command ?? ""),
      ...typeof service.port === "number" ? { port: service.port } : {}
    });
  }
  return found;
}
function startBlockers(answers, onPath = (program) => findOnPath(program) !== null) {
  return missingPrograms(answers, onPath);
}
function firstPort(projectDir) {
  let entries = [];
  try {
    entries = readdirSync(projectDir).sort();
  } catch {
    return void 0;
  }
  for (const dir of entries) {
    const port = readJson(join(projectDir, dir, "service.json"))?.port;
    if (typeof port === "number")
      return port;
  }
  const groups = subdirs(join(projectDir, "services"));
  for (const group of groups) {
    for (const dir of subdirs(join(projectDir, "services", group))) {
      const port = readJson(join(projectDir, "services", group, dir, "service.json"))?.port;
      if (typeof port === "number")
        return port;
    }
  }
  return void 0;
}
function subdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}
function whereToOpen(services) {
  const web = services.find((service) => service.dir === LOCAL_FRONTEND_DIR && service.port);
  if (web)
    return `Then open http://localhost:${web.port} in your browser.`;
  const api = services.find((service) => service.dir === LOCAL_BACKEND_DIR && service.port);
  if (api)
    return `Then check it works: http://localhost:${api.port}/health`;
  return void 0;
}
function nextSteps(projectDir, answers, services = generatedServices(projectDir, answers)) {
  if (answers.starter) {
    const port = firstPort(projectDir);
    const docker = !starterInfo(answers.starter).local;
    return [
      `cd ${answers.name}`,
      docker ? "flisk up        # starts it (Docker must be running)" : "flisk up        # starts it",
      ...port ? [`Then open http://localhost:${port} in your browser.`] : [],
      ...docker ? ["Its README says what else it needs."] : []
    ];
  }
  if (answers.runtime === "docker")
    return [`cd ${answers.name}`, "flisk up app"];
  const open = whereToOpen(services);
  return [
    `cd ${answers.name}`,
    ...services.flatMap((service) => service.install ? [`(cd ${service.dir} && ${service.install})`] : []),
    services.length === 1 ? "flisk up        # starts it" : "flisk up        # starts both",
    ...open ? [open] : []
  ];
}
function runStep(invocation, step, cwd) {
  const [command, ...prefix] = invocation;
  const result = spawnSync(command, [...prefix, ...step.args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}
function recoveryMessage(projectDir, steps, failedIndex, createdFolder = true) {
  const failed = steps[failedIndex];
  return [
    `The project in ${projectDir} is incomplete${failed ? `: "${failed.label}" did not finish` : ""}.`,
    ...steps.slice(0, failedIndex).map((step) => `  done: ${step.label}`),
    ...steps.slice(failedIndex + 1).map((step) => `  not run: ${step.label}`),
    `Project folder (absolute path): ${JSON.stringify(projectDir)}`,
    createdFolder ? "flisk create made this folder just now. Look inside it, delete it yourself if you no longer need it, then run flisk create again." : "This folder was already there (empty) before flisk create. Look inside it and remove only what create added, then run flisk create again."
  ];
}
var createCommand = addYesOption(new Command("create")).description("Pick what you are building with a few key presses and get a project that runs").addHelpText("after", "\nExamples:\n  flisk create\n  flisk create my-app --yes --start\n  flisk create shop --frontend react --backend hono\n  flisk create api --runtime docker --extras worker,queue:nats\n  flisk create --dry-run").argument("[name]", "Project folder to create (default: my-app)").option("--starter <name>", "A ready-made starter project (see flisk project --list)").option("--runtime <runtime>", "local (plain processes on your computer; default) or docker (Docker and Tilt)").option("--frontend <id>", "Website framework (see flisk resource --frameworks --type frontend), or none").option("--backend <id>", "API framework (see flisk resource --frameworks --type backend), or none").option("--language <id>", "API language (see flisk resource --help)").option("--extras <list>", "Docker runtime: extra parts, comma-separated (worker, queue:nats, database:redis\u2026), or none").option("--dry-run", "Print the commands that would run, and stop", false).option("--start", "Install dependencies and start what was written (the local app route; a starter is never started here)", false).action(async (nameArg, options) => {
  await runCommand(async () => {
    try {
      await runCreate(nameArg, options);
    } catch (error) {
      if (!(error instanceof PromptCancelled))
        throw error;
      console.log(source_default.dim("\nCancelled. Nothing was written."));
      process.exitCode = 130;
    }
  });
});
async function runCreate(nameArg, options) {
  const interactive = isInteractive(options, {
    in: process.stdin.isTTY === true,
    out: process.stdout.isTTY === true
  });
  if (interactive) {
    console.log(source_default.bold("\nLet's create your project"));
    console.log(source_default.dim("Start with a working default. Type to filter a long list.\n"));
  }
  const answers = await collectAnswers(nameArg, options, interactive);
  if (!isValidProjectName(answers.name)) {
    throw new FliskError(`"${answers.name}" is not a usable project name. Use lowercase letters, digits and dashes, e.g. my-app.`, ["Pick a name like my-app or shop-2: flisk create my-app"]);
  }
  const steps = buildCreatePlan(answers);
  if (options.dryRun) {
    console.log(describeAnswers(answers).join("\n"));
    console.log(`needs: ${describeRequirements(answers, (program) => findOnPath(program) !== null)}
`);
    for (const step of steps) {
      const where = step.inProject ? source_default.gray(`(in ./${answers.name})`) : "";
      console.log(`${renderStep(step)} ${where}`.trimEnd());
    }
    console.log(source_default.gray("\nDry run: nothing was written."));
    return;
  }
  const projectDir = resolve(process.cwd(), answers.name);
  assertFolderIsFree(projectDir);
  const review = reviewLines(answers, steps);
  if (interactive) {
    console.log("");
    for (const line of review)
      console.log(`  ${line}`);
    console.log("");
    const defaultFrontend = frontendCatalog()[0]?.id;
    const defaultBackend = backendCatalog()[0];
    const defaultBackendFramework = defaultBackend?.frameworks[0]?.id;
    const hasFrontend = !!answers.frontend;
    const hasBackend = !!answers.backend;
    const frontendDefault = hasFrontend && answers.frontend === defaultFrontend;
    const backendDefault = hasBackend && answers.backend?.language === defaultBackend?.id && answers.backend?.framework === defaultBackendFramework;
    const allDefaults = answers.runtime === "local" && !answers.starter && frontendDefault && backendDefault && answers.extras.length === 0 && answers.name === "my-app";
    if (!allDefaults) {
      const go = await arrowSelect({
        message: "Create it?",
        choices: [
          { title: "Yes, create it", value: "create" },
          { title: "No, cancel", value: "cancel" }
        ]
      });
      if (go === "cancel") {
        console.log(source_default.dim("\nCancelled. Nothing was written."));
        process.exitCode = 130;
        return;
      }
    }
  } else {
    for (const line of review)
      console.log(line);
  }
  const invocation = cliInvocation();
  const createdFolder = claimFolder(projectDir);
  for (const [index, step] of steps.entries()) {
    process.stdout.write(`  ${step.label}... `);
    const result = runStep(invocation, step, step.inProject ? projectDir : process.cwd());
    if (!result.ok) {
      console.log(source_default.red("failed"));
      console.log(result.output.trimEnd());
      throw new FliskError(`"${renderStep(step)}" did not finish.`, recoveryMessage(projectDir, steps, index, createdFolder));
    }
    console.log(source_default.green("done"));
  }
  console.log(`
${source_default.green("\u2714")} Created ${source_default.bold(answers.name)}`);
  const services = generatedServices(projectDir, answers);
  if (answers.starter) {
    console.log(`
Next:
${nextSteps(projectDir, answers).map((line) => `  ${line}`).join("\n")}
`);
    return;
  }
  let start = Boolean(options.start);
  if (!start && interactive && asksToStart(answers)) {
    try {
      start = await arrowSelect({
        message: "Start it now?",
        choices: [
          {
            title: "Yes, start it",
            value: "yes",
            hint: "Downloads what it needs, then runs it."
          },
          { title: "No, I'll do it later", value: "no", hint: "Shows the commands instead." }
        ]
      }) === "yes";
    } catch (error) {
      if (!(error instanceof PromptCancelled))
        throw error;
      start = false;
    }
  }
  if (!start) {
    console.log(`
Next:
${nextSteps(projectDir, answers, services).map((line) => `  ${line}`).join("\n")}
`);
    return;
  }
  const missing = startBlockers(answers);
  if (missing.length > 0) {
    throw new FliskError(`The project is created, but it cannot start yet: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not installed.`, [
      ...installHelp(missing).map((line) => line.trim()),
      `Then, in ${JSON.stringify(projectDir)}: ${[
        ...services.flatMap((service) => service.install ? [`(cd ${service.dir} && ${service.install})`] : []),
        "flisk up"
      ].join(" ; ")}`
    ]);
  }
  const defaultInstall = getBackendLanguage(DEFAULT_BACKEND_LANGUAGE).installHint;
  if (answers.runtime === "local") {
    for (const service of services) {
      if (!service.install)
        continue;
      const words = splitCommand(service.install);
      const wanted = words[0] ?? "npm";
      const program = wanted === "npm" && !findOnPath("npm") ? defaultInstall.split(" ")[0] ?? "npm" : wanted;
      const label = [program, ...words.slice(1)].join(" ");
      process.stdout.write(`  Installing ${service.dir} (${label})... `);
      const [exe, args] = isWindows() ? ["cmd.exe", ["/d", "/s", "/c", program, ...words.slice(1)]] : [program, words.slice(1)];
      const run = spawnSync(exe, args, { cwd: join(projectDir, service.dir), stdio: "ignore" });
      if (run.error || run.status !== 0) {
        console.log(source_default.red("failed"));
        throw new FliskError(`"${label}" did not finish in ${service.dir}.`, [
          "The project is created and complete; only the install needs a retry.",
          `Run it yourself: cd ${answers.name}/${service.dir} && ${label}`
        ]);
      }
      console.log(source_default.green("done"));
    }
  } else {
    process.stdout.write("  Installing dependencies... ");
    const installs = await installServiceDependencies(projectDir);
    const failed = installs.filter((entry) => !entry.ok);
    if (failed.length > 0) {
      console.log(source_default.red("failed"));
      throw new FliskError(`${failed.length} of ${installs.length} services could not install.`, [
        "The project is created and complete; only the install needs a retry.",
        `Run "${defaultInstall}" in ${join(projectDir, failed[0]?.dir ?? "")}, then flisk up app in ${projectDir}.`
      ]);
    }
    console.log(source_default.green("done"));
  }
  const open = answers.runtime === "local" ? whereToOpen(services) : void 0;
  if (open)
    console.log(`
${source_default.bold(open)}
`);
  const upArgs = answers.runtime === "docker" ? ["up", "app"] : ["up"];
  const [command, ...prefix] = invocation;
  const up = spawnSync(command, [...prefix, ...upArgs], {
    cwd: projectDir,
    stdio: "inherit"
  });
  if (up.status !== 0) {
    throw new FliskError(`"flisk ${upArgs.join(" ")}" did not finish.`, [
      `The project is created. Run "flisk doctor" in ${projectDir} to see what is missing, then flisk ${upArgs.join(" ")}.`
    ]);
  }
}

export {
  installHelp,
  isInteractive,
  collectAnswers,
  assertFolderIsFree,
  claimFolder,
  renderStep,
  reviewLines,
  splitCommand,
  localInstallHint,
  generatedServices,
  startBlockers,
  firstPort,
  whereToOpen,
  nextSteps,
  recoveryMessage,
  createCommand
};
