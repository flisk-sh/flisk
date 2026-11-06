import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/chalk@6.0.1/node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, postfix) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + postfix;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const isGotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, isGotCR ? index - 1 : index) + prefix + (isGotCR ? "\r\n" : "\n") + postfix;
    endIndex = index + 1;
    index = string.indexOf("\n", endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/chalk@6.0.1/node_modules/chalk/source/vendor/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET = 10;
var ANSI_UNDERLINE_OFFSET = 20;
var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var wrapUnderlineAnsi = (code) => `\x1B[58;5;${code < 90 ? code - 30 : code - 90 + 8}m`;
var styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    // Extended underline styles (`SGR 4:x` sub-parameters). Not in upstream `ansi-styles`.
    underlineDouble: ["4:2", 24],
    underlineCurly: ["4:3", 24],
    underlineDotted: ["4:4", 24],
    underlineDashed: ["4:5", 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  },
  // Underline color (`SGR 58`/`59`). Not in upstream `ansi-styles`.
  underlineColor: {
    underlineBlack: ["58;5;0", 59],
    underlineRed: ["58;5;1", 59],
    underlineGreen: ["58;5;2", 59],
    underlineYellow: ["58;5;3", 59],
    underlineBlue: ["58;5;4", 59],
    underlineMagenta: ["58;5;5", 59],
    underlineCyan: ["58;5;6", 59],
    underlineWhite: ["58;5;7", 59],
    // Bright color
    underlineBlackBright: ["58;5;8", 59],
    underlineGray: ["58;5;8", 59],
    // Alias of `underlineBlackBright`
    underlineGrey: ["58;5;8", 59],
    // Alias of `underlineBlackBright`
    underlineRedBright: ["58;5;9", 59],
    underlineGreenBright: ["58;5;10", 59],
    underlineYellowBright: ["58;5;11", 59],
    underlineBlueBright: ["58;5;12", 59],
    underlineMagentaBright: ["58;5;13", 59],
    underlineCyanBright: ["58;5;14", 59],
    underlineWhiteBright: ["58;5;15", 59]
  }
};
var modifierNames = Object.keys(styles.modifier);
var foregroundColorNames = Object.keys(styles.color);
var backgroundColorNames = Object.keys(styles.bgColor);
var underlineColorNames = Object.keys(styles.underlineColor);
var colorNames = [...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(Number.parseInt(style[0], 10), style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.underlineColor.close = "\x1B[59m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  styles.underlineColor.ansi = wrapUnderlineAnsi;
  styles.underlineColor.ansi256 = wrapAnsi256(ANSI_UNDERLINE_OFFSET);
  styles.underlineColor.ansi16m = wrapAnsi16m(ANSI_UNDERLINE_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[\da-f]{6}|[\da-f]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise -- We need the speed */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ansiStyles = assembleStyles();
var ansi_styles_default = ansiStyles;

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/chalk@6.0.1/node_modules/chalk/source/vendor/supports-color/index.js
import process2 from "node:process";
import os from "node:os";
import tty from "node:tty";
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process2.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
var { env } = process2;
var flagForceColor;
if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
  flagForceColor = 0;
} else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
  flagForceColor = 1;
}
function hasNumericForceColor() {
  return /^\d+$/.test(env.FORCE_COLOR);
}
function envForceColor() {
  if (!("FORCE_COLOR" in env)) {
    return;
  }
  if (env.FORCE_COLOR === "false") {
    return 0;
  }
  if (env.FORCE_COLOR === "true" || env.FORCE_COLOR.length === 0) {
    return 1;
  }
  if (!hasNumericForceColor()) {
    return;
  }
  return Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== void 0) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if (forceColor !== void 0 && hasNumericForceColor()) {
    return forceColor;
  }
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === void 0) {
    return 0;
  }
  const min = forceColor || 0;
  if (env.TERM === "dumb") {
    return min;
  }
  if (process2.platform === "win32") {
    const osRelease2 = os.release().split(".");
    if (Number(osRelease2[0]) >= 10 && Number(osRelease2[2]) >= 10586) {
      return Number(osRelease2[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env)) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env) {
    return /^(?:9\.0*[1-9]\d*\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env.COLORTERM === "truecolor") {
    return 3;
  }
  if (env.TERM === "xterm-kitty") {
    return 3;
  }
  if (env.TERM === "xterm-ghostty") {
    return 3;
  }
  if (env.TERM === "wezterm") {
    return 3;
  }
  if ("TERM_PROGRAM" in env) {
    const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".", 1)[0], 10);
    switch (env.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(?:color)?$/i.test(env.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var supportsColor = {
  stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
  stderr: createSupportsColor({ isTTY: tty.isatty(2) })
};
var supports_color_default = supportsColor;

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/chalk@6.0.1/node_modules/chalk/source/index.js
var { stdout: stdoutColor, stderr: stderrColor } = supports_color_default;
var GENERATOR = /* @__PURE__ */ Symbol("GENERATOR");
var STYLER = /* @__PURE__ */ Symbol("STYLER");
var IS_EMPTY = /* @__PURE__ */ Symbol("IS_EMPTY");
var LEVEL = /* @__PURE__ */ Symbol("LEVEL");
var styles2 = /* @__PURE__ */ Object.create(null);
var assertValidLevel = (level) => {
  if (!Number.isSafeInteger(level) || level < 0 || level > 3) {
    throw new Error("The `level` should be an integer from 0 to 3");
  }
};
var levelDescriptor = {
  enumerable: true,
  get() {
    return this[LEVEL];
  },
  set(level) {
    assertValidLevel(level);
    this[LEVEL] = level;
  }
};
var applyOptions = (object, options = {}) => {
  if (options.level !== void 0) {
    assertValidLevel(options.level);
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object[LEVEL] = options.level === void 0 ? colorLevel : options.level;
};
var chalkFactory = (options) => {
  const chalk2 = (...strings) => strings.join(" ");
  applyOptions(chalk2, options);
  Object.setPrototypeOf(chalk2, createChalk.prototype);
  return chalk2;
};
function createChalk(options) {
  return chalkFactory(options);
}
Object.setPrototypeOf(createChalk.prototype, Function.prototype);
for (const [styleName, style] of Object.entries(ansi_styles_default)) {
  styles2[styleName] = {
    get() {
      const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    }
  };
}
styles2.visible = {
  get() {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  }
};
var createModelConverters = (model, type) => {
  const style = ansi_styles_default[type];
  if (model === "rgb") {
    const ansi2 = (red, green, blue) => style.ansi(ansi_styles_default.rgbToAnsi(red, green, blue));
    const ansi256 = (red, green, blue) => style.ansi256(ansi_styles_default.rgbToAnsi256(red, green, blue));
    return [ansi2, ansi2, ansi256, style.ansi16m];
  }
  if (model === "hex") {
    const ansi2 = (hex) => style.ansi(ansi_styles_default.hexToAnsi(hex));
    const ansi256 = (hex) => style.ansi256(ansi_styles_default.hexToAnsi256(hex));
    return [ansi2, ansi2, ansi256, (hex) => style.ansi16m(...ansi_styles_default.hexToRgb(hex))];
  }
  const ansi = (code) => style.ansi(ansi_styles_default.ansi256ToAnsi(code));
  return [ansi, ansi, style.ansi256, style.ansi256];
};
var usedModels = ["rgb", "hex", "ansi256"];
for (const model of usedModels) {
  const capitalizedModel = model[0].toUpperCase() + model.slice(1);
  for (const [styleName, type] of [
    [model, "color"],
    ["bg" + capitalizedModel, "bgColor"],
    ["underline" + capitalizedModel, "underlineColor"]
  ]) {
    const { close } = ansi_styles_default[type];
    const converters = createModelConverters(model, type);
    styles2[styleName] = {
      get() {
        const styleFunction = function(first, second, third) {
          const open = converters[this.level](first, second, third);
          return createBuilder(this, createStyler(open, close, this[STYLER]), this[IS_EMPTY]);
        };
        Object.defineProperty(this, styleName, { value: styleFunction });
        return styleFunction;
      }
    };
  }
}
var proto = Object.defineProperties(
  () => {
  },
  {
    ...styles2,
    level: {
      enumerable: true,
      get() {
        return this[GENERATOR].level;
      },
      set(level) {
        this[GENERATOR].level = level;
      }
    }
  }
);
var createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === void 0) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
};
var createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => {
    if (arguments_.length === 1) {
      return applyStyle(builder, "" + arguments_[0]);
    }
    if (arguments_.length === 2) {
      return applyStyle(builder, `${arguments_[0] ?? ""} ${arguments_[1] ?? ""}`);
    }
    return applyStyle(builder, arguments_.join(" "));
  };
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self[GENERATOR] ?? self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
};
var applyStyle = (self, string) => {
  if (self[GENERATOR][LEVEL] <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === void 0) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== void 0) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf("\n");
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
};
Object.defineProperties(createChalk.prototype, { ...styles2, level: levelDescriptor });
var chalk = createChalk();
var chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
var source_default = chalk;

