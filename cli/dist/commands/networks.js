// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync, spawn } from "node:child_process";
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { getStackEmoji } from "../utils/constants.js";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, logVerbose, requireProjectRoot } from "../utils/errors.js";
import { colorizeByStatus, DEFAULT_BOX_WIDTH, formatBoxLine, formatPadded, getStatusIcon, printBoxedHeader, } from "../utils/formatting.js";
import { readSavedHostPortPlan } from "../utils/host-port-config.js";
import { createHostPortPlan } from "../utils/host-port-plan.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { checkPortStatus } from "../utils/port-assignment.js";
import { isApiServiceType } from "../utils/resource-kind.js";
import { resolveServicePath } from "../utils/service-urls.js";
import { stackExists } from "../utils/services.js";
import { isValidPort, sanitizeForShell } from "../utils/validation.js";
import { findOnPath } from "../utils/which.js";
function execSafe(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(findOnPath(command) ?? command, args, {
            timeout: options.timeout || 5000,
            shell: false,
            windowsHide: process.platform === "win32",
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (data) => {
            stdout += data.toString();
        });
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
            }
            else {
                resolve(stdout);
            }
        });
        child.on("error", (err) => {
            reject(err);
        });
    });
}
function determineDefaultDomain() {
    const projectRoot = findProjectRoot();
    if (projectRoot) {
        const projectConfig = readProjectConfig(projectRoot);
        const projectName = projectConfig.project?.name;
        if (projectName && projectName !== "tdk-project") {
            return `${projectName}.localhost`;
        }
    }
    const domains = new Set();
    try {
        const traefikLabels = execFileSync(findOnPath("docker") ?? "docker", ["ps", "--filter", "label=traefik.enable=true", "--format", "{{.Labels}}"], { encoding: "utf-8", windowsHide: process.platform === "win32" });
        // Capture every Host(`...`) in a rule (multi-host rules included), avoid ReDoS with bounded classes
        const domainRegex = /Host\(`([a-zA-Z0-9_.-]{1,100})`\)/g;
        for (let match = domainRegex.exec(traefikLabels); match !== null; match = domainRegex.exec(traefikLabels)) {
            domains.add(match[1]);
        }
    }
    catch (err) {
        console.warn(chalk.yellow("⚠️ Could not scan Traefik domains (Docker unavailable)"));
        logVerbose("Docker scan error details", err);
    }
    // Filter out service-specific domains (ones that look like individual services)
    // Service domains typically contain the full service name like "myapp-api-frontend.localhost"
    const domainList = Array.from(domains);
    const projectDomains = domainList.filter((domain) => {
        if (/^(app|api)\.[\w-]+\.localhost$/.test(domain))
            return true;
        // Skip domains that look like specific service instances
        // These are long, hyphen-heavy domains for individual services
        const servicePatterns = [
            /\w+-\w+-frontend\.localhost$/,
            /\w+-\w+-backend\.localhost$/,
            /\w+-\w+-worker\.localhost$/,
            /\w+-\w+-migrator\.localhost$/,
        ];
        return !servicePatterns.some((pattern) => pattern.test(domain));
    });
    // Prefer project-level domains (shorter, simpler ones)
    if (projectDomains.length > 0) {
        // Sort by length - shortest is likely the project domain
        projectDomains.sort((a, b) => a.length - b.length);
        return projectDomains[0];
    }
    // If only service-specific domains found, extract base from first one
    // e.g., "myapp-api-frontend.localhost" -> try to find "myapp.localhost"
    if (domainList.length > 0) {
        const firstDomain = domainList[0];
        const localhostMatch = firstDomain.match(/([\w-]+)\.localhost$/);
        if (localhostMatch) {
            // If it looks like a service domain, try common project names
            const commonProjects = ["flisk", "project", "app", "api", "myapp"];
            for (const project of commonProjects) {
                const testDomain = `${project}.localhost`;
                if (domainList.includes(testDomain)) {
                    return testDomain;
                }
            }
        }
    }
    return "localhost";
}
async function checkServiceStatus(serviceName, port, url) {
    if (url) {
        try {
            const validUrl = new URL(url);
            if (validUrl.protocol !== "http:" && validUrl.protocol !== "https:") {
                return "stopped";
            }
            const statusCode = await execSafe("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "2", validUrl.toString()], { timeout: 3000 });
            const code = statusCode.trim();
            if (/^[23]\d\d$/.test(code)) {
                return "running";
            }
            if (/^[45]\d\d$/.test(code)) {
                return "stopped";
            }
            // Connection refused or other error - service not accessible
            if (code === "000") {
                return "stopped";
            }
        }
        catch (err) {
            console.warn(chalk.yellow(`⚠️ Could not reach ${url} (HTTP check failed)`));
            logVerbose(`HTTP check error details for ${url}`, err);
            return "stopped";
        }
    }
    if (port && isValidPort(port)) {
        const portStatus = await checkPortStatus(port);
        if (portStatus === "running") {
            return "running";
        }
        if (portStatus === "unknown") {
            console.warn(chalk.yellow(process.platform === "win32"
                ? `⚠️ Could not check port ${port} with the Windows TCP probe`
                : `⚠️ Could not check port ${port} (port probe unavailable)`));
        }
    }
    try {
        const containerName = sanitizeForShell(serviceName);
        const result = await execSafe("docker", ["ps", "--filter", `name=${containerName}`, "--format", "{{.Names}}"], { timeout: 5000 });
        if (result && result.trim().length > 0) {
            return "running";
        }
    }
    catch (err) {
        console.warn(chalk.yellow(`⚠️ Could not check Docker for ${serviceName}`));
        logVerbose(`Docker check error details for ${serviceName}`, err);
    }
    return "stopped";
}
export const networksCommand = new Command("networks")
    .description("Show Traefik-routed URLs for all services")
    .alias("urls")
    .alias("traefik")
    .option("-s, --stack <stack>", "Filter by stack name")
    .option("--json", "Output a versioned JSON response")
    .option("--json-legacy", "Output the legacy JSON array (deprecated)")
    .option("--raw", "Output raw URLs only")
    .action(async (options) => {
    const action = async () => {
        const projectRoot = options.json || options.jsonLegacy ? findProjectRoot() : requireProjectRoot();
        if (!projectRoot) {
            throw errorFactories.notInProject();
        }
        const discovery = createDiscoveryContext();
        if (options.stack && !stackExists(options.stack, discovery.resources)) {
            const error = errorFactories.stackNotFound(options.stack, discovery.stackNames);
            if (options.json || options.jsonLegacy)
                throw error;
            error.exit();
        }
        const savedPlan = readSavedHostPortPlan(projectRoot);
        const hostPortPlan = savedPlan ?? (await createHostPortPlan());
        const httpPort = hostPortPlan.ingressHttp;
        const baseDomain = determineDefaultDomain();
        const bareDomain = baseDomain.replace(/^(app|api)\./, "");
        const appDomain = `app.${bareDomain}`;
        const apiDomain = `api.${bareDomain}`;
        const services = discovery.resources;
        const servicesWithUrls = await Promise.all(services
            .filter((s) => s.config?.appType === "frontend" || isApiServiceType(s.config?.appType))
            .map(async (s) => {
            const resolvedPath = resolveServicePath(s);
            const basePath = resolvedPath.startsWith("/") ? resolvedPath : `/${resolvedPath}`;
            const isBackend = isApiServiceType(s.config?.appType);
            const host = isBackend ? apiDomain : appDomain;
            const url = `http://${host}:${httpPort}${basePath}`;
            const port = s.config?.port;
            const status = await checkServiceStatus(s.name, port, url);
            return {
                name: s.name,
                stack: s.stack,
                basePath,
                url,
                ...(process.platform === "win32"
                    ? { loopbackUrl: `http://127.0.0.1:${httpPort}${basePath}`.replace(/\/$/, "") }
                    : {}),
                port,
                status,
            };
        }));
        const filteredServices = options.stack
            ? servicesWithUrls.filter((s) => s.stack === options.stack)
            : servicesWithUrls;
        if (options.json || options.jsonLegacy) {
            const output = options.jsonLegacy
                ? filteredServices
                : createMachineEnvelope({ services: filteredServices });
            console.log(JSON.stringify(output, null, 2));
            return;
        }
        if (filteredServices.length === 0) {
            if (options.stack) {
                console.log(chalk.yellow(`⚠️ No routable services found in stack "${options.stack}"`));
            }
            else {
                console.log(chalk.yellow("⚠️ No routable services found"));
            }
            process.exit(0);
        }
        if (options.raw) {
            for (const service of filteredServices) {
                console.log(service.url);
                if (service.loopbackUrl)
                    console.log(service.loopbackUrl);
            }
            process.exit(0);
        }
        printBoxedHeader("🌐  TRAEFIK NETWORKS", `Domain: http://${baseDomain}:${httpPort}`, DEFAULT_BOX_WIDTH);
        // Group services by stack using discovery context's stack names for consistent ordering
        const stacks = new Map();
        for (const stackName of discovery.stackNames) {
            const stackServices = filteredServices.filter((s) => s.stack === stackName);
            if (stackServices.length > 0) {
                stacks.set(stackName, stackServices);
            }
        }
        // Add unstacked services to 'default' group
        const unstackedServices = filteredServices.filter((s) => !s.stack);
        if (unstackedServices.length > 0) {
            stacks.set("default", unstackedServices);
        }
        let isFirstStack = true;
        for (const [stackName, stackServices] of stacks) {
            if (!isFirstStack) {
                console.log();
            }
            isFirstStack = false;
            const emoji = getStackEmoji(stackName);
            const stackTitle = `${emoji}  ${stackName.toUpperCase()} STACK`;
            console.log();
            console.log(chalk.bold.white(stackTitle));
            console.log(chalk.gray(formatBoxLine("━", DEFAULT_BOX_WIDTH - 4)));
            for (const service of stackServices) {
                const statusSymbol = getStatusIcon(service.status);
                const statusEmoji = colorizeByStatus(statusSymbol, service.status);
                const namePart = formatPadded(service.name, 22);
                const urlPart = service.status === "running"
                    ? chalk.cyan.underline(service.url)
                    : chalk.gray(service.url); // Gray out URL if stopped
                const statusLabel = service.status !== "running" ? chalk.gray(` [${service.status}]`) : "";
                console.log(`  ${statusEmoji} ${chalk.white(namePart)}  ${urlPart}${statusLabel}`);
                if (service.loopbackUrl) {
                    console.log(`     ${chalk.gray(`Loopback: ${service.loopbackUrl} (Host: ${new URL(service.url).hostname})`)}`);
                }
            }
        }
        console.log();
        console.log(chalk.gray(formatBoxLine("─", DEFAULT_BOX_WIDTH - 2)));
        console.log(chalk.gray("🖱️  Click any URL above to open in browser"));
        console.log(chalk.gray("📊 Status: ") +
            chalk.green("✓ Running") +
            " | " +
            chalk.red("✗ Stopped") +
            " | " +
            chalk.gray("? Unknown"));
        if (baseDomain === "localhost") {
            console.log();
            const projectConfig = readProjectConfig(projectRoot);
            const projectName = projectConfig.project.name;
            console.log(chalk.yellow("💡 Tip: Set custom domain with:"));
            console.log(chalk.cyan(`   export TDK_PUBLIC_HOST=${projectName}.localhost`));
        }
        console.log();
    };
    if (options.json || options.jsonLegacy) {
        try {
            await action();
        }
        catch (error) {
            writeMachineError(error);
        }
        return;
    }
    await action();
});
