// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateStarlark, tiltAvailable } from "../../test-support/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const frontendGenerator = join(
  repoRoot,
  "engine",
  "topologies",
  "tilt",
  "generators",
  "vite",
  "frontend.star",
);
const frontendTsconfigGenerator = join(
  repoRoot,
  "engine",
  "topologies",
  "tilt",
  "generators",
  "typescript",
  "frontend_tsconfig.star",
);
const frontendApiGenerators = join(
  repoRoot,
  "engine",
  "topologies",
  "tilt",
  "resources",
  "orchestrator",
  "generators",
  "frontend.star",
);
const envGenerators = join(
  repoRoot,
  "engine",
  "topologies",
  "tilt",
  "resources",
  "orchestrator",
  "generators",
  "env.star",
);
const viteLibraryTemplates = join(
  repoRoot,
  "engine",
  "topologies",
  "tilt",
  "generators",
  "vite",
  "templates.star",
);
const frontendValidators = join(
  repoRoot,
  "engine",
  "topologies",
  "tilt",
  "generators",
  "validators.star",
);
const hasTilt = tiltAvailable();
const temporaryDirs: string[] = [];

it("registers Vue Vite templates at the shared Starlark generator paths", () => {
  const generator = readFileSync(frontendGenerator, "utf-8");
  const vueTemplates = readFileSync(
    join(dirname(frontendGenerator), "frameworks", "vue.star"),
    "utf-8",
  );

  expect(generator).toContain("load('./frameworks/vue.star'");
  expect(generator).toContain("'vue': {");
  expect(generator).toContain("manifest.get('framework', 'react')");
  expect(generator).toContain("VITE_FRONTEND_CONFIG_PATH");
  expect(generator).toContain("VITE_FRONTEND_BUILD_CONFIG_PATH");
  expect(vueTemplates).toContain("VUE_VITE_FRONTEND =");
  expect(vueTemplates).toContain("VUE_VITE_FRONTEND_BUILD =");
  expect(vueTemplates.match(/@vitejs\/plugin-vue/g)).toHaveLength(2);
  expect(vueTemplates).not.toContain("@vitejs/plugin-react");
});

it("registers Svelte Vite templates at the shared Starlark generator paths", () => {
  const generator = readFileSync(frontendGenerator, "utf-8");
  const svelteTemplates = readFileSync(
    join(dirname(frontendGenerator), "frameworks", "svelte.star"),
    "utf-8",
  );

  expect(generator).toContain("load('./frameworks/svelte.star'");
  expect(generator).toContain("'svelte': {");
  expect(svelteTemplates).toContain("SVELTE_VITE_FRONTEND =");
  expect(svelteTemplates).toContain("SVELTE_VITE_FRONTEND_BUILD =");
  expect(svelteTemplates.match(/@sveltejs\/vite-plugin-svelte/g)).toHaveLength(2);
  expect(svelteTemplates).not.toContain("@vitejs/plugin-react");
  expect(svelteTemplates).not.toContain("@vitejs/plugin-vue");
});

it("registers Preact Vite templates at the shared Starlark generator paths", () => {
  const generator = readFileSync(frontendGenerator, "utf-8");
  const preactTemplates = readFileSync(
    join(dirname(frontendGenerator), "frameworks", "preact.star"),
    "utf-8",
  );

  expect(generator).toContain("load('./frameworks/preact.star'");
  expect(generator).toContain("'preact': {");
  expect(preactTemplates).toContain("PREACT_VITE_FRONTEND =");
  expect(preactTemplates).toContain("PREACT_VITE_FRONTEND_BUILD =");
  expect(preactTemplates.match(/@preact\/preset-vite/g)).toHaveLength(2);
  expect(preactTemplates).not.toContain("@vitejs/plugin-react");
});

