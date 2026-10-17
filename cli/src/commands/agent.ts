// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import * as http from "node:http";
import chalk from "chalk";
import { Command } from "commander";
import { createDiscoveryContext } from "../utils/discovery-context.js";
import { errorFactories, runCommand, TdkError } from "../utils/errors.js";
import { getHostPortPlan } from "../utils/host-port-config.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { buildServicePorts } from "../utils/status-ports.js";

const SESSION_REQUEST_TIMEOUT_MS = 10_000;

/** GET with node:http because fetch silently drops a custom Host header, which is what Traefik routes on. */
export function httpGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    // One signal covers the connection and the body read, so a hung agent cannot block the CLI.
    const req = http.get(url, { headers, signal: AbortSignal.timeout(timeoutMs) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: Buffer.concat(chunks).toString("utf-8"),
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

/**
 * Agent containers publish no host port; the only way in is the Traefik route that `tdk status` prints as `url`
 * (for example http://api.<project>.localhost:8080/api/bot). `*.localhost` does not resolve everywhere (glibc without
 * systemd-resolved), so connect to loopback and keep the route's host in the Host header, which is all Traefik matches on.
 */
export function agentSessionRequest(
  routeUrl: string,
  sessionId: string,
): { url: string; headers: Record<string, string> } {
  const route = new URL(routeUrl);
  const headers: Record<string, string> = { "x-session-id": sessionId };
  if (route.hostname.endsWith(".localhost")) {
    headers.host = route.host;
    route.hostname = "127.0.0.1";
  }
  return { url: `${route.origin}${route.pathname.replace(/\/$/, "")}/session`, headers };
}

export const agentCommand = new Command("agent").description(
  "Inspect and operate AI agent resources",
);

agentCommand
  .command("sessions <resource>")
  .description("Inspect session checkpoints from a running AI agent resource")
  .option("--session-id <id>", "Session ID to fetch (required)")
  .option("--json", "Output one JSON object and exit", false)
  .action(async (resourceName: string, options) => {
    const action = async (): Promise<void> => {
      const root = findProjectRoot();
      if (!root) {
        const error = errorFactories.notInProject();
        if (options.json) writeMachineError(error);
        error.exit();
      }

      const discovery = createDiscoveryContext();
      const resource = discovery.resources.find((r) => r.name === resourceName);
      if (!resource) {
        const msg = `Resource "${resourceName}" not found in project.`;
        if (options.json) {
          console.log(
            JSON.stringify(
              createMachineEnvelope(null, [{ code: "UNKNOWN_RESOURCE", message: msg }]),
            ),
          );
          process.exit(1);
        }
        throw new TdkError(msg);
      }

      const appType = resource.config?.appType ?? resource.type;
      if (appType !== "agent") {
        const msg = `Resource "${resourceName}" is of type "${appType}", not "agent".`;
        if (options.json) {
          console.log(
            JSON.stringify(createMachineEnvelope(null, [{ code: "NOT_AN_AGENT", message: msg }])),
          );
          process.exit(1);
        }
        throw new TdkError(msg);
      }

      const port = resource.port;
      if (!port) {
        const msg = `Agent "${resourceName}" has no assigned port.`;
        if (options.json) {
          console.log(
            JSON.stringify(createMachineEnvelope(null, [{ code: "NO_PORT", message: msg }])),
          );
          process.exit(1);
        }
        throw new TdkError(msg);
      }

      // The agent runtime keys GET /session by x-session-id and has no list endpoint, so a missing id
      // would only come back as a confusing 400. Fail before any request. Checked after resource
      // validation so UNKNOWN_RESOURCE, NOT_AN_AGENT and NO_PORT keep their precedence.
      const sessionId = typeof options.sessionId === "string" ? options.sessionId.trim() : "";
      if (!sessionId) {
        const msg = `--session-id is required: the agent "${resourceName}" returns the checkpoint of one session.`;
        if (options.json) {
          console.log(
            JSON.stringify(
              createMachineEnvelope(null, [{ code: "SESSION_ID_REQUIRED", message: msg }]),
            ),
          );
          process.exit(1);
        }
        throw new TdkError(msg, [`Run: tdk agent sessions ${resourceName} --session-id <id>`]);
      }

      const portPlan = root
        ? await getHostPortPlan(root, { inspectDocker: false }).catch(() => null)
        : null;
      const routeUrl = buildServicePorts(resource, portPlan?.ingressHttp).url;
      if (!routeUrl) {
        const msg = `Agent "${resourceName}" has no ingress route to reach it through.`;
        if (options.json) {
          console.log(
            JSON.stringify(createMachineEnvelope(null, [{ code: "NO_ROUTE", message: msg }])),
          );
          process.exit(1);
        }
        throw new TdkError(msg);
      }
      const request = agentSessionRequest(routeUrl, sessionId);

      // Nothing answered, or Traefik answered for a missing backend: either way the agent is not up.
      const notRunning = (): never => {
        const msg = `Agent "${resourceName}" is not responding at ${routeUrl}. Is the stack running?`;
        if (options.json) {
          console.log(
            JSON.stringify(
              createMachineEnvelope(null, [{ code: "AGENT_NOT_RUNNING", message: msg }]),
            ),
          );
          process.exit(1);
        }
        throw new TdkError(msg, ["Start the stack with: tdk up"]);
      };

      let res: { ok: boolean; status: number };
      let bodyText: string;
      try {
        const reply = await httpGet(request.url, request.headers, SESSION_REQUEST_TIMEOUT_MS);
        res = reply;
        bodyText = reply.text;
      } catch {
        return notRunning();
      }

      let body: unknown = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        body = { raw: bodyText };
      }

      // Traefik answers 502/503/504 when the route has no live container and a plain-text 404 when it has no route at
      // all. An agent's own errors are JSON, so a non-JSON 404 is the gateway, not the agent.
      const gatewayText = typeof body === "object" && body !== null && "raw" in body;
      if (
        !res.ok &&
        ([502, 503, 504].includes(res.status) || (res.status === 404 && gatewayText))
      ) {
        return notRunning();
      }

      if (!res.ok) {
        const detail = (body as { error?: string })?.error ?? bodyText;
        if (options.json) {
          console.log(
            JSON.stringify(
              createMachineEnvelope(null, [
                {
                  code: "AGENT_REQUEST_FAILED",
                  message: `Agent returned ${res.status}: ${detail}`,
                },
              ]),
            ),
          );
          process.exit(1);
        }
        throw new TdkError(`Agent error (${res.status}): ${detail}`);
      }

      if (options.json) {
        console.log(
          JSON.stringify(
            createMachineEnvelope({
              agent: resourceName,
              port,
              session: body,
            }),
          ),
        );
        return;
      }

      console.log(chalk.bold(`Sessions for ${resourceName}:`));
      console.log(JSON.stringify(body, null, 2));
    };

    if (options.json) {
      try {
        await action();
      } catch (err) {
        writeMachineError(err);
      }
      return;
    }
    await runCommand(action);
  });
