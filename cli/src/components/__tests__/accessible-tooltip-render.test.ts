// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { renderToString } from "ink";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AccessibleTooltip } from "../Accessible.js";
import { createTUITheme, type TUITheme, TUIThemeContext } from "../ui-theme.js";

function renderTooltip(theme: TUITheme): string {
  return renderToString(
    createElement(
      TUIThemeContext.Provider,
      { value: theme },
      createElement(AccessibleTooltip, { content: "Press r to refresh", visible: true }),
    ),
  );
}

describe("AccessibleTooltip", () => {
  it("renders only ASCII characters in ASCII mode", () => {
    const output = renderTooltip(createTUITheme(false, { NO_COLOR: "1" }));

    expect(output).toContain("[i] Press r to refresh");
    expect(output).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it("keeps the information sign in Unicode mode", () => {
    const output = renderTooltip(createTUITheme(false, {}));

    expect(output).toContain("ℹ Press r to refresh");
  });
});