it("registers Lit Vite templates at the shared Starlark generator paths", () => {
  const generator = readFileSync(frontendGenerator, "utf-8");
  const litTemplates = readFileSync(
    join(dirname(frontendGenerator), "frameworks", "lit.star"),
    "utf-8",
  );

  expect(generator).toContain("load('./frameworks/lit.star'");
  expect(generator).toContain("'lit': {");
  expect(litTemplates).toContain("LIT_VITE_FRONTEND =");
  expect(litTemplates).toContain("LIT_VITE_FRONTEND_BUILD =");
  expect(litTemplates).toContain("plugins: [],");
  expect(litTemplates).not.toContain("@vitejs/plugin-react");
});

it("registers Vanilla Vite templates at the shared Starlark generator paths", () => {
  const generator = readFileSync(frontendGenerator, "utf-8");
  const vanillaTemplates = readFileSync(
    join(dirname(frontendGenerator), "frameworks", "vanilla.star"),
    "utf-8",
  );

  expect(generator).toContain("load('./frameworks/vanilla.star'");
  expect(generator).toContain("'vanilla': {");
  expect(vanillaTemplates).toContain("VANILLA_VITE_FRONTEND =");
  expect(vanillaTemplates).toContain("VANILLA_VITE_FRONTEND_BUILD =");
  expect(vanillaTemplates).toContain("plugins: [],");
  expect(vanillaTemplates).not.toContain("@vitejs/plugin-react");
});

it("registers Solid Vite templates at the shared Starlark generator paths", () => {
  const generator = readFileSync(frontendGenerator, "utf-8");
  const solidTemplates = readFileSync(
    join(dirname(frontendGenerator), "frameworks", "solid.star"),
    "utf-8",
  );

  expect(generator).toContain("load('./frameworks/solid.star'");
  expect(generator).toContain("'solid': {");
  expect(solidTemplates).toContain("SOLID_VITE_FRONTEND =");
  expect(solidTemplates).toContain("SOLID_VITE_FRONTEND_BUILD =");
  expect(solidTemplates.match(/vite-plugin-solid/g)).toHaveLength(2);
  expect(solidTemplates).not.toContain("@vitejs/plugin-react");
});

it("registers Qwik Vite templates at the shared Starlark generator paths", () => {
  const generator = readFileSync(frontendGenerator, "utf-8");
  const qwikTemplates = readFileSync(
    join(dirname(frontendGenerator), "frameworks", "qwik.star"),
    "utf-8",
  );

  expect(generator).toContain("load('./frameworks/qwik.star'");
  expect(generator).toContain("'qwik': {");
  expect(qwikTemplates).toContain("QWIK_VITE_FRONTEND =");
  expect(qwikTemplates).toContain("QWIK_VITE_FRONTEND_BUILD =");
  expect(qwikTemplates.match(/qwikVite\(\{\{ csr: true \}\}\)/g)).toHaveLength(2);
  expect(qwikTemplates).not.toContain("@vitejs/plugin-react");
});

it("passes the persisted framework to the shared frontend TypeScript generator", () => {
  const orchestrator = readFileSync(
    join(
      repoRoot,
      "engine",
      "topologies",
      "tilt",
      "resources",
      "orchestrator",
      "generators",
      "manifest_resource.star",
    ),
    "utf-8",
  );
  expect(orchestrator.match(/framework=manifest\.get\('framework', 'react'\)/g)).toHaveLength(2);
  expect(readFileSync(frontendTsconfigGenerator, "utf-8")).toContain("if framework == 'react':");
});

it("selects the framework entry in generated frontend health checks", () => {
  const validators = readFileSync(frontendValidators, "utf-8");
  expect(validators).toContain(
    'manifest.get("framework", "react") in ["vue", "svelte", "lit", "vanilla"]',
  );
  expect(validators).toContain('"frontend": ["package.json", "index.html", frontend_entry]');
});