// package.json
var package_default = {
  name: "flisk-cli-internal",
  private: true,
  version: "1.4.37",
  description: "Flisk: your whole app, running on your computer with one command.",
  keywords: [
    "flisk",
    "tilt",
    "cli",
    "local-dev",
    "microservices"
  ],
  homepage: "https://github.com/flisk-sh/flisk#readme",
  bugs: {
    url: "https://github.com/flisk-sh/flisk/issues"
  },
  repository: {
    type: "git",
    url: "git+https://github.com/flisk-sh/flisk.git",
    directory: "cli"
  },
  license: "MIT",
  author: "Flisk Team",
  type: "module",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  bin: {
    flisk: "bin/flisk.js"
  },
  files: [
    "dist",
    "dist-bundle",
    "bin",
    "templates",
    "README.md",
    "Tiltfile",
    "engine",
    "discovery",
    "specs",
    "ext",
    "!ext/ide-components/code_executor",
    "shared-platform-engineering/docker-templates"
  ],
  scripts: {
    build: "tsc && node scripts/bundle.mjs",
    "build:watch": "tsc --watch",
    "check:dist": "npm run build && ../scripts/check-cli-dist.sh",
    lint: "biome check . ../tests/generated ../tests/runtime-layout",
    "lint:fix": "biome check . ../tests/generated ../tests/runtime-layout --write",
    typecheck: "tsc --project tsconfig.typecheck.json",
    clean: "rm -rf dist",
    dev: "bun run build:watch",
    test: "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage --coverage.reportOnFailure --coverage.reporter=text --coverage.reporter=html --coverage.reporter=json-summary --coverage.reporter=json --coverage.thresholds.lines=57 --coverage.reportsDirectory=coverage --reporter=default --reporter=json --outputFile.json=test-results/vitest.json",
    prepack: "../scripts/stage-npm-engine.sh && npm run build"
  },
  dependencies: {
    commander: "^15.0.0"
  },
  devDependencies: {
    "@biomejs/biome": "^2.5.13",
    "@types/node": "^26.6.5",
    "@types/react": "^19.3.0",
    "@vitest/coverage-v8": "5.1.0",
    ajv: "^8.17.1",
    chalk: "^6.0.1",
    esbuild: "^0.28.2",
    ink: "^8.0.0",
    knip: "^6.38.0",
    react: "^19.3.0",
    "react-devtools-core": "^8.0.0",
    typescript: "^7.0.2",
    vite: "^8.3.3",
    vitest: "5.1.0"
  },
  engines: {
    node: ">=22.12.0"
  }
};

