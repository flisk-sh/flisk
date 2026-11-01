// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// The address the TUI agent panel reads an agent through: its ingress route, or localhost when the project runs natively.

import { describe, expect, it } from "vitest";
import { makeResource } from "../../test-support/index.js";
import { agentRouteOf } from "../ui.js";

describe("agentRouteOf", () => {
  it("reads an agent that runs as a local process on localhost at its own port", () => {
    const bot = makeResource("bot", "agent", { port: 4999, command: "node server.js" });
    const web = makeResource("web", "frontend", { port: 5173, command: "vite" });
    expect(agentRouteOf([bot, web], "bot", 8080)).toEqual({
      name: "bot",
      url: "http://localhost:4999",
    });
  });

  it("reads a container agent through its ingress route", () => {
    const bot = makeResource("bot", "agent", { port: 4999 });
    const route = agentRouteOf([bot], "bot", 8080);
    expect(route?.name).toBe("bot");
    expect(route?.url).not.toContain("localhost:4999");
  });

  it("returns null when the selection is not an agent", () => {
    const web = makeResource("web", "frontend", { port: 5173, command: "vite" });
    expect(agentRouteOf([web], "web", 8080)).toBeNull();
  });
});
