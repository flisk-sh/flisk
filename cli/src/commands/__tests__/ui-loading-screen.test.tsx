// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { renderToString } from "ink";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "../ui.js";

describe("ui LoadingScreen", () => {
  it("shows honest text with no percentage", () => {
    const out = renderToString(<LoadingScreen animated={false} />);
    expect(out).toContain("Discovering resources...");
    expect(out).not.toContain("%");
  });

  it("renders a spinner frame only when animated", () => {
    expect(renderToString(<LoadingScreen animated />)).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Discovering/);
    expect(renderToString(<LoadingScreen animated={false} />)).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  });
});