// dist/utils/constants.js
var CONTAINER_RUNTIME_CHECK = "Container Runtime";
var BRING_YOUR_OWN_TYPE = "bring-your-own";
var DATABASE_MANAGEMENT_FEATURE = "database-management";
var TILTIGNORE_FILE = ".tiltignore";
var SERVICE_JSON = "service.json";
var DOCKER_COMPOSE_FILE = "docker-compose.yml";
var AUTOGENERATED_DIR = ".autogenerated";
var TECH_STACK_FILE = "TILT_TECH_STACK.star";
var RESOURCE_DEFAULTS_FILE = "TILT_RESOURCE_DEFAULTS.star";
var PROJECT_JSON = "project.json";
var PACKAGE_JSON = "package.json";
var MASTER_CONFIG_FILES = [
  TECH_STACK_FILE,
  RESOURCE_DEFAULTS_FILE,
  "spec.master"
];
var VALID_RESOURCE_TYPES = [
  "backend",
  "frontend",
  "library",
  "sdk",
  "worker",
  "migrator",
  "mcp",
  "agent",
  "database",
  BRING_YOUR_OWN_TYPE
];
var REQUIRED_PACKAGE_SCRIPTS = {
  backend: ["dev", "build", "start"],
  worker: ["dev", "build", "start"],
  migrator: ["dev", "build", "start"],
  mcp: ["dev", "build", "start"],
  agent: ["dev", "build", "start"],
  frontend: ["dev", "build"],
  library: ["dev", "build"],
  sdk: ["dev", "build"],
  database: [],
  [BRING_YOUR_OWN_TYPE]: []
};
var OPTIONAL_INFRA_SERVICES = [
  "monitoring",
  "elk",
  "debezium",
  "golden_image",
  "verdaccio"
];
var PORT_RANGES = {
  frontend: { base: 3e3, min: 3e3, max: 3999, range: "3000-3999" },
  backend: { base: 4e3, min: 4e3, max: 4999, range: "4000-4999" },
  // An MCP server is an HTTP service, so it shares the backend-compatible range with bring-your-own.
  mcp: { base: 4e3, min: 4e3, max: 5999, range: "4000-5999" },
  // An agent serves /health and /ready over HTTP (see agent-runtimes/custom.ts), so it shares the same range.
  agent: { base: 4e3, min: 4e3, max: 5999, range: "4000-5999" },
  [BRING_YOUR_OWN_TYPE]: { base: 4e3, min: 4e3, max: 5999, range: "4000-5999" },
  worker: { base: 6e3, min: 6e3, max: 6999, range: "6000-6999" },
  health: { base: 5e3, min: 5e3, max: 5999, range: "5000-5999" },
  migrator: { base: 7e3, min: 7e3, max: 7999, range: "7000-7999" }
};
var STANDARD_PORTS = {
  tiltUi: 10350,
  traefik: 8080
};
var QUICKSTART_DOCS_URL = "https://flisk.sh/docs/quickstart/";
var SKIP_DIRECTORIES = [
  "node_modules",
  ".git",
  ".tilt",
  ".tilt-engine",
  "dist",
  "build",
  ".prisma",
  ".turbo",
  "coverage",
  "tmp",
  "temp",
  "__tests__",
  "test",
  "tests",
  ".github",
  ".vscode",
  "docs"
];
var AUTOGENERATED_FILE_PATTERNS = [
  "Dockerfile",
  DOCKER_COMPOSE_FILE,
  "docker-compose.yaml",
  "Tiltfile",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.build.json"
];
var STACK_EMOJIS = {
  infra: "\u{1F3D7}\uFE0F",
  core: "\u{1F527}",
  api: "\u26A1",
  app: "\u{1F3A8}",
  orchestrator: "\u2699\uFE0F"
};
function getStackEmoji(stackName) {
  const lowerName = stackName.toLowerCase();
  for (const [key, emoji] of Object.entries(STACK_EMOJIS)) {
    if (lowerName.includes(key)) {
      return emoji;
    }
  }
  return "\u{1F4E6}";
}

