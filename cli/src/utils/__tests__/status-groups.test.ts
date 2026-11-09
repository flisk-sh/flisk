// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import type { DiscoveredResource, ServiceRuntimeState } from "../../types/index.js";
import {
  groupServicesByStack,
  hasNoOwnProcess,
  healthCountedResources,
  unhealthyServiceNames,
} from "../status-groups.js";

const resource = (name: string, type: string) => ({ name, type }) as DiscoveredResource;
const web = resource("web", "frontend");
const api = resource("api", "backend");
const db = resource("db", "database");
const state = (status: ServiceRuntimeState["status"]) => ({ status });

function summary(resources: DiscoveredResource[], states: Record<string, ServiceRuntimeState>) {
  const [group] = groupServicesByStack(
    [{ name: "main", resources, resourceCount: resources.length }] as never,
    [],
    states,
  );
  return `${group?.healthy}/${group?.total}`;
}

describe("the healthy count", () => {
  it("leaves out a database that has no process of its own", () => {
    expect(
      summary([web, api, db], { web: state("ready"), api: state("ready"), db: state("unknown") }),
    ).toBe("2/2");
  });

  it("leaves it out when there is no state for it at all", () => {
    expect(summary([web, db], { web: state("ready") })).toBe("1/1");
  });

  it("counts a database that runs its own container", () => {
    expect(summary([api, db], { api: state("ready"), db: state("ready") })).toBe("2/2");
    expect(summary([api, db], { api: state("ready"), db: state("error") })).toBe("1/2");
  });

  it("still drops below the total for a service that is not ready", () => {
    expect(
      summary([web, api, db], { web: state("ready"), api: state("error"), db: state("unknown") }),
    ).toBe("1/2");
  });

  it("still counts a service that has not started", () => {
    expect(summary([web, api], { web: state("ready"), api: state("unknown") })).toBe("1/2");
  });
});

describe("hasNoOwnProcess", () => {
  it("is only true for a database nothing reports on", () => {
    expect(hasNoOwnProcess(db, state("unknown"))).toBe(true);
    expect(hasNoOwnProcess(db, undefined)).toBe(true);
    expect(hasNoOwnProcess(db, state("pending"))).toBe(false);
    expect(hasNoOwnProcess(api, state("unknown"))).toBe(false);
  });
});

describe("healthCountedResources", () => {
  it("keeps every service when there are no states", () => {
    expect(healthCountedResources([web], null)).toEqual([web]);
  });
});

describe("unhealthyServiceNames", () => {
  it("does not name a database with no process of its own", () => {
    expect(unhealthyServiceNames([web, db], { web: state("ready"), db: state("unknown") })).toEqual(
      [],
    );
  });
});
