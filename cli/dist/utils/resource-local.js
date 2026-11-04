import { LOCAL_VITE_SCRIPTS, renderLocalViteConfig } from "../frontend-frameworks/local.js";
import { FliskError } from "./errors.js";
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
    // A build block points at the Dockerfile that is no longer written, and `dev` is what Tilt reloads with.
    delete serviceJson.build;
    delete serviceJson.dev;
    serviceJson.command = command;
    return command;
}
