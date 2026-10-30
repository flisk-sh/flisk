import { describe, expect, it } from "vitest";
import { compileTemplate } from "../mini-template.js";

const helpers = {
  raw: { raw: true, fn: (v: unknown) => `<${String(v)}>` },
  esc: { raw: false, fn: (v: unknown) => `<${String(v)}>` },
};
const render = (src: string, ctx: unknown) => compileTemplate(src, helpers)(ctx);

describe("mini-template", () => {
  it("resolves paths, missing values and HTML-escapes", () => {
    expect(render("{{a.b}}|{{a.x.y}}|{{n}}", { a: { b: 1 }, n: "<&'>" })).toBe(
      "1||&lt;&amp;&#x27;&gt;",
    );
    expect(render("{{{n}}}", { n: "<&>" })).toBe("<&>");
  });

  it("applies helpers, escaping only non-raw ones", () => {
    expect(render("{{raw v}}{{esc v}}", { v: 1 })).toBe("<1>&lt;1&gt;");
  });

  it("iterates arrays and objects with this, @key, lookup and ../", () => {
    expect(render("{{#each l}}[{{this}}]{{/each}}", { l: ["a", "b"] })).toBe("[a][b]");
    expect(
      render("{{#each o}}{{@key}}={{this}}/{{lookup ../d @key}};{{/each}}", {
        o: { x: 1, y: 2 },
        d: { x: "X" },
      }),
    ).toBe("x=1/X;y=2/;");
  });

  it("renders #if only for truthy values and empty arrays are falsy", () => {
    const src = "{{#if v}}yes{{/if}}";
    expect(render(src, { v: "a" })).toBe("yes");
    for (const v of [undefined, null, "", 0, false, []]) expect(render(src, { v })).toBe("");
  });

  it("drops lines that hold only a block tag, like Handlebars", () => {
    expect(render("a\n{{#each l}}\n  {{this}}\n{{/each}}\nb\n", { l: [1, 2] })).toBe(
      "a\n  1\n  2\nb\n",
    );
  });

  it("rejects unbalanced blocks", () => {
    expect(() => render("{{#each l}}", { l: [] })).toThrow(/Unclosed/);
    expect(() => render("{{/if}}", {})).toThrow(/Unmatched/);
  });
});
