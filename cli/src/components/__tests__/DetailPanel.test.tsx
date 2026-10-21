// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { PassThrough } from "node:stream";
import { render } from "ink";
import { describe, expect, it } from "vitest";
import type {
  DetailPanelProps,
  DiscoveredResource,
  DiscoveredStack,
  StackMetadata,
} from "../../types/index.js";
import { formatDate } from "../../utils/formatting.js";
import { DetailPanel } from "../DetailPanel.js";
import { createTUITheme, TUIThemeContext } from "../ui-theme.js";

const ANSI_SGR = new RegExp([String.fromCharCode(0x1b), "\\[[0-?]*[ -/]*[@-~]"].join(""), "g");

const CREATED_AT = "2026-10-07T00:00:00.000Z";

function makeService(overrides: Partial<DiscoveredResource> = {}): DiscoveredResource {
  return {
    name: "billing-api",
    path: "/tmp/payments/billing-api",
    configPath: "/tmp/payments/billing-api/service.json",
    stack: "payments",
    ...overrides,
  };
}

function makeStack(): DiscoveredStack {
  const resources = [makeService({ name: "api" }), makeService({ name: "worker" })];
  return { name: "payments", resources, resourceCount: resources.length };
}

function makeStackMetadata(overrides: Partial<StackMetadata> = {}): StackMetadata {
  return {
    name: "payments",
    resourceCount: 2,
    createdAt: CREATED_AT,
    lastModified: CREATED_AT,
    resources: [],
    overallStatus: "healthy",
    ...overrides,
  };
}

type TUIEnvironment = Parameters<typeof createTUITheme>[1];

// NO_COLOR switches the theme to ASCII markers and borders.
const ASCII_ENVIRONMENT: TUIEnvironment = { NO_COLOR: "1" };
const UNICODE_ENVIRONMENT: TUIEnvironment = {};

/**
 * Renders the panel in a fake terminal and returns what it printed, without color codes.
 * Ink prints no color in this harness, so colors are not asserted here.
 */
