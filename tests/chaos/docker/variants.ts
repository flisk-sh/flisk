// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { Json } from "../gates/generate.js";

// One-field edits to a valid backend's service.json, good and bad, to find the ones `flisk up` accepts and Docker does not.
// `patch` is merged over the service.json; an `undefined` value deletes the key. `stack` is the stack the service ends up in.

export interface Variant {
  id: string;
  patch: Record<string, Json | undefined>;
  /** What we expect of a correct tool. `reject`: no gate-passing run may break Docker, and the gate should say no. */
  expect: "accept" | "reject";
  /** Leave the secret names of this variant out of .env, so a required one has no value. */
  noSecretValues?: boolean;
}

const v = (id: string, patch: Variant["patch"], expect: Variant["expect"]): Variant => ({
  id,
  patch,
  expect,
});

const bad = (field: string, values: Json[]): Variant[] =>
  values.map((value, index) =>
    v(`${field}#${index}=${JSON.stringify(value).slice(0, 40)}`, { [field]: value }, "reject"),
  );
const good = (field: string, values: Json[]): Variant[] =>
  values.map((value, index) =>
    v(`${field}#${index}=${JSON.stringify(value).slice(0, 40)}`, { [field]: value }, "accept"),
  );

export const VARIANTS: Variant[] = [
  v("baseline", {}, "accept"),

  // Names become Docker image repositories, Compose services, container names and Traefik routers.
  ...bad("appName", [
    "Orders",
    "my service",
    "ORDERS_API",
    "orders/api",
    "-orders",
    "orders-",
    "orders.",
    ".orders",
    "orders:tag",
    "orders@sha",
    "ünï",
    "a".repeat(60),
    "a".repeat(200),
    "orders__",
    "",
  ]),
  ...good("appName", ["orders-api", "orders2", "o", "a".repeat(59), "orders-v2-x", "orders--x"]),

  // Stack becomes part of the image name, the Compose project/service group and the database name.
  ...bad("stack", ["Shop", "MAIN", "back office", "a".repeat(120), "-x", "x-", "", "x/y", "x:y"]),
  ...good("stack", [
    "main",
    "extra2",
    "back-office",
    "back_office",
    "a".repeat(40),
    "a".repeat(63),
  ]),

  ...bad("port", [0, -1, 65536, 1.5, "4000", null, true, 1e21]),
  ...good("port", [1, 80, 4000, 65535]),

  ...bad("healthCheckPath", [
    "health",
    "/he alth",
    "/h'ealth",
    '/health"',
    "/a;b",
    "/{x}",
    "$(id)",
    "/A/B",
  ]),
  ...good("healthCheckPath", ["/", "/health", "/api/v1/health", "/a-b/c"]),

  ...bad("replicas", [0, -1, 1.5, "2", 100000]),
  v("replicas=null", { replicas: null }, "accept"),
  ...good("replicas", [1, 2, 3]),

  // Where the Dockerfile and its build context live.
  ...bad("dockerfile", [
    "../../../etc/passwd",
    "/etc/passwd",
    "does/not/exist/Dockerfile",
    "Docker file",
    "Dockerfile\nFROM x",
  ]),
  // An absolute build path can never resolve (the loader joins it to the service directory). `..` is allowed on purpose: a
  // service.json may build from a tree outside the project, which is what `flisk import` writes for a Compose app.
  ...bad("buildContext", ["/", "/etc"]),
  ...good("buildContext", ["..", "../..", "../../../", "src"]),
  v("build.context=..", { build: { dockerfile: "Dockerfile", context: ".." } }, "accept"),
  v("build.dockerfile=../x", { build: { dockerfile: "../x", context: "." } }, "accept"),
  v("build.dockerfile=abs", { build: { dockerfile: "/etc/passwd", context: "." } }, "reject"),
  v("build=string", { build: "Dockerfile" }, "reject"),
  v("build=null", { build: null }, "accept"),

  ...bad("appType", [7]),
  // An unknown appType string is not refused (real projects use legacy values such as "api") and nothing downstream breaks.
  ...good("appType", ["database", "Backend", "backend frontend"]),
  v("appType=empty", { appType: "" }, "accept"),
  v("appType=null", { appType: null }, "accept"),
  // A language other than bun needs that language's files (go.mod, pyproject.toml, ...), which this project does not have.
  ...bad("language", ["BUN", "bun;rm", 7]),
  ...good("language", ["bun"]),
  ...bad("featuresEnabled", [{ a: 1 }, [1], [null], ["x\ny"]]),
  ...good("featuresEnabled", [[], ["vitest"], ["vitest", "nats"], ["nats", "nats"]]),

  ...bad("basePath", ["storefront", "/Store Front", "/a b", "/a;b", "/A", "/x/../y"]),
  ...good("basePath", ["/storefront", "/a/b", "/"]),
  ...bad("apiPath", ["api", "/a b", "/a;b", 7]),

  v("traefik.host=bad", { traefik: { host: "bad host" } }, "reject"),
  v("traefik.host=ok", { traefik: { host: "shop.localhost" } }, "accept"),
  v("traefik.pathPrefix=bad", { traefik: { pathPrefix: "/a b" } }, "reject"),
  v("traefik=string", { traefik: "x" }, "reject"),

  v("env.newline", { env: { A: "x\ny: z" } }, "reject"),
  v("params.newline", { params: { A: "x\nprivileged: true" } }, "reject"),
  v("dev.command.quote", { dev: { command: 'echo "x' } }, "accept"),
  v("dev.command.newline", { dev: { command: "bun run dev\nRUN x" } }, "reject"),
  v("dev.watch.bad", { dev: { command: "bun run dev", watch: "src" } }, "reject"),
  v("dev.watch.abs", { dev: { command: "bun run dev", watch: ["/etc/**"] } }, "reject"),
  v("dev.liveReload=str", { dev: { liveReload: "yes" } }, "reject"),

  v("image+dockerfile", { image: "nginx:1", dockerfile: "Dockerfile" }, "reject"),
  v("image=bad", { image: "Not A Ref" }, "reject"),
  v("image=ok", { image: "nginx:1.27", build: undefined }, "accept"),
  v("schemaVersion=2", { schemaVersion: 2 }, "reject"),
  v("schemaVersion=str", { schemaVersion: "1" }, "reject"),
  v("dependsOn=string", { dependsOn: "postgres" }, "reject"),
  v("dependsOn=self", { dependsOn: ["$SELF"] }, "reject"),
  v("dependsOn=postgres", { dependsOn: ["postgres"] }, "accept"),
  v("dependsOn=unicode", { dependsOn: ["ünï"] }, "accept"),
  v("databaseName=bad", { databaseName: "a b" }, "reject"),
  v("databaseName=long", { databaseName: "d".repeat(100) }, "reject"),
  v("sablier=string", { sablier: "on" }, "reject"),
  v("nats.queueGroup=bad", { nats: { queueGroup: "a b" } }, "reject"),
  // restart is not enumerated (nothing downstream reads it), so an odd value is accepted and nothing breaks.
  v("restart=odd", { restart: "sometimes" }, "accept"),
  v("unknown.field", { totallyUnknown: { a: 1 } }, "accept"),

  // secrets.required / secrets.optional become `${NAME:?...}` lines in the Compose environment block; the generator fails on a name
  // that is not an environment variable name.
  v("secrets=required", { secrets: { required: ["SECRET_KEY", "TEAM_TAYLOR_WEBHOOK_SECRET"] } }, "accept"),
  v("secrets=optional", { secrets: { optional: ["TOKEN"] } }, "accept"),
  v("secrets=both", { secrets: { required: ["A_KEY"], optional: ["B_KEY"] } }, "accept"),
  v("secrets=same name twice", { secrets: { required: ["A_KEY", "A_KEY"] } }, "accept"),
  { ...v("secrets=required, no value", { secrets: { required: ["NO_VALUE_KEY"] } }, "reject"), noSecretValues: true },
  { ...v("secrets=optional, no value", { secrets: { optional: ["NO_VALUE_KEY"] } }, "accept"), noSecretValues: true },
  v("secrets=digit first", { secrets: { required: ["1BAD"] } }, "reject"),
  v("secrets=dash", { secrets: { required: ["A-B"] } }, "reject"),
  v("secrets=space", { secrets: { required: ["A B"] } }, "reject"),
  v("secrets=empty name", { secrets: { required: [""] } }, "reject"),
  v("secrets=newline", { secrets: { required: ["A\nB: c"] } }, "reject"),
  v("secrets=quote", { secrets: { required: ['A"B'] } }, "reject"),
  v("secrets=dollar", { secrets: { required: ["A${B}"] } }, "reject"),
  v("secrets=number name", { secrets: { required: [7] } }, "reject"),
  v("secrets=required string", { secrets: { required: "A_KEY" } }, "reject"),
  v("secrets=string", { secrets: "A_KEY" }, "reject"),
  v("secrets=array", { secrets: ["A_KEY"] }, "reject"),
  v("secrets=null", { secrets: null }, "accept"),
  v("secrets+params overlap", { secrets: { required: ["A_KEY"] }, params: { A_KEY: "x" } }, "accept"),

  // Bring-your-own and migrator shapes.
  v("appType=migrator", { appType: "migrator" }, "accept"),
  v("appType=migrator+deps", { appType: "migrator", dependsOn: ["postgres"] }, "accept"),
  v("image+port", { image: "nginx:1.27", build: undefined, port: 8080 }, "accept"),
  v("image+replicas", { image: "nginx:1.27", build: undefined, replicas: 2 }, "accept"),
  v("image+healthCheckPath", { image: "nginx:1.27", build: undefined, healthCheckPath: "/" }, "accept"),
  v("image=digest", { image: "nginx@sha256:" + "a".repeat(64), build: undefined }, "accept"),
  v("image=registry", { image: "ghcr.io/acme/app:1.2.3", build: undefined }, "accept"),
  v("image=empty", { image: "" }, "accept"),
  v("image=number", { image: 7 }, "reject"),
  v("dockerfile=Dockerfile", { dockerfile: "Dockerfile" }, "accept"),
  v("buildContext+dockerfile", { buildContext: ".", dockerfile: "Dockerfile" }, "accept"),
];

