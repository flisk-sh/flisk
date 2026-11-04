// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  arrowMultiSelect,
  arrowSelect,
  arrowText,
  cellWidth,
  filterChoices,
  fitRow,
  framedLines,
  menuAction,
  moveIndex,
  PromptCancelled,
  type PromptStreams,
  renderMenu,
  visibleWidth,
} from "../arrow-prompt.js";

/** The menu text of one frame: ANSI and frame separators removed, rows split. */
function frameRows(printed: string): string[] {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the erase markers are terminal control codes
  const frame = printed.split(/\x1b\[\d+A|\r\x1b\[0J/).at(-1) ?? "";
  return (
    frame
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences are control codes
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
      .split("\n")
      .filter(Boolean)
  );
}

/** The rows of the menu frame that is on screen right now, before the answer collapses it. */
function menuOnScreen(printed: string): string[] {
  return frameRows(printed).filter((row) => row.startsWith("│"));
}

/**
 * Walks the printed stream the way a terminal would and fails when a redraw erases fewer or more
 * lines than the previous frame printed: either copies of the old menu stay on screen (duplicates,
 * stale rows) or prompt'd content above is cut off.
 */
function expectCleanRedraws(printed: string): void {
  let drawn = 0; // lines the previous frame printed since the last erase
  let erases = 0;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the erase markers are terminal control codes
  for (const match of printed.matchAll(/\x1b\[(\d+)A|\n/g)) {
    if (match[0] === "\n") {
      drawn += 1;
      continue;
    }
    erases += 1;
    expect(drawn, "a frame is at least title + hint rows").toBeGreaterThanOrEqual(2);
    expect(
      Number(match[1]),
      `erase #${erases} must match the lines the previous frame printed`,
    ).toBe(drawn);
    drawn = 0;
  }
}

const ESC_BRACKET = "\x1b[";
const UP = "\x1b[A";
const DOWN = "\x1b[B";
const ENTER = "\r";
const SPACE = " ";
const CTRL_C = "\x03";
const BACKSPACE = "\x7f";

/** A fake terminal: keys go in as the bytes a real terminal sends, everything printed is collected. */
function fakeTerminal(): {
  streams: PromptStreams;
  press: (keys: string) => void;
  printed: () => string;
} {
  const input = new PassThrough() as unknown as NodeJS.ReadStream;
  (input as unknown as { isTTY: boolean }).isTTY = true;
  (input as unknown as { setRawMode: () => void }).setRawMode = () => {};
  const output = new PassThrough() as unknown as NodeJS.WriteStream;
  const chunks: string[] = [];
  (output as unknown as PassThrough).on("data", (chunk) => chunks.push(String(chunk)));
  return {
    streams: { input, output },
    // One key per tick, the way a person types, so each keypress is handled before the next arrives.
    press: (keys) => {
      // An arrow key is the three bytes ESC [ A-D; every other key is one character.
      const parts: string[] = [];
      for (let at = 0; at < keys.length; ) {
        const arrow = keys.startsWith(ESC_BRACKET, at) ? 3 : 1;
        parts.push(keys.slice(at, at + arrow));
        at += arrow;
      }
      for (const [i, part] of parts.entries()) {
        setTimeout(() => {
          (input as unknown as PassThrough).write(part);
        }, i * 2);
      }
    },
    printed: () => chunks.join(""),
  };
}

const CHOICES = [
  { title: "Web app", value: "web" },
  { title: "API", value: "api" },
  { title: "Agent", value: "agent" },
] as const;

describe("menuAction", () => {
  it("maps the arrows, vim keys, space, Enter and the cancel keys", () => {
    expect(menuAction({ name: "up" })).toBe("up");
    expect(menuAction({ name: "k" })).toBe("up");
    expect(menuAction({ name: "down" })).toBe("down");
    expect(menuAction({ name: "j" })).toBe("down");
    expect(menuAction({ name: "space" })).toBe("toggle");
    expect(menuAction({ name: "return" })).toBe("submit");
    expect(menuAction({ name: "escape" })).toBe("cancel");
    expect(menuAction({ name: "c", ctrl: true })).toBe("cancel");
    expect(menuAction({ name: "x" })).toBe("none");
  });
});

describe("moveIndex", () => {
  it("wraps at both ends", () => {
    expect(moveIndex(0, 3, -1)).toBe(2);
    expect(moveIndex(2, 3, 1)).toBe(0);
    expect(moveIndex(1, 3, 1)).toBe(2);
    expect(moveIndex(0, 0, 1)).toBe(0);
  });
});

describe("renderMenu", () => {
  it("marks the highlighted row and lists every choice", () => {
    const rows = renderMenu({ message: "Pick one?", choices: CHOICES, cursor: 1 });
    expect(rows).toHaveLength(CHOICES.length + 2);
    expect(rows[0]).toContain("Pick one?");
    expect(rows[2]).toContain("●");
    expect(rows[1]).toContain("○");
    expect(rows.at(-1)).toContain("Enter choose");
  });

  it("shows ticks for a multi-select and says how to tick", () => {
    const rows = renderMenu({
      message: "Extras?",
      choices: CHOICES,
      cursor: 0,
      ticked: new Set(["api"]),
    });
    expect(rows[1]).toContain("◻");
    expect(rows[2]).toContain("◼");
    expect(rows.at(-1)).toContain("space tick");
  });
});

describe("arrowSelect", () => {
  it("Enter alone takes the first choice, so a first run needs no typing", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Build?", choices: CHOICES }, t.streams);
    t.press(ENTER);
    expect(await done).toBe("web");
  });

  it("the down arrow moves to the next choice", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Build?", choices: CHOICES }, t.streams);
    t.press(DOWN + DOWN + ENTER);
    expect(await done).toBe("agent");
  });

  it("the up arrow wraps from the first choice to the last", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Build?", choices: CHOICES }, t.streams);
    t.press(UP + ENTER);
    expect(await done).toBe("agent");
  });

  it("starts on the initial choice", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Build?", choices: CHOICES, initial: "api" }, t.streams);
    t.press(ENTER);
    expect(await done).toBe("api");
  });

  it("collapses the menu to one answered line and shows the cursor again", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Build?", choices: CHOICES }, t.streams);
    t.press(DOWN + ENTER);
    await done;
    const printed = t.printed();
    expect(printed).toContain("API");
    const hidden = printed.indexOf("\x1b[?25l");
    const shown = printed.indexOf("\x1b[?25h");
    expect(hidden).toBeGreaterThanOrEqual(0);
    expect(shown).toBeGreaterThan(hidden);
  });

  it("Ctrl-C cancels with PromptCancelled", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Build?", choices: CHOICES }, t.streams);
    t.press(CTRL_C);
    await expect(done).rejects.toBeInstanceOf(PromptCancelled);
  });

  it("a closed input cancels instead of waiting forever, and shows the cursor again", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Build?", choices: CHOICES }, t.streams);
    (t.streams.input as unknown as PassThrough).end();
    await expect(done).rejects.toBeInstanceOf(PromptCancelled);
    expect(t.printed()).toContain("\x1b[?25h");
  });
});