// A project root whose .tdk/project.json names the project, which is the npm scope and the local domain.
function projectRootNamed(name: string) {
  const directory = mkdtempSync(join(tmpdir(), "tdk-generator-project-"));
  temporaryDirs.push(directory);
  mkdirSync(join(directory, ".tdk"));
  writeFileSync(join(directory, ".tdk", "project.json"), JSON.stringify({ project: { name } }));
  return directory;
}

// Runs a Tiltfile that ends with fail('GENERATED_FILES_JSON=' + encode_json(files)) and returns those files by path.
// `tilt alpha tiltfile-result` drops print() output, while a fail() message reaches stderr on every platform.
function generatedFiles(source: string, projectRoot: string) {
  const result = evaluateStarlark(frontendGenerator, {
    args: source,
    env: { ...process.env, TDK_PROJECT_ROOT: projectRoot },
  });
  const marker = "GENERATED_FILES_JSON=";
  const line = result.stderr.split("\n").find((entry) => entry.includes(marker));
  expect(line, result.stderr).toBeDefined();
  return JSON.parse((line ?? "").slice((line ?? "").indexOf(marker) + marker.length)) as Record<
    string,
    string
  >;
}

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Each case spawns `tilt alpha tiltfile-result`, which takes several seconds under full-suite load.
describe.skipIf(!hasTilt)("Starlark frontend Vite generator", { timeout: 30_000 }, () => {
  it("uses the same React configs for explicit and legacy manifests at generated paths", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend', 'VITE_FRONTEND_CONFIG_PATH', 'VITE_FRONTEND_BUILD_CONFIG_PATH')
manifest = {'appType': 'frontend', 'appName': 'storefront', 'stack': 'shop', 'port': 3000, '_resource_path': 'apps/storefront'}
legacy_files = {}
def write_legacy(path, content):
    legacy_files[path] = content
legacy_config = generate_frontend(manifest, write_fn=write_legacy)
explicit_files = {}
def write_explicit(path, content):
    explicit_files[path] = content
explicit = dict(manifest)
explicit['framework'] = 'react'
explicit_config = generate_frontend(explicit, write_fn=write_explicit)
if legacy_config != explicit_config: fail('legacy React dev config changed')
if legacy_files != explicit_files: fail('legacy React generated files changed')
if len(legacy_files) != 2: fail('expected exactly two generated Vite configs')
if 'apps/storefront' + VITE_FRONTEND_CONFIG_PATH not in legacy_files: fail('missing dev config')
if 'apps/storefront' + VITE_FRONTEND_BUILD_CONFIG_PATH not in legacy_files: fail('missing build config')
if "@vitejs/plugin-react" not in legacy_config: fail('missing React plugin')
if "@vitejs/plugin-react" not in legacy_files['apps/storefront' + VITE_FRONTEND_BUILD_CONFIG_PATH]: fail('missing React build plugin')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects an unknown framework before writing Vite configs", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend')
def reject_writes(path, content):
    fail('unexpected write before framework validation')
generate_frontend({'appType': 'frontend', 'appName': 'storefront', 'framework': 'angular'}, write_fn=reject_writes)
`,
    });

    expect(result.status).toBe(5);
    expect(result.stderr).toContain("Unknown frontend framework for Vite generation: angular");
    expect(result.stderr).not.toContain("unexpected write before framework validation");
  });

  it("selects Vue plugin in both generated configs and retains shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend', 'VITE_FRONTEND_CONFIG_PATH', 'VITE_FRONTEND_BUILD_CONFIG_PATH')
manifest = {'appType': 'frontend', 'framework': 'vue', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated Vue Vite configs')
dev_path = 'apps/storefront' + VITE_FRONTEND_CONFIG_PATH
build_path = 'apps/storefront' + VITE_FRONTEND_BUILD_CONFIG_PATH
if dev_path not in files or build_path not in files: fail('Vue config paths differ from React')
for content in files.values():
    if "@vitejs/plugin-vue" not in content: fail('missing Vue plugin')
    if "@vitejs/plugin-react" in content: fail('React plugin leaked into Vue config')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
    if "'@': resolve(__dirname, '../src')" not in content: fail('missing source alias')
if "port: 3100" not in files[dev_path]: fail('missing shared dev port')
if 'proxy:' not in files[dev_path]: fail('missing shared proxy')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("selects Svelte plugin in both generated configs and retains shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend', 'VITE_FRONTEND_CONFIG_PATH', 'VITE_FRONTEND_BUILD_CONFIG_PATH')
manifest = {'appType': 'frontend', 'framework': 'svelte', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated Svelte Vite configs')
dev_path = 'apps/storefront' + VITE_FRONTEND_CONFIG_PATH
build_path = 'apps/storefront' + VITE_FRONTEND_BUILD_CONFIG_PATH
if dev_path not in files or build_path not in files: fail('Svelte config paths differ from React')
for content in files.values():
    if "@sveltejs/vite-plugin-svelte" not in content: fail('missing Svelte plugin')
    if "@vitejs/plugin-react" in content: fail('React plugin leaked into Svelte config')
    if "@vitejs/plugin-vue" in content: fail('Vue plugin leaked into Svelte config')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
    if "'@': resolve(__dirname, '../src')" not in content: fail('missing source alias')
if "port: 3100" not in files[dev_path]: fail('missing shared dev port')
if 'proxy:' not in files[dev_path]: fail('missing shared proxy')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("generates both Vite configs for TanStack Router with the React plugin and the shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend', 'VITE_FRONTEND_CONFIG_PATH', 'VITE_FRONTEND_BUILD_CONFIG_PATH')
manifest = {'appType': 'frontend', 'framework': 'tanstack-router', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated TanStack Router Vite configs')
for content in files.values():
    if "@vitejs/plugin-react" not in content: fail('missing React plugin')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
if 'proxy:' not in files['apps/storefront' + VITE_FRONTEND_CONFIG_PATH]: fail('missing shared proxy')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("selects the Solid plugin in both generated configs and retains shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend', 'VITE_FRONTEND_CONFIG_PATH', 'VITE_FRONTEND_BUILD_CONFIG_PATH')
manifest = {'appType': 'frontend', 'framework': 'solid', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated Solid Vite configs')
dev_path = 'apps/storefront' + VITE_FRONTEND_CONFIG_PATH
build_path = 'apps/storefront' + VITE_FRONTEND_BUILD_CONFIG_PATH
if dev_path not in files or build_path not in files: fail('Solid config paths differ from React')
for content in files.values():
    if "vite-plugin-solid" not in content: fail('missing Solid plugin')
    if "@vitejs/plugin-react" in content: fail('React plugin leaked into Solid config')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
    if "'@': resolve(__dirname, '../src')" not in content: fail('missing source alias')
if "port: 3100" not in files[dev_path]: fail('missing shared dev port')
if 'proxy:' not in files[dev_path]: fail('missing shared proxy')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("selects the Qwik plugin in both generated configs and retains shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend', 'VITE_FRONTEND_CONFIG_PATH', 'VITE_FRONTEND_BUILD_CONFIG_PATH')
manifest = {'appType': 'frontend', 'framework': 'qwik', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated Qwik Vite configs')
dev_path = 'apps/storefront' + VITE_FRONTEND_CONFIG_PATH
build_path = 'apps/storefront' + VITE_FRONTEND_BUILD_CONFIG_PATH
if dev_path not in files or build_path not in files: fail('Qwik config paths differ from React')
for content in files.values():
    if "qwikVite({ csr: true })" not in content: fail('missing Qwik plugin')
    if "@vitejs/plugin-react" in content: fail('React plugin leaked into Qwik config')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
    if "'@': resolve(__dirname, '../src')" not in content: fail('missing source alias')
if "port: 3100" not in files[dev_path]: fail('missing shared dev port')
if 'proxy:' not in files[dev_path]: fail('missing shared proxy')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("selects Preact preset in both generated configs and retains shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend', 'VITE_FRONTEND_CONFIG_PATH', 'VITE_FRONTEND_BUILD_CONFIG_PATH')
manifest = {'appType': 'frontend', 'framework': 'preact', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated Preact Vite configs')
dev_path = 'apps/storefront' + VITE_FRONTEND_CONFIG_PATH
build_path = 'apps/storefront' + VITE_FRONTEND_BUILD_CONFIG_PATH
if dev_path not in files or build_path not in files: fail('Preact config paths differ from React')
for content in files.values():
    if "@preact/preset-vite" not in content: fail('missing Preact preset')
    if "@vitejs/plugin-react" in content: fail('React plugin leaked into Preact config')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
    if "'@': resolve(__dirname, '../src')" not in content: fail('missing source alias')
if "port: 3100" not in files[dev_path]: fail('missing shared dev port')
if 'proxy:' not in files[dev_path]: fail('missing shared proxy')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });
});

describe.skipIf(!hasTilt)("Starlark frontend TypeScript generator", { timeout: 30_000 }, () => {
  it("generates plugin-free Lit configs in both modes and retains shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend')
manifest = {'appType': 'frontend', 'framework': 'lit', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated Lit Vite configs')
for content in files.values():
    if "plugins: []" not in content: fail('Lit must not load a framework plugin')
    if "@vitejs/plugin-react" in content: fail('React plugin leaked into Lit config')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
    if "'@': resolve(__dirname, '../src')" not in content: fail('missing source alias')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("generates plugin-free Vanilla configs in both modes and retains shared runtime settings", () => {
    const result = evaluateStarlark(frontendGenerator, {
      args: `load(${JSON.stringify(frontendGenerator)}, 'generate_frontend')
manifest = {'appType': 'frontend', 'framework': 'vanilla', 'appName': 'storefront', 'stack': 'shop', 'port': 3100, '_resource_path': 'apps/storefront'}
files = {}
def write_config(path, content):
    files[path] = content
generate_frontend(manifest, write_fn=write_config)
if len(files) != 2: fail('expected exactly two generated Vanilla Vite configs')
for content in files.values():
    if "plugins: []" not in content: fail('Vanilla must not load a framework plugin')
    if "@vitejs/plugin-react" in content: fail('React plugin leaked into Vanilla config')
    if "base: '/storefront/'" not in content: fail('missing shared base path')
    if "'@': resolve(__dirname, '../src')" not in content: fail('missing source alias')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("preserves legacy React JSX and omits it for Vue Docker builds", () => {
    const result = evaluateStarlark(frontendTsconfigGenerator, {
      args: `load(${JSON.stringify(frontendTsconfigGenerator)}, 'generate_frontend_tsconfig')
legacy = {}
def write_legacy(path, content):
    legacy[path] = content
generate_frontend_tsconfig('apps/storefront', write_legacy, is_docker=True)
react = {}
def write_react(path, content):
    react[path] = content
generate_frontend_tsconfig('apps/storefront', write_react, is_docker=True, framework='react')
vue = {}
def write_vue(path, content):
    vue[path] = content
generate_frontend_tsconfig('apps/storefront', write_vue, is_docker=True, framework='vue')
svelte = {}
def write_svelte(path, content):
    svelte[path] = content
generate_frontend_tsconfig('apps/storefront', write_svelte, is_docker=True, framework='svelte')
preact = {}
def write_preact(path, content):
    preact[path] = content
generate_frontend_tsconfig('apps/storefront', write_preact, is_docker=True, framework='preact')
preact_config = decode_json(preact[list(preact.keys())[0]])
if preact_config['compilerOptions'].get('jsx') != 'react-jsx': fail('missing Preact JSX setting')
if preact_config['compilerOptions'].get('jsxImportSource') != 'preact': fail('Preact must import its JSX runtime from preact')
if 'jsxImportSource' in react[list(react.keys())[0]]: fail('Preact JSX source leaked into React config')
solid = {}
def write_solid(path, content):
    solid[path] = content
generate_frontend_tsconfig('apps/storefront', write_solid, is_docker=True, framework='solid')
solid_config = decode_json(solid[list(solid.keys())[0]])
if solid_config['compilerOptions'].get('jsx') != 'preserve': fail('Solid JSX must be preserved for its compiler')
if solid_config['compilerOptions'].get('jsxImportSource') != 'solid-js': fail('Solid must import its JSX runtime from solid-js')
router = {}
def write_router(path, content):
    router[path] = content
generate_frontend_tsconfig('apps/storefront', write_router, is_docker=True, framework='tanstack-router')
if decode_json(router[list(router.keys())[0]])['compilerOptions'].get('jsx') != 'react-jsx': fail('TanStack Router JSX must be react-jsx')
qwik = {}
def write_qwik(path, content):
    qwik[path] = content
generate_frontend_tsconfig('apps/storefront', write_qwik, is_docker=True, framework='qwik')
qwik_config = decode_json(qwik[list(qwik.keys())[0]])
if qwik_config['compilerOptions'].get('jsx') != 'react-jsx': fail('Qwik JSX must be react-jsx')
if qwik_config['compilerOptions'].get('jsxImportSource') != '@builder.io/qwik': fail('Qwik must import its JSX runtime from @builder.io/qwik')
if legacy != react: fail('legacy React TypeScript config changed')
svelte_config = decode_json(svelte[list(svelte.keys())[0]])
if 'jsx' in svelte_config['compilerOptions']: fail('React JSX leaked into Svelte config')
if svelte_config['compilerOptions']['types'] != ['node']: fail('shared Node types changed for Svelte')
if len(vue) != 1: fail('expected one Docker TypeScript config')
path = list(vue.keys())[0]
if path not in react: fail('Vue Docker TypeScript config path differs from React')
react_config = decode_json(react[path])
vue_config = decode_json(vue[path])
if react_config['compilerOptions'].get('jsx') != 'react-jsx': fail('missing React JSX setting')
if 'jsx' in vue_config['compilerOptions']: fail('React JSX leaked into Vue config')
if vue_config['compilerOptions']['types'] != ['node']: fail('shared Node types changed')
if vue_config['compilerOptions']['moduleResolution'] != 'bundler': fail('frontend resolution must support current TypeScript')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });
});

describe.skipIf(!hasTilt)("Starlark frontend health check", { timeout: 30_000 }, () => {
  it("requires main.ts for Vue and Svelte and main.tsx for legacy React", () => {
    const result = evaluateStarlark(frontendValidators, {
      args: `load(${JSON.stringify(frontendValidators)}, 'generate_resource_health_check')
vue = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'vue'}, {})
if 'src/main.tsx' in vue or 'src/main.ts' not in vue: fail('Vue entry check is wrong')
svelte = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'svelte'}, {})
if 'src/main.tsx' in svelte or 'src/main.ts' not in svelte: fail('Svelte entry check is wrong')
preact = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'preact'}, {})
if 'src/main.tsx' not in preact: fail('Preact entry check is wrong')
lit = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'lit'}, {})
if 'src/main.tsx' in lit or 'src/main.ts' not in lit: fail('Lit entry check is wrong')
vanilla = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'vanilla'}, {})
if 'src/main.tsx' in vanilla or 'src/main.ts' not in vanilla: fail('Vanilla entry check is wrong')
solid = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'solid'}, {})
if 'src/main.tsx' not in solid: fail('Solid entry check is wrong')
qwik = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'qwik'}, {})
if 'src/main.tsx' not in qwik: fail('Qwik entry check is wrong')
router = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend', 'framework': 'tanstack-router'}, {})
if 'src/main.tsx' not in router: fail('TanStack Router entry check is wrong')
react = generate_resource_health_check('web', 'apps/web', {'appType': 'frontend'}, {})
if 'src/main.tsx' not in react: fail('legacy React entry check is wrong')
`,
    });

    expect(result.status, result.stderr).toBe(0);
  });
});

describe.skipIf(!hasTilt)("Starlark frontend API client generator", { timeout: 30_000 }, () => {
  it("imports the API client from the project npm scope", () => {
    const files = generatedFiles(
      `load(${JSON.stringify(frontendApiGenerators)}, 'generate_frontend_api_client')
