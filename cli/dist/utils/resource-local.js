import { LOCAL_VITE_SCRIPTS, renderLocalViteConfig } from "../frontend-frameworks/local.js";
import { FliskError } from "./errors.js";
import { findFreePort } from "./native-demo.js";
/**
 * The scaffolds listen on every interface because a container needs that. On your own computer that would put the app
 * on the café wifi, so every generated listener is pointed at localhost: a literal 0.0.0.0, Bun's default (Hono's
 * `export default { port }`), and Go's `":" + port`. Flisk's own probes and the website's proxy all use localhost.
 */
export function bindToLocalhost(tasks) {
    for (const task of tasks) {
        if (task.type !== "text")
            continue;
        task.content = String(task.content)
            .replaceAll("0.0.0.0", "localhost")
            .replace(/export default \{(\s*)port,/, "export default {$1hostname: 'localhost',$1port,")
            .replace('http.ListenAndServe(":"+port', 'http.ListenAndServe("localhost:"+port');
    }
}
/** `flisk up` on your computer starts plain processes and no Tilt, so the starter pages must not link to its UI. */
export function dropTiltLinks(tasks) {
    for (const task of tasks) {
        if (task.type !== "text")
            continue;
        const content = String(task.content);
        if (!content.includes("localhost:10350"))
            continue;
        task.content = content
            .split("\n")
            .filter((line) => !line.includes("localhost:10350"))
            .join("\n");
    }
}
const taskNamed = (tasks, filename) => tasks.find((task) => task.filename === filename);
/**
 * Turns a scaffold made for containers into one that runs on the host with no Docker and no Tilt.
 *
 * Only what is coupled to containers changes: the Dockerfile goes, `service.json` gets a `command` (so `flisk up` runs it as a
 * local process) instead of a build block, and a Vite frontend gets a plain config and scripts. The framework's source files,
 * dependencies and tests are the generator's own, untouched. Returns the command the service runs.
 */
export function applyLocalScaffold(input) {
    const { tasks, resourceType, frontendFramework, backendLanguage } = input;
    const dockerfile = tasks.findIndex((task) => task.filename === "Dockerfile");
    if (dockerfile >= 0)
        tasks.splice(dockerfile, 1);
    const serviceJson = taskNamed(tasks, "service.json")?.content;
    const packageJson = taskNamed(tasks, "package.json")?.content;
    if (!serviceJson) {
        throw new FliskError("The scaffold has no service.json to run locally.", [
            "Scaffold it without --local, or report this as a bug.",
        ]);
    }
    let command;
    if (resourceType === "frontend" && frontendFramework) {
        if (frontendFramework.kind === "server") {
            // A server framework (Next.js) owns its dev server; its own `dev` script already runs on the host. The route
            // prefix it was scaffolded for (/<name>/health) only exists behind Flisk's gateway, so the host probes the root.
            command = "npm run dev";
            serviceJson.healthCheckPath = "/";
        }
        else {
            if (!frontendFramework.vite) {
                throw new FliskError(`The ${frontendFramework.id} frontend cannot run on the host yet.`, [
                    "Scaffold it without --local to use the Docker and Tilt route.",
                ]);
            }
            if (packageJson?.scripts) {
                delete packageJson.scripts.predev;
                delete packageJson.scripts.prebuild;
                Object.assign(packageJson.scripts, LOCAL_VITE_SCRIPTS);
            }
            tasks.push({
                type: "text",
                filename: "vite.config.ts",
                content: renderLocalViteConfig(frontendFramework, {
                    port: input.port,
                    proxyTarget: input.backendUrl,
                }),
                description: "Generating vite.config.ts for the host",
                emoji: "⚙️",
            });
            command = "npm run dev";
        }
    }
    else if (backendLanguage?.devCommand && !taskNamed(tasks, "package.json")) {
        command = backendLanguage.devCommand;
    }
    else {
        command = "npm run dev";
    }
    if (resourceType === "frontend")
        dropTiltLinks(tasks);
    if (resourceType === "backend") {
        bindToLocalhost(tasks);
        command = command.replaceAll("0.0.0.0", "localhost");
    }
    else if (frontendFramework?.kind === "server" && packageJson?.scripts?.dev === "next dev") {
        // Next.js listens on every interface by default.
        packageJson.scripts.dev = "next dev -H localhost";
    }
    // A build block points at the Dockerfile that is no longer written, and `dev` is what Tilt reloads with.
    delete serviceJson.build;
    delete serviceJson.dev;
    serviceJson.command = command;
    serviceJson.port = input.port;
    return command;
}
/**
 * The port a `--local` resource gets. An explicit --port is kept as given; otherwise the assigned port, or the next one
 * that no other resource in the project uses and that nothing on this computer is listening on right now.
 */
export async function localResourcePort(assignedPort, explicit, taken, isListening) {
    if (explicit)
        return assignedPort;
    return findFreePort(assignedPort, isListening, taken);
}
