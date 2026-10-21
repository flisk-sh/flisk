// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
/**
 * Pure decision logic for the wake gateway (see openspec/changes/prioritized-cold-start).
 *
 * The gateway sits behind a Traefik static (file-provider) route for every
 * `sablier: {enable: true, deferStart: true}` resource. This module decides
 * what to *do* given a snapshot of container state; the actual Docker/Tilt
 * I/O and the healthcheck-polling loop live in server.ts, which is a thin
 * wrapper around this so the decision itself stays testable without a live
 * Docker daemon or Tilt instance.
 */

export type ContainerState = "absent" | "created" | "running" | "exited";

export interface DependencySnapshot {
  name: string;
  state: ContainerState;
}

export interface WakeRequestSnapshot {
  resourceContainerName: string;
  resourceState: ContainerState;
  dependencies: DependencySnapshot[];
  /**
   * Whether the route carried enough compose detail (project, files, image)
   * for the gateway to create the resource's container itself.
   */
  hasComposeInvocation?: boolean;
}

export interface WakeAction {
  /** Resources to `tilt trigger` (task 1.5: Tilt never cascades this on its own). */
  tiltTriggerNames: string[];
  /**
   * Whether to create/start the resource's container directly with
   * `docker compose up --no-build` instead of `tilt trigger`. `tilt trigger`
   * only queues the resource: with Tilt's build slots busy (e.g. 100+
   * resources rebuilding after a re-vendor), a triggered resource waited
   * behind them and the request timed out (observed live against
   * tdk-erp-system, see tasks.md 7.2). server.ts falls back to `tilt trigger`
   * when no image exists yet to start from.
   */
  useComposeStart: boolean;
  /**
   * Whether to also try Sablier's own Docker-level start for the resource.
   * Only meaningful when the resource's container already exists (D2/D3):
   * Sablier has nothing to manage for a container that was never created.
   */
  useSablierStart: boolean;
}

/**
 * Decide which resources need `tilt trigger` and whether Sablier's Docker-level
 * start also applies, given one point-in-time snapshot (D2/D3/D5).
 */
export function decideWakeAction(snapshot: WakeRequestSnapshot): WakeAction {
  const tiltTriggerNames: string[] = [];
  const useComposeStart = snapshot.resourceState === "absent" && snapshot.hasComposeInvocation === true;

  if (snapshot.resourceState !== "running" && !useComposeStart) {
    tiltTriggerNames.push(snapshot.resourceContainerName);
  }
  for (const dep of snapshot.dependencies) {
    if (dep.state !== "running") {
      tiltTriggerNames.push(dep.name);
    }
  }

  const useSablierStart = snapshot.resourceState === "exited" || snapshot.resourceState === "created";

  return { tiltTriggerNames, useComposeStart, useSablierStart };
}

/** Wait budget when the gateway starts an existing image itself (boot + healthcheck only). */
export const COMPOSE_START_TIMEOUT_MS = 180_000;
/**
 * Wait budget when the resource has to go through `tilt trigger` (image build
 * included). Kept under Bun.serve's 255s idleTimeout cap in server.ts.
 */
export const TILT_TRIGGER_TIMEOUT_MS = 240_000;

/** The wait budget for a wake: an explicit X-Wake-Timeout-Ms wins, else by start path. */
export function wakeTimeoutMs(startedViaCompose: boolean, overrideMs?: number): number {
  if (overrideMs && overrideMs > 0) return overrideMs;
  return startedViaCompose ? COMPOSE_START_TIMEOUT_MS : TILT_TRIGGER_TIMEOUT_MS;
}

/**
 * How long a waking request is held before the gateway answers
 * `503` + `Retry-After` while the start keeps going in the background.
 * Found live (task 7.2): during a full `flisk up` bring-up the Docker daemon
 * took ~5 min to start one container, and Bun.serve's 255s idle cap dropped
 * the held connection with no response at all.
 */
export const EARLY_RESPONSE_MS = 60_000;
/** Largest hold allowed: stays under Bun.serve's 255s idle cap. */
export const MAX_EARLY_RESPONSE_MS = 240_000;
/** The `Retry-After` value sent with the early 503. */
export const RETRY_AFTER_SECONDS = 10;

/** How long to hold a request: an explicit X-Wake-Respond-Within-Ms wins, capped under Bun's idle limit. */
export function earlyResponseMs(overrideMs?: number): number {
  if (overrideMs && overrideMs > 0) return Math.min(overrideMs, MAX_EARLY_RESPONSE_MS);
  return EARLY_RESPONSE_MS;
}

export interface WaitOutcome {
  ready: boolean;
  /** Names still not running/healthy when the wait ended (empty when ready). */
  pending: string[];
}

/**
 * Decide whether a set of health polls (resource + dependencies) means the
 * request can be let through yet, or should keep waiting / time out.
 * `healthy` maps each name from a WakeAction's tiltTriggerNames (plus the
 * resource itself) to its latest observed health state.
 */
export function evaluateReadiness(
  requiredNames: string[],
  healthy: Record<string, boolean>,
): WaitOutcome {
  const pending = requiredNames.filter((name) => !healthy[name]);
  return { ready: pending.length === 0, pending };
}

/**
 * True for the gateway's own liveness probe (the image HEALTHCHECK's `GET /health`). Traefik's static route
 * forwards every backend request here with its X-Wake-* headers and the backend's prefix stripped, so a
 * backend's `/health` arrives as `/health` too; those must be proxied, not answered by the gateway.
 */
export function isGatewayLivenessProbe(method: string, pathname: string, headers: Headers): boolean {
  return method === "GET" && pathname === "/health" && !headers.has("X-Wake-Resource");
}