describe("arrowMultiSelect", () => {
  it("Enter with nothing ticked returns an empty list", async () => {
    const t = fakeTerminal();
    const done = arrowMultiSelect({ message: "Extras?", choices: CHOICES }, t.streams);
    t.press(ENTER);
    expect(await done).toEqual([]);
  });

  it("space ticks the highlighted row and a second space unticks it", async () => {
    const t = fakeTerminal();
    const done = arrowMultiSelect({ message: "Extras?", choices: CHOICES }, t.streams);
    t.press(SPACE + DOWN + SPACE + SPACE + DOWN + SPACE + ENTER);
    expect(await done).toEqual(["web", "agent"]);
  });

  it("keeps the choices ticked when the menu opens", async () => {
    const t = fakeTerminal();
    const done = arrowMultiSelect(
      { message: "Extras?", choices: [{ title: "Web", value: "web", selected: true }, CHOICES[1]] },
      t.streams,
    );
    t.press(ENTER);
    expect(await done).toEqual(["web"]);
  });
});

describe("arrowText", () => {
  it("Enter alone accepts the default", async () => {
    const t = fakeTerminal();
    const done = arrowText({ message: "Name?", initial: "my-app" }, t.streams);
    t.press(ENTER);
    expect(await done).toBe("my-app");
  });

  it("typing replaces the default and backspace edits it", async () => {
    const t = fakeTerminal();
    const done = arrowText({ message: "Name?", initial: "my-app" }, t.streams);
    t.press(`shopp${BACKSPACE}${ENTER}`);
    expect(await done).toBe("shop");
  });

  it("refuses an invalid name, shows why, and takes the next try", async () => {
    const t = fakeTerminal();
    const done = arrowText(
      {
        message: "Name?",
        initial: "my-app",
        validate: (v) => /^[a-z-]+$/.test(v) || "lowercase only",
      },
      t.streams,
    );
    t.press(`A${ENTER}${BACKSPACE}ok${ENTER}`);
    expect(await done).toBe("ok");
    expect(t.printed()).toContain("lowercase only");
  });
});

