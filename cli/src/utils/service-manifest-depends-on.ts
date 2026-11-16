// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { isPlainObject } from "./is-plain-object.js";

const DEPENDS_ON_CONDITIONS = [
  "service_started",
  "service_healthy",
  "service_completed_successfully",
];

/**
 * `dependsOn`: service or stack names, or Compose-style objects `{ "name": "db", "condition": "service_healthy" }`. Flisk orders by
 * name (Tilt resource_deps), so the condition is accepted and kept but does not change the order. Mirrors normalize_depends_on in
 * engine/.../tilt/manifest/parser.star.
 */
export function dependsOnErrors(manifest: Record<string, unknown>, displayPath: string): string[] {
  const deps = manifest.dependsOn;
  if (!Array.isArray(deps)) return [];
  const errors: string[] = [];
  const declaredConditions = new Map<string, string>();

  deps.forEach((entry: unknown, i) => {
    let name: string | undefined;
    let cond = "service_started";
    let hasValidCondition = true;

    if (typeof entry === "string") {
      name = entry;
    } else if (isPlainObject(entry)) {
      const at = `${displayPath}.dependsOn[${i}]`;
      for (const key of Object.keys(entry)) {
        if (key !== "name" && key !== "condition")
          errors.push(`${at}.${key}: unknown option (use name, condition)`);
      }
      if (typeof entry.name !== "string" || entry.name === "") {
        errors.push(`${at}.name: expected a service or stack name`);
      } else {
        name = entry.name;
      }
      if (entry.condition !== undefined) {
        if (
          !(typeof entry.condition === "string" && DEPENDS_ON_CONDITIONS.includes(entry.condition))
        ) {
          errors.push(`${at}.condition: expected one of ${DEPENDS_ON_CONDITIONS.join(", ")}`);
          hasValidCondition = false;
        } else {
          cond = entry.condition;
        }
      }
    } else {
      const at = `${displayPath}.dependsOn[${i}]`;
      errors.push(
        `${at}: expected a name, or an object such as { "name": "db", "condition": "service_healthy" }`,
      );
      return;
    }

    if (name && hasValidCondition) {
      if (declaredConditions.has(name) && declaredConditions.get(name) !== cond) {
        errors.push(
          `${displayPath}.dependsOn: '${name}' lists conflicting conditions '${declaredConditions.get(name)}' and '${cond}'`,
        );
      } else {
        declaredConditions.set(name, cond);
      }
    }
  });
  return errors;
}
