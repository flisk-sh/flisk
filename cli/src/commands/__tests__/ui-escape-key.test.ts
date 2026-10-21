// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ui = readFileSync(join(repoRoot, "cli", "src", "commands", "ui.tsx"), "utf-8");

/** The body of the main `useInput` escape branch: from `if (key.escape) {` to the branch that follows it. */
function escapeBranch(): string {
  // The search branch (`setIsSearching(false)`) also opens with `if (key.escape) {`, so
  // the top-level branch is the one after the `q` handler and the input guard that
  // precedes it — index from there instead of taking the first match.
  const guard = ui.indexOf('if (input === "q" && !key.ctrl && !key.meta)');
  expect(guard, "q quit handler not found in ui.tsx").toBeGreaterThanOrEqual(0);
  const start = ui.indexOf("if (key.escape) {", guard);
  expect(start, "top-level escape branch not found in ui.tsx").toBeGreaterThanOrEqual(0);
  const rest = ui.slice(start + 1);
  const end = rest.indexOf("\n    if (input ===");
  expect(end, "escape branch is no longer followed by the next key handler").toBeGreaterThanOrEqual(
    0,
  );
  return rest.slice(0, end);
}

describe("ui escape key", () => {
  // Esc walks back out of a selected stack, service, and file. With nothing left to leave,
  // it used to exit() the whole TUI, so one extra Esc — the normal reflex — closed the app
  // with no warning. The final level now shows a hint; `q` and Ctrl+C still quit.
  it("does not quit the whole UI when Esc has nothing left to go back from", () => {
    expect(escapeBranch()).not.toContain("exit()");
  });

  it("points at q instead of exiting", () => {
    expect(escapeBranch()).toContain('statusMessage.show("Press q to quit", 2000)');
  });

  // A pending clear timer must be cancelled when the TUI exits so it cannot update
  // state after the component has unmounted.
  it("clears a pending hint timer when the UI unmounts", () => {
    expect(ui).toContain("useEffect(() => () => statusMessage.dispose(), [statusMessage])");
  });

  // Back must keep working at every level it used to: the three selections are still
  // cleared one at a time before the top level is reached.
  it("still steps back out of a selected file, service, and stack", () => {
    const branch = escapeBranch();
    expect(branch).toContain("setSelectedFile(null)");
    expect(branch).toContain("setSelectedService(null)");
    expect(branch).toContain("setSelectedStack(null)");
  });

  // q is now the documented way out, so the help panel must not still advertise Esc as one.
  it("no longer advertises Esc as a way to quit in the help panel", () => {
    expect(ui).not.toContain("q/Esc Quit / Back");
  });

  it("renders the message in EmptyState", () => {
    const empty = ui.slice(ui.indexOf("const EmptyState"), ui.indexOf("const TUIApp"));
    expect(empty).toContain("({ message })");
    expect(empty).toContain("{theme.bannerStart} {message} {theme.bannerEnd}");
  });
});