files = {}
def write_file(path, content):
    files[path] = content
generate_frontend_api_client({'appType': 'frontend', 'appName': 'person-app', 'stack': 'people', '_resource_path': 'services/people/person-app'}, write_fn=write_file)
fail('GENERATED_FILES_JSON=' + encode_json(files).replace('\\n', ''))
`,
      projectRootNamed("acme-shop"),
    );
    const apiClient = files["services/people/person-app/.autogenerated/api-client.ts"];

    expect(apiClient).toBeDefined();
    expect(apiClient).not.toContain('" +');
    expect(apiClient).not.toContain("_NPM_SCOPE");
    expect(apiClient).toContain(
      "import { createApiClient } from '@acme-shop/platform-api-client';",
    );
  });

  it("points VITE_API_URL and the api-client fallback at the host Traefik routes", () => {
    const files = generatedFiles(
      `load(${JSON.stringify(frontendApiGenerators)}, 'generate_frontend_api_client', 'generate_frontend_env_ts')
load(${JSON.stringify(envGenerators)}, 'EnvGenerators')
files = {}
def write_file(path, content):
    files[path] = content
manifest = {'appType': 'frontend', 'appName': 'person-app', 'stack': 'people', 'dependsOn': ['billing-backend'], '_resource_path': 'app'}
generate_frontend_api_client(manifest, write_fn=write_file)
generate_frontend_env_ts(manifest, write_fn=write_file)
EnvGenerators.generate_params_env(manifest, write_fn=write_file)
fail('GENERATED_FILES_JSON=' + encode_json(files).replace('\\n', ''))
`,
      projectRootNamed("acme-shop"),
    );
    // Traefik's -management router: Host(`api.acme-shop.localhost`) && PathPrefix(`/api/people-management`).
    const routed = "http://api.acme-shop.localhost/api/people-management";

    expect(files["app/.autogenerated/.env.frontend.autogenerated"]).toContain(
      `VITE_API_URL=${routed}\n`,
    );
    expect(files["app/.autogenerated/.env.frontend.autogenerated"]).toContain(
      "VITE_BILLING_API_URL=http://api.acme-shop.localhost/api/billing-management\n",
    );
    expect(files["app/.autogenerated/api-client.ts"]).toContain(`|| '${routed}'`);
    expect(files["app/.autogenerated/env.ts"]).toContain(`|| '${routed}'`);
  });

  it("externalizes the project npm scope in the Vite library templates", () => {
    const files = generatedFiles(
      `load(${JSON.stringify(viteLibraryTemplates)}, 'TEMPLATE_VITE_LIBRARY', 'get_library_template')
files = {}
for name, template in [('library', TEMPLATE_VITE_LIBRARY), ('dev', get_library_template('dev')), ('prod', get_library_template('prod'))]:
    files[name] = template.format(header='', plugin_imports='', plugins_str='', lib_name='lib')
fail('GENERATED_FILES_JSON=' + encode_json(files).replace('\\n', ''))
`,
      projectRootNamed("acme-shop"),
    );

    expect(Object.keys(files)).toHaveLength(3);
    for (const config of Object.values(files)) {
      expect(config).not.toContain('" +');
      expect(config).toContain("/^@acme-shop\\/.*$/,");
    }
  });
});