describe("fitting a frame to the terminal", () => {
  it("counts terminal columns: wide text and emoji take two, joiners and marks none", () => {
    expect(cellWidth("a")).toBe(1);
    expect(cellWidth("寿")).toBe(2);
    expect(cellWidth("한")).toBe(2);
    expect(cellWidth("🍣")).toBe(2);
    expect(cellWidth("\u200D")).toBe(0);
    expect(cellWidth("\u0301")).toBe(0);
    expect(cellWidth("©")).toBe(1);
    expect(cellWidth("™")).toBe(1);
    expect(visibleWidth("™")).toBe(1);
    // Joined and modified emoji are one grapheme each, two columns wide.
    expect(visibleWidth("👨‍👩‍👧‍👦")).toBe(2);
    expect(visibleWidth("👩🏽‍💻")).toBe(2);
    expect(visibleWidth("🏳️‍🌈")).toBe(2);
    expect(visibleWidth("🇺🇦")).toBe(2);
    expect(visibleWidth("e\u0301")).toBe(1);
    // A cut never splits a joined emoji: what is kept is whole graphemes.
    const cut = fitRow(`${"ab".repeat(4)}👨‍👩‍👧‍👦👨‍👩‍👧‍👦`, 12);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.includes("\u200D") ? cut.includes("👨‍👩‍👧‍👦") : true).toBe(true);
    expect(visibleWidth(cut)).toBeLessThanOrEqual(11);
    expect(visibleWidth("\x1b[36m寿司\x1b[39m ok")).toBe(7);
    // Ten wide characters are twenty columns: two lines at width 10, and a cut row never passes the edge.
    expect(framedLines(["寿".repeat(10)], 10)).toBe(2);
    expect(visibleWidth(fitRow("寿".repeat(30), 20))).toBeLessThanOrEqual(19);
  });

  it("framedLines counts the lines a row takes at a given width", () => {
    expect(framedLines(["short", "also short"], 80)).toBe(2);
    expect(framedLines(["012345678 0123456789"], 20)).toBe(1);
    expect(framedLines(["one two"], 3)).toBe(3); // words wrap onto three lines
    expect(framedLines([""], 80)).toBe(1);
  });

  it("fitRow cuts an overlong row to a single terminal line, colour codes and all", () => {
    const colored = `§${"y".repeat(100)}§`;
    const cut = fitRow(colored, 20);
    expect(cut).toHaveLength(19); // columns-1 plus the ellipsis
    expect(cut.startsWith("§yyyy")).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
    expect(framedLines([cut], 20)).toBe(1);
    // A row that fits is untouched, so the active highlight stays coloured.
    const highlighted = "\x1b[36mshort\x1b[39m";
    expect(fitRow(highlighted, 80)).toBe(highlighted);
  });
});

