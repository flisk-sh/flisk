// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { DiscoveredResource } from "../../types/index.js";
import { BRING_YOUR_OWN_TYPE } from "../constants.js";
import { isApiServiceType } from "../resource-kind.js";
import { resolveRouteBase, resolveServicePath } from "../service-urls.js";
import type { SmokePlan } from "./schema.js";
import { DEFAULT_SMOKE_TIMEOUT_SECONDS } from "./schema.js";

/** One plan per routable service that declares `smoke`. Workers and BYO with exposeViaProxy false have no public route. */
export function buildSmokePlans(
  resources: DiscoveredResource[],
  ingressPort?: number,
  options: { gateway?: boolean } = {},
): SmokePlan[] {
  // Smoke steps go through the gateway URL. With the gateway off no such URL answers, so there is nothing to check.
  if (options.gateway === false) return [];
  const plans: SmokePlan[] = [];
  for (const resource of resources) {
    const config = resource.config;
    if (!config?.smoke) continue;
    const appType = config.appType;
    const isApi = isApiServiceType(appType) || appType === BRING_YOUR_OWN_TYPE;
    if (!isApi && appType !== "frontend") continue;
    if (config.exposeViaProxy === false) continue;
    const base = resolveRouteBase(resource, ingressPort);
    // The container healthcheck path (default /health for APIs) is the one request that is safe to repeat while the route comes up.
    const readyPath =
      config.healthCheckPath || (isApi && appType !== BRING_YOUR_OWN_TYPE ? "/health" : undefined);
    plans.push({
      name: resource.name,
      baseUrl: `${base}${resolveServicePath(resource).replace(/\/+$/, "")}`,
      ...(readyPath?.startsWith("/") ? { readyPath } : {}),
      smoke: config.smoke,
    });
  }
  return plans;
}

/** Caps each read-only smoke check so a doctor run cannot wait the full `flisk up` budget per service. */
const DOCTOR_SMOKE_TIMEOUT_SECONDS = 10;

/**
 * The GET-only part of each smoke block, for `flisk doctor`. Doctor must never write to a service, and a step whose path reads
 * a value saved by an earlier write (`{{name}}`) cannot run on its own, so both are dropped. A service with no such steps is left out.
 * `bodyContains` is also cleared: it asserts on data that earlier writes created, so doctor would fail a healthy route whose data was removed.
 * The status check stays, which is what shows a route exists.
 */
export function readOnlySmokePlans(
  plans: SmokePlan[],
  options: { timeoutSeconds?: number } = {},
): SmokePlan[] {
  const cap = options.timeoutSeconds ?? DOCTOR_SMOKE_TIMEOUT_SECONDS;
  return plans.flatMap((plan) => {
    const steps = plan.smoke.steps
      .filter(
        (step) =>
          (step.method ?? "GET").toUpperCase() === "GET" &&
          step.body === undefined &&
          !step.path.includes("{{"),
      )
      .map((step) => ({ ...step, bodyContains: undefined }));
    if (steps.length === 0) return [];
    const budget = Math.min(plan.smoke.timeoutSeconds ?? DEFAULT_SMOKE_TIMEOUT_SECONDS, cap);
    return [
      {
        name: plan.name,
        baseUrl: plan.baseUrl,
        smoke: { via: plan.smoke.via, timeoutSeconds: budget, steps },
      },
    ];
  });
}
