// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { tiltUnreachableMessage } from "../tilt-unreachable-message.js";

describe("tiltUnreachableMessage", () => {
  it("names the port and tells the user to run flisk up", () => {
    expect(tiltUnreachableMessage("10350")).toBe(
      "Could not reach Tilt on port 10350. The stack is not running, or Tilt is on another port. Start it with: flisk up",
    );
  });
});