describe("filtering a long menu", () => {
  const LONG = [
    { title: "React", value: "react", hint: "Vite" },
    { title: "Vue 3", value: "vue", hint: "Vite" },
    { title: "Svelte", value: "svelte", hint: "Vite" },
    { title: "Next.js", value: "next", hint: "runs its own dev server" },
  ] as const;

  it("filterChoices matches the title, the id and the hint, every word, any case", () => {
    expect(filterChoices(LONG, "").map((c) => c.value)).toEqual(["react", "vue", "svelte", "next"]);
    expect(filterChoices(LONG, "VU").map((c) => c.value)).toEqual(["vue"]);
    expect(filterChoices(LONG, "own server").map((c) => c.value)).toEqual(["next"]);
    expect(filterChoices(LONG, "zzz")).toEqual([]);
  });

  it("typing letters narrows the list and Enter picks the match", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Framework?", choices: LONG, filterable: true }, t.streams);
    t.press(`sve${ENTER}`);
    expect(await done).toBe("svelte");
  });

  it("backspace widens the list again, and the arrows move inside what is left", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Framework?", choices: LONG, filterable: true }, t.streams);
    t.press(`zz${BACKSPACE}${BACKSPACE}${DOWN}${ENTER}`);
    expect(await done).toBe("vue");
  });

  it("says when nothing matches, and Enter then chooses nothing", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Framework?", choices: LONG, filterable: true }, t.streams);
    t.press(`qqq${ENTER}${BACKSPACE}${BACKSPACE}${BACKSPACE}${ENTER}`);
    expect(await done).toBe("react");
    expect(t.printed()).toContain("nothing matches");
  });

  it("a menu that does not filter still treats j and k as movement", async () => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Framework?", choices: LONG }, t.streams);
    t.press(`j${ENTER}`);
    expect(await done).toBe("vue");
  });
});

describe("redrawing the filtered menu", () => {
  const LONG = [
    { title: "React", value: "react", hint: "Vite" },
    { title: "Vue 3", value: "vue", hint: "Vite" },
    { title: "Svelte", value: "svelte", hint: "Vite" },
    { title: "Next.js", value: "next", hint: "runs its own dev server" },
  ] as const;

  const drive = (keys: string) => {
    const t = fakeTerminal();
    const done = arrowSelect({ message: "Framework?", choices: LONG, filterable: true }, t.streams);
    t.press(keys);
    // The presses land one tick apart; wait past the last one before reading the screen.
    const waitTyped = () =>
      new Promise<void>((resolve) => setTimeout(resolve, keys.length * 4 + 10));
    return { t, done, waitTyped };
  };

  it("every redraw erases exactly the lines the previous frame printed", async () => {
    const { t, done } = drive(`sv${DOWN}${BACKSPACE}e${UP}${UP}${BACKSPACE}${BACKSPACE}${ENTER}`);
    expect(await done).toBe("react");
    expectCleanRedraws(t.printed());
  });

  it("repeated typing updates the filter in place without duplicating a choice", async () => {
    const { t, done, waitTyped } = drive(`sv${BACKSPACE}${BACKSPACE}ne`);
    await waitTyped();
    // The frame finally on screen lists each match once and nothing stale.
    const rows = menuOnScreen(t.printed());
    expect(rows.filter((row) => row.includes("Next.js"))).toHaveLength(1);
    expect(rows.some((row) => row.includes("React") || row.includes("Svelte"))).toBe(false);
    t.press(ENTER);
    expect(await done).toBe("next");
    expectCleanRedraws(t.printed());
  });

  it("a narrowing filter retires the stale rows of the open menu one by one", async () => {
    const { t, done, waitTyped } = drive(`ne`);
    await waitTyped();
    const rows = menuOnScreen(t.printed());
    expect(rows.filter((row) => row.includes("Next.js"))).toHaveLength(1);
    expect(rows.filter((row) => row.includes("React"))).toHaveLength(0);
    t.press(ENTER);
    expect(await done).toBe("next");
    expectCleanRedraws(t.printed());
  });

  it("a narrow terminal fits every row on one line, so the redraw still tracks the frame", async () => {
    const t = fakeTerminal();
    (t.streams.output as unknown as { columns: number }).columns = 24;
    const done = arrowSelect({ message: "Framework?", choices: LONG, filterable: true }, t.streams);
    t.press(`next${ENTER}`);
    expect(await done).toBe("next");
    expectCleanRedraws(t.printed());
    // The long hint never wrapped, so the resolved prompt leaves a single answered line behind.
    const tail = frameRows(t.printed());
    expect(tail).toHaveLength(1);
    expect(tail[0]).toContain("Framework?  Next.js");
  });
});