// dist/utils/paths.js
import { existsSync as existsSync2 } from "node:fs";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "node:path";
import { cwd } from "node:process";

// dist/utils/build-info.js
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __fliskModuleUrl = new URL("../dist/utils/build-info.js", import.meta.url).href;
var buildInfoCache;
var __filename = fileURLToPath(__fliskModuleUrl);
var __dirname = dirname(__filename);
function findBuildInfoFile() {
  if (process.env.FLISK_BUILD_INFO_PATH !== void 0) {
    return process.env.FLISK_BUILD_INFO_PATH;
  }
  if (process.env.FLISK_BUILD_INFO_FILE !== void 0) {
    return process.env.FLISK_BUILD_INFO_FILE;
  }
  const cliRoot = resolve(__dirname, "..", "..");
  const distDir = resolve(__dirname, "..");
  const candidates = [
    join(cliRoot, "dist-bundle", "build-info.json"),
    join(distDir, "build-info.json"),
    join(cliRoot, "build-info.json"),
    join(__dirname, "build-info.json"),
    join(process.cwd(), "build-info.json"),
    join(process.cwd(), "node_modules", "@flisk-sh", "flisk", "build-info.json")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
function getBuildInfo(customPath) {
  if (!customPath && buildInfoCache !== void 0) {
    return buildInfoCache;
  }
  const filePath = customPath ?? findBuildInfoFile();
  if (!filePath || !existsSync(filePath)) {
    if (!customPath) {
      buildInfoCache = null;
    }
    return null;
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const candidates = [parsed.commit, parsed.commitSha, parsed.sha];
    let commit = "";
    for (const val of candidates) {
      if (typeof val === "string" && val.trim().length > 0) {
        commit = val.trim();
        break;
      }
    }
    if (!commit) {
      if (!customPath)
        buildInfoCache = null;
      return null;
    }
    const info = {
      ...parsed,
      commit,
      commitSha: commit
    };
    if (!customPath) {
      buildInfoCache = info;
    }
    return info;
  } catch {
    if (!customPath) {
      buildInfoCache = null;
    }
    return null;
  }
}
function getBuildCommit(customPath) {
  if (process.env.FLISK_BUILD_COMMIT?.trim()) {
    return process.env.FLISK_BUILD_COMMIT.trim();
  }
  const info = getBuildInfo(customPath);
  if (info?.commit && info.commit !== "unknown") {
    return info.commit;
  }
  if (process.env.GITHUB_SHA?.trim()) {
    return process.env.GITHUB_SHA.trim();
  }
  return "unknown";
}

// dist/utils/paths.js
function findProjectRoot(startDir = cwd()) {
  let currentDir = resolve2(startDir);
  const root = resolve2("/");
  while (currentDir !== root) {
    if (existsSync2(join2(currentDir, ".flisk", PROJECT_JSON))) {
      return currentDir;
    }
    const parentDir = dirname2(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}
var packageCache = null;
function getPackageInfo() {
  if (packageCache) {
    return packageCache;
  }
  const parsed = package_default;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid package.json: expected object");
  }
  const packageInfo = parsed;
  packageCache = {
    name: String(packageInfo.name ?? "@flisk-sh/flisk"),
    version: String(packageInfo.version ?? "0.0.0"),
    fullPackage: packageInfo
  };
  return packageCache;
}
function getPackageVersion() {
  return getPackageInfo().version;
}

// dist/utils/which.js
import { existsSync as existsSync3 } from "node:fs";
import { delimiter as delimiter2, extname as extname2, join as join3 } from "node:path";

// dist/utils/platform.js
import { release as osRelease } from "node:os";
import { delimiter, extname } from "node:path";
function isWindows() {
  return process.platform === "win32";
}
function fliskOsFor(platformName) {
  if (platformName === "linux")
    return "linux";
  if (platformName === "darwin")
    return "darwin";
  if (platformName === "win32")
    return "windows";
  return null;
}
function fliskArchFor(architecture) {
  if (architecture === "x64")
    return "amd64";
  if (architecture === "arm64")
    return "arm64";
  return null;
}
function binaryAssetNameFor(platformName, architecture) {
  const osName = fliskOsFor(platformName);
  const archName = fliskArchFor(architecture);
  if (!osName || !archName)
    return null;
  if (osName === "windows" && archName !== "amd64")
    return null;
  const base = `flisk-${osName}-${archName}`;
  return osName === "windows" ? `${base}.exe` : base;
}
function binaryAssetName() {
  return binaryAssetNameFor(process.platform, process.arch);
}
function executableName() {
  return isWindows() ? "flisk.exe" : "flisk";
}
function pathLookups(binName, windows = isWindows()) {
  if (!windows)
    return [binName];
  if (extname(binName))
    return [binName];
  return [binName, `${binName}.exe`, `${binName}.cmd`, `${binName}.bat`];
}
function isWsl(probe = {}) {
  const platform = probe.platform ?? process.platform;
  if (platform !== "linux")
    return false;
  const env2 = probe.env ?? process.env;
  if (env2.WSL_DISTRO_NAME || env2.WSL_INTEROP)
    return true;
  return /microsoft|wsl/i.test(probe.release ?? osRelease());
}

// dist/utils/which.js
function findOnPath(command) {
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const windows = isWindows();
  const names = pathLookups(command, windows);
  if (windows && !extname2(command)) {
    for (const extension of (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")) {
      const suffix = extension.toLowerCase();
      if (suffix && !names.includes(`${command}${suffix}`))
        names.push(`${command}${suffix}`);
    }
  }
  for (const dir of pathEnv.split(delimiter2)) {
    if (!dir)
      continue;
    for (const name of names) {
      const candidate = join3(dir, name);
      if (existsSync3(candidate))
        return candidate;
    }
  }
  return null;
}
function findAllOnPath(command) {
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const windows = isWindows();
  const names = pathLookups(command, windows);
  if (windows && !extname2(command)) {
    for (const extension of (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")) {
      const suffix = extension.toLowerCase();
      if (suffix && !names.includes(`${command}${suffix}`))
        names.push(`${command}${suffix}`);
    }
  }
  const found = [];
  const seen = /* @__PURE__ */ new Set();
  for (const dir of pathEnv.split(delimiter2)) {
    if (!dir)
      continue;
    for (const name of names) {
      const candidate = join3(dir, name);
      if (!existsSync3(candidate))
        continue;
      const key = windows ? candidate.toLowerCase() : candidate;
      if (!seen.has(key)) {
        seen.add(key);
        found.push(candidate);
      }
    }
  }
  return found;
}

// dist/utils/docker.js
import { execFileSync, execSync } from "node:child_process";
var RUNTIME_CHECK_TIMEOUT_MS = 1e4;
function getContainerRuntimeStatus() {
  let sawTimeout = false;
  if (process.platform === "win32") {
    try {
      execFileSync(findOnPath("docker") ?? "docker", ["ps"], {
        stdio: "ignore",
        timeout: RUNTIME_CHECK_TIMEOUT_MS,
        windowsHide: true
      });
      return "running";
    } catch (err) {
      return err.code === "ETIMEDOUT" ? "unresponsive" : "missing";
    }
  }
  for (const command of ["docker ps", "colima status", "podman ps"]) {
    try {
      execSync(command, { stdio: "ignore", timeout: RUNTIME_CHECK_TIMEOUT_MS });
      return "running";
    } catch (err) {
      if (err.code === "ETIMEDOUT")
        sawTimeout = true;
    }
  }
  return sawTimeout ? "unresponsive" : "missing";
}

// dist/utils/last-error.js
var lastShown;
function rememberShownError(error) {
  lastShown = error;
}
function lastShownError() {
  return lastShown;
}

// dist/utils/suggestions.js
function cell(row, index) {
  return row[index] ?? 0;
}
function levenshteinDistance(left, right) {
  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const currentRow = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(cell(currentRow, rightIndex - 1) + 1, cell(previousRow, rightIndex) + 1, cell(previousRow, rightIndex - 1) + substitutionCost);
    }
    previousRow = currentRow;
  }
  return cell(previousRow, right.length);
}
function isAdjacentTransposition(left, right) {
  if (left.length !== right.length)
    return false;
  for (let index = 0; index < left.length - 1; index++) {
    if (left[index] !== right[index] && left[index] === right[index + 1] && left[index + 1] === right[index] && left.slice(0, index) === right.slice(0, index) && left.slice(index + 2) === right.slice(index + 2)) {
      return true;
    }
  }
  return false;
}
function suggestClosest(input, candidates) {
  if (input.length < 2 || candidates.length === 0)
    return void 0;
  if (candidates.includes(input))
    return void 0;
  const normalizedInput = input.toLowerCase();
  let closest;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.length === 0)
      continue;
    const normalizedCandidate = candidate.toLowerCase();
    const distance = isAdjacentTransposition(normalizedInput, normalizedCandidate) ? 1 : levenshteinDistance(normalizedInput, normalizedCandidate);
    const threshold = Math.max(1, Math.min(2, Math.floor(Math.max(normalizedInput.length, normalizedCandidate.length) / 3)));
    if (distance > threshold)
      continue;
    if (distance < closestDistance || distance === closestDistance && (closest === void 0 || candidate < closest)) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

// dist/utils/tilt.js
import { spawn } from "node:child_process";
import { join as join4 } from "node:path";
function runTilt(command, args = [], options = {}) {
  return new Promise((resolve3, reject) => {
    const tiltArgs = [command, ...args];
    if (options.verbose) {
      console.log(`Executing: tilt ${tiltArgs.join(" ")}`);
    }
    const child = spawn(findOnPath("tilt") ?? "tilt", tiltArgs, {
      stdio: options.inheritStdio ? "inherit" : "pipe",
      shell: false,
      windowsHide: process.platform === "win32",
      timeout: options.timeoutMs
    });
    let stdout = "";
    let stderr = "";
    if (!options.inheritStdio) {
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
    }
    child.on("close", (code) => {
      resolve3({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to spawn tilt: ${err.message}`));
    });
  });
}
async function isTiltAvailable() {
  try {
    const result = await runTilt("version", [], { inheritStdio: false, timeoutMs: 1e4 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
function getTiltfilePath() {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    throw errorFactories.notInProject();
  }
  return join4(projectRoot, ".flisk", ".flisk-out", "Tiltfile");
}
function addTiltfilePath(args) {
  const tiltfilePath = getTiltfilePath();
  args.push("-f", tiltfilePath);
}
function buildTiltUpArgs(serviceNames, options = {}) {
  const args = [];
  addTiltfilePath(args);
  if (options.focusTargets && options.focusTargets.length > 0) {
    args.push("--", `--focus=${options.focusTargets.join(",")}`);
  }
  args.push(...serviceNames);
  if (options.verbose && !options.quiet) {
    args.push("--verbose");
  }
  if (options.watch) {
    args.push("--watch");
  }
  return args;
}
function buildTiltDownArgs(options = {}) {
  const args = [];
  addTiltfilePath(args);
  if (options.focusTargets && options.focusTargets.length > 0) {
    args.push("--", `--focus=${options.focusTargets.join(",")}`);
  }
  return args;
}

// dist/utils/errors.js
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function logVerbose(message, err) {
  if (process.env.FLISK_VERBOSE) {
    const errMsg = err !== void 0 ? `: ${getErrorMessage(err)}` : "";
    console.warn(source_default.gray(`${message}${errMsg}`));
  }
}
var FliskError = class extends Error {
  suggestions;
  exitCode;
  constructor(message, suggestions = [], exitCode = 1) {
    super(message);
    this.name = "FliskError";
    this.suggestions = suggestions;
    this.exitCode = exitCode;
  }
  display() {
    showError(this.message, void 0, this.suggestions);
  }
  /** Display this error and exit the process with its exit code. */
  exit() {
    this.display();
    process.exit(this.exitCode);
  }
};
var ProcessExitError = class extends Error {
  code;
  constructor(code = 1) {
    super(`process.exit(${code})`);
    this.name = "ProcessExitError";
    this.code = code;
  }
};
function closestNameSuggestions(names, candidates, includeInput = false) {
  const suggestions = /* @__PURE__ */ new Set();
  for (const name of names) {
    const closest = suggestClosest(name, candidates);
    if (closest) {
      suggestions.add(includeInput ? `Did you mean "${closest}" for "${name}"?` : `Did you mean "${closest}"?`);
    }
  }
  return [...suggestions];
}
var errorFactories = {
  tiltNotInstalled: () => new FliskError("Tilt CLI is not installed", [
    "Install Tilt: `brew install tilt` (macOS)",
    "Or download from: https://docs.tilt.dev/install.html",
    "Verify with: `tilt version`",
    `Setup guide: ${QUICKSTART_DOCS_URL}`
  ]),
  dockerNotAvailable: () => new FliskError("Docker (or a compatible container runtime) is not running", [
    "Start Docker Desktop, then verify with: `docker ps`",
    "Or start Colima: `colima start`",
    "Or start the Docker service on Linux: `sudo systemctl start docker`",
    `Setup guide: ${QUICKSTART_DOCS_URL}`
  ]),
  dockerNotResponding: () => new FliskError("Docker is running but not responding (`docker ps` hung for 10s)", [
    "Quit and reopen Docker Desktop, or run `colima restart`",
    "Then verify with: `docker ps`"
  ]),
  stackNotFound: (name, stackNames = []) => new FliskError(`Stack "${name}" not found`, [
    ...closestNameSuggestions([name], stackNames),
    "Run `flisk stacks` to see available stacks",
    "Run `flisk stack` to assign resources to a stack"
  ]),
  resourceNotFound: (name, resourceNames = []) => new FliskError(`Resource "${name}" not found`, [
    ...closestNameSuggestions([name], resourceNames),
    "Run `flisk resources` to list all resources",
    "Check the resource name spelling"
  ]),
  unknownServices: (names, validNames) => {
    const suggestions = closestNameSuggestions(names, validNames, names.length > 1);
    return new FliskError(`Unknown service ${names.join(", ")}. Valid names: ${validNames.join(", ")}`, suggestions, 2);
  },
  directoryExists: (path) => new FliskError(`Directory already exists: ${path}`, [
    "Use `--path` to specify a different location",
    "Remove the existing directory if no longer needed"
  ]),
  invalidPath: (path) => new FliskError(`Invalid path: ${path}`, [
    "Path must be within the project directory",
    'Path cannot contain special characters like <>:"|?*'
  ]),
  notInProject: () => new FliskError("Could not find project root (no .flisk/project.json found)", [
    "Run this from within a Flisk project",
    "Run `flisk project --yes` to initialize a new project"
  ])
};
function requireProjectRoot() {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    return errorFactories.notInProject().exit();
  }
  return projectRoot;
}
function handleCommandError(err) {
  if (err instanceof FliskError) {
    err.exit();
  }
  showError(getErrorMessage(err));
  process.exit(1);
}
async function runCommand(action, options) {
  try {
    return await action();
  } catch (err) {
    if (err instanceof ProcessExitError) {
      throw err;
    }
    if (options?.verbose && err instanceof Error && err.stack) {
      console.error(source_default.gray(err.stack));
    }
    return handleCommandError(err);
  }
}
async function withTiltCheck(action, options) {
  const problems = [];
  const runtime = getContainerRuntimeStatus();
  if (runtime === "unresponsive") {
    problems.push(errorFactories.dockerNotResponding());
  } else if (runtime === "missing") {
    problems.push(errorFactories.dockerNotAvailable());
  }
  if (!await isTiltAvailable()) {
    problems.push(errorFactories.tiltNotInstalled());
  }
  if (problems.length > 0) {
    console.error(source_default.red(`
Flisk can't start - missing prerequisites:
`));
    problems.forEach((problem, i) => {
      if (i > 0)
        console.error("");
      problem.display();
    });
    console.error(source_default.gray(`
Run \`flisk doctor\` for a full environment check.`));
    process.exit(1);
  }
  return runCommand(action, options);
}
function showErrorAndExit(message, exitCode = 1, suggestions) {
  showError(message, void 0, suggestions);
  process.exit(exitCode);
}
function showError(message, context, suggestions) {
  rememberShownError({ message, suggestions: suggestions ?? [] });
  console.error(source_default.red(`\u274C ${message}`));
  if (context) {
    console.error(source_default.gray(`   ${context}`));
  }
  if (suggestions && suggestions.length > 0) {
    console.error(source_default.yellow("\n\u{1F4A1} Suggestions:"));
    for (const s of suggestions) {
      console.error(source_default.cyan(`   \u2192 ${s}`));
    }
  }
}
function handleTiltFailure(command, exitCode) {
  console.error(source_default.red(`
tilt ${command} failed with exit code ${exitCode}`));
  process.exit(exitCode);
}

export {
  foregroundColorNames,
  source_default,
  package_default,
  CONTAINER_RUNTIME_CHECK,
  BRING_YOUR_OWN_TYPE,
  DATABASE_MANAGEMENT_FEATURE,
  TILTIGNORE_FILE,
  SERVICE_JSON,
  DOCKER_COMPOSE_FILE,
  AUTOGENERATED_DIR,
  TECH_STACK_FILE,
  RESOURCE_DEFAULTS_FILE,
  PROJECT_JSON,
  PACKAGE_JSON,
  MASTER_CONFIG_FILES,
  VALID_RESOURCE_TYPES,
  REQUIRED_PACKAGE_SCRIPTS,
  OPTIONAL_INFRA_SERVICES,
  PORT_RANGES,
  STANDARD_PORTS,
  SKIP_DIRECTORIES,
  AUTOGENERATED_FILE_PATTERNS,
  getStackEmoji,
  getBuildCommit,
  findProjectRoot,
  getPackageVersion,
  isWindows,
  binaryAssetName,
  executableName,
  isWsl,
  findOnPath,
  findAllOnPath,
  lastShownError,
  suggestClosest,
  runTilt,
  isTiltAvailable,
  getTiltfilePath,
  buildTiltUpArgs,
  buildTiltDownArgs,
  getErrorMessage,
  logVerbose,
  FliskError,
  ProcessExitError,
  errorFactories,
  requireProjectRoot,
  handleCommandError,
  runCommand,
  withTiltCheck,
  showErrorAndExit,
  showError,
  handleTiltFailure
};
