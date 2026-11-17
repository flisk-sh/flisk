import { describe, expect, it } from "vitest";
import { toolCommand } from "../tool.js";

describe("tool help", () => {
  it("names examples of unsupported cloud providers", () => {
    expect(toolCommand.description()).toContain("aws and kubernetes");
    expect(toolCommand.description()).not.toContain("(cloud is rejected)");
  });
});
