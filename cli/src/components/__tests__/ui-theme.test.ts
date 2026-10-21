// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTUITheme, getTUIStatusIcon, sectionTitle } from "../ui-theme.js";

describe("flisk ui theme", () => {
  it("preserves the normal palette by default", () => {
    const theme = createTUITheme(false, {});

    expect(theme.accent).toBe("cyan");
    expect(theme.muted).toBe("gray");
    expect(theme.dimMuted).toBe(true);
    expect(theme.selectionMarker).toBe("▓▒░");
  });

  it("uses bright colors and avoids dim text in high-contrast mode", () => {
    const theme = createTUITheme(true, {});

    expect(theme.highContrast).toBe(true);
    expect(theme.accent).toBe("cyanBright");
    expect(theme.muted).toBe("white");
    expect(theme.border).toBe("whiteBright");
    expect(theme.success).toBe("greenBright");
    expect(theme.warning).toBe("yellowBright");
    expect(theme.dimMuted).toBe(false);
    expect(theme.selectedBackground).toBe("cyanBright");
    expect(theme.selectedForeground).toBe("black");
  });

  it("uses printable status marks for plain terminals", () => {
    const theme = createTUITheme(false, { TERM: "dumb" });

    expect(getTUIStatusIcon(theme, "✓", "green")).toBe("[+]");
    expect(getTUIStatusIcon(theme, "!", "yellow")).toBe("[~]");
    expect(getTUIStatusIcon(theme, "x", "red")).toBe("[x]");
    expect(getTUIStatusIcon(theme, "?", "gray")).toBe("[?]");
  });

  it("formats tab section titles for Unicode and ASCII terminals", () => {
    expect(sectionTitle(createTUITheme(false, {}), "Resources")).toBe("┌─ Resources ─");
    expect(sectionTitle(createTUITheme(false, { TERM: "dumb" }), "Resources")).toBe(
      "[ Resources ]",
    );
  });

  it("uses a printable footer separator for plain terminals", () => {
    expect(createTUITheme(false, {}).separator).toBe(" \u2502 ");
    expect(createTUITheme(false, { TERM: "dumb" }).separator).toBe(" | ");
  });

  it.each([{ NO_COLOR: "1" }, { NO_COLOR: "" }, { TERM: "dumb" }, { TERM: "dumb-256color" }])(
    "disables styling and uses ASCII markers for a plain terminal",
    (environment) => {
      const theme = createTUITheme(true, environment);

      expect(theme.accent).toBeUndefined();
      expect(theme.muted).toBeUndefined();
      expect(theme.dimMuted).toBe(false);
      expect(theme.ascii).toBe(true);
      expect(theme.highContrast).toBe(false);
      expect(theme.bannerStart).toBe(">>>");
      expect(theme.bannerEnd).toBe("<<<");
      expect(theme.selectionMarker).toBe(">>>");
      expect(Object.values(theme.fileColors).every((color) => color === undefined)).toBe(true);
    },
  );
});
