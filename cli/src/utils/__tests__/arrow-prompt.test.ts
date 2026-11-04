// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  arrowMultiSelect,
  arrowSelect,
  arrowText,
  filterChoices,
  menuAction,
  moveIndex,
  PromptCancelled,
  type PromptStreams,
  renderMenu,
} from "../arrow-prompt.js";

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