async function renderPanel(
  props: DetailPanelProps,
  { environment = ASCII_ENVIRONMENT } = {},
): Promise<string> {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode: () => {},
    ref: () => {},
    unref: () => {},
  });
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 100, rows: 24 });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 100, rows: 24 });
  let output = "";
  stdout.on("data", (data) => {
    output += String(data);
  });

  const theme = createTUITheme(false, environment);
  const app = render(
    <TUIThemeContext.Provider value={theme}>
      <DetailPanel {...props} />
    </TUIThemeContext.Provider>,
    {
      stdin,
      stdout,
      stderr,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );
  try {
    await app.waitUntilRenderFlush();
    return output.replace(ANSI_SGR, "");
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
}

describe("DetailPanel", () => {
  describe("with a selected service", () => {
    it("shows the service name, stack, type and the close hint", async () => {
      const output = await renderPanel({
        stack: null,
        service: makeService(),
        stackMetadata: null,
        visible: true,
      });

      expect(output).toContain("BILLING-API");
      expect(output).toMatch(/Name:\s+billing-api/);
      expect(output).toMatch(/Stack:\s+payments/);
      expect(output).toMatch(/Type:\s+PRODUCT/);
      expect(output).toContain("Press [Esc] to close");
    });

    it.each([
      ["platform", "PLATFORM", "PRODUCT"],
      ["payments", "PRODUCT", "PLATFORM"],
    ])("labels a service in the %s stack as %s", async (stack, label, other) => {
      const output = await renderPanel({
        stack: null,
        service: makeService({ stack }),
        stackMetadata: null,
        visible: true,
      });

      expect(output).toContain(`Type: ${label}`);
      expect(output).not.toContain(`Type: ${other}`);
    });

    it("shows unknown when the service has no stack", async () => {
      const output = await renderPanel({
        stack: null,
        service: {
          name: "orphan-worker",
          path: "/tmp/orphan-worker",
          configPath: "/tmp/orphan-worker/service.json",
        },
        stackMetadata: null,
        visible: true,
      });

      expect(output).toMatch(/Stack:\s+unknown/);
      expect(output).toMatch(/Type:\s+PRODUCT/);
    });

    it("prefers the service over the stack when both are selected", async () => {
      const output = await renderPanel({
        stack: makeStack(),
        service: makeService(),
        stackMetadata: makeStackMetadata(),
        visible: true,
      });

      expect(output).toMatch(/Name:\s+billing-api/);
      expect(output).not.toContain("Created:");
    });
  });

  describe("with a selected stack", () => {
    it("shows the status, creation date, resource count and resource tree", async () => {
      const output = await renderPanel({
        stack: makeStack(),
        service: null,
        stackMetadata: makeStackMetadata(),
        visible: true,
      });

      expect(output).toContain("PAYMENTS");
      expect(output).toContain("HEALTHY");
      expect(output).toMatch(/Created:/);
      expect(output).toContain(formatDate(CREATED_AT));
      expect(output).toMatch(/Resources:\s+2/);
      expect(output).toMatch(/\|- api/);
      expect(output).toMatch(/L- worker/);
      expect(output).toContain("Press [Esc] to close");
    });

    it("uses box-drawing characters in the title and tree when unicode is available", async () => {
      const output = await renderPanel(
        {
          stack: makeStack(),
          service: null,
          stackMetadata: makeStackMetadata(),
          visible: true,
        },
        { environment: UNICODE_ENVIRONMENT },
      );

      expect(output).toContain("\u250C\u2500 PAYMENTS \u2500\u2510");
      expect(output).toMatch(/\u251C\u2500 api/);
      expect(output).toMatch(/\u2514\u2500 worker/);
    });

    it.each([
      ["healthy", "HEALTHY", "[+]"],
      ["degraded", "DEGRADED", "[~]"],
      ["error", "ERROR", "[x]"],
      ["unknown", "UNKNOWN", "[?]"],
    ] as const)(
      "shows the %s overall status as %s with the %s ASCII marker",
      async (overallStatus, label, marker) => {
        const output = await renderPanel({
          stack: makeStack(),
          service: null,
          stackMetadata: makeStackMetadata({ overallStatus }),
          visible: true,
        });

        expect(output).toContain(`${marker} ${label}`);
      },
    );

    it.each([
      ["healthy", "HEALTHY", "\u2713"],
      ["degraded", "DEGRADED", "\u25CB"],
      ["error", "ERROR", "\u2717"],
      ["unknown", "UNKNOWN", "?"],
    ] as const)(
      "shows the %s overall status as %s with the %s unicode icon",
      async (overallStatus, label, icon) => {
        const output = await renderPanel(
          {
            stack: makeStack(),
            service: null,
            stackMetadata: makeStackMetadata({ overallStatus }),
            visible: true,
          },
          { environment: UNICODE_ENVIRONMENT },
        );

        expect(output).toContain(`${icon} ${label}`);
      },
    );
  });

  describe("without anything to show", () => {
    it("asks the user to select something when nothing is selected", async () => {
      const output = await renderPanel({
        stack: null,
        service: null,
        stackMetadata: null,
        visible: true,
      });

      expect(output).toContain("Select a stack or service");
      expect(output).toContain("to view details");
    });

    it("falls back to the placeholder when a stack has no metadata yet", async () => {
      const output = await renderPanel({
        stack: makeStack(),
        service: null,
        stackMetadata: null,
        visible: true,
      });

      expect(output).toContain("Select a stack or service");
      expect(output).not.toContain("PAYMENTS");
    });

    it("renders nothing when it is not visible", async () => {
      const output = await renderPanel({
        stack: makeStack(),
        service: makeService(),
        stackMetadata: makeStackMetadata(),
        visible: false,
      });

      expect(output).not.toContain("BILLING-API");
      expect(output).not.toContain("Select a stack or service");
      expect(output).not.toContain("Press [Esc] to close");
    });
  });
});