/** Values for a frontend (`storefront`): its Vite config, base path and the backend it calls come from these. */
export const FRONTEND_VARIANTS: Variant[] = [
  v("baseline", {}, "accept"),
  ...bad("framework", ["Next", "react;rm", "", 7, "no such framework", "../react"]),
  ...good("framework", [
    "react",
    "vue",
    "svelte",
    "preact",
    "lit",
    "solid",
    "qwik",
    "vanilla",
    "tanstack-router",
    "next",
  ]),
  ...bad("backendName", [7]),
  // A backendName that names no service is warned about by `flisk up`, not refused; nothing downstream breaks.
  ...good("backendName", [
    "orders",
    "ghost",
    "Orders",
    "no spaces allowed",
    "orders/x",
    "a".repeat(80),
  ]),
  ...bad("basePath", ["store", "/Store", "/a b", "/a;b", "/x/../y", 7]),
  ...good("basePath", ["/", "/store", "/shop/front"]),
  ...bad("apiPath", ["api", "/a b", "/a;b", 7]),
  ...bad("appName", ["Storefront", "store front", "store/front", "a".repeat(60)]),
  ...good("appName", ["storefront", "store-front", "a".repeat(59)]),
  ...bad("port", [0, 70000, "3000", 1.5]),
  ...good("port", [3000, 3999, 8080]),
  ...bad("featuresEnabled", ["vitest", { a: 1 }, [1]]),
  v("dependsOn=string", { dependsOn: "orders" }, "reject"),
  v("dependsOn=stack", { dependsOn: ["main"] }, "accept"),
  v("dependsOn=ghost", { dependsOn: ["ghost"] }, "accept"),
  v("build=string", { build: "Dockerfile" }, "reject"),
  v("dockerfile=missing", { dockerfile: "nope/Dockerfile" }, "reject"),
  v("dockerfile=escape", { dockerfile: "../../x" }, "reject"),
  v("replicas=3", { replicas: 3 }, "reject"),
  v("replicas=0", { replicas: 0 }, "reject"),
  v("healthCheckPath=bad", { healthCheckPath: "/a b" }, "reject"),
  v("unknown.field", { totallyUnknown: 1 }, "accept"),
];
