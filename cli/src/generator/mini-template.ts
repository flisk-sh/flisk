// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Minimal Handlebars-compatible renderer for the .hbs templates in cli/templates.
// Supports exactly what they use: {{path}}, {{{path}}}, {{helper arg}}, {{lookup obj key}},
// {{#each}} (arrays and objects, with this/@key/../), {{#if}}, and Handlebars' removal of
// lines that hold only a block tag. Replaces the 2.8 MB handlebars dependency.

export type TemplateHelper = (value: unknown) => string;
export type TemplateHelpers = Record<string, { fn: TemplateHelper; raw: boolean }>;

type Node =
  | { t: "text"; v: string }
  | { t: "expr"; expr: string; raw: boolean }
  | { t: "block"; kind: "each" | "if"; expr: string; body: Node[] };

interface Scope {
  ctx: unknown;
  parent: Scope | null;
  key?: string;
}

const TAG = /\{\{(\{?)\s*([^{}]*?)\s*\}?\}\}/g;

function parse(source: string): Node[] {
  const root: Node[] = [];
  const stack: { node: Extract<Node, { t: "block" }>; tag: string }[] = [];
  let out = root;
  let pos = 0;
  let pendingTrim = false;

  const pushText = (text: string): void => {
    if (pendingTrim) {
      // Standalone block tag: also drop the rest of its line, including the newline.
      text = text.replace(/^[ \t]*\r?\n/, "");
      pendingTrim = false;
    }
    if (text) out.push({ t: "text", v: text });
  };

  for (const m of source.matchAll(TAG)) {
    const start = m.index ?? 0;
    const text = source.slice(pos, start);
    pos = start + m[0].length;
    const triple = m[1] === "{";
    const body = m[2] ?? "";
    const isBlock = !triple && (body.startsWith("#") || body.startsWith("/"));

    if (isBlock) {
      // Standalone: only whitespace between the line start and this tag, and between the tag and
      // the next newline. The line start is inside `text` when it holds a newline, else only at
      // the very start of the source or right after another standalone tag.
      const nl = text.lastIndexOf("\n");
      const atLineStart = nl >= 0 || start === text.length || pendingTrim;
      const before = nl >= 0 ? text.slice(nl + 1) : text;
      const after = /^[ \t]*(\r?\n|$)/.test(source.slice(pos));
      if (atLineStart && /^[ \t]*$/.test(before) && after) {
        const keep = nl >= 0 ? text.slice(0, nl + 1) : "";
        pushText(keep);
        pendingTrim = true;
      } else {
        pushText(text);
      }
    } else {
      pushText(text);
    }

    if (body.startsWith("#")) {
      const [kind, ...rest] = body.slice(1).trim().split(/\s+/);
      if (kind !== "each" && kind !== "if") throw new Error(`Unsupported block: ${body}`);
      const node: Extract<Node, { t: "block" }> = {
        t: "block",
        kind,
        expr: rest.join(" "),
        body: [],
      };
      out.push(node);
      stack.push({ node, tag: kind });
      out = node.body;
    } else if (body.startsWith("/")) {
      const open = stack.pop();
      if (!open || open.tag !== body.slice(1).trim()) throw new Error(`Unmatched ${body}`);
      out = stack.length > 0 ? (stack[stack.length - 1]?.node.body ?? root) : root;
    } else {
      out.push({ t: "expr", expr: body, raw: triple });
    }
  }
  pushText(source.slice(pos));
  if (stack.length > 0) throw new Error(`Unclosed block: ${stack[stack.length - 1]?.tag}`);
  return root;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"'`=]/g, (c) => ESCAPES[c] ?? c);
}

/** Read an own property only, so a template cannot reach `constructor` or `__proto__`. */
function getOwn(obj: unknown, key: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  return Object.hasOwn(Object(obj), key) ? (obj as Record<string, unknown>)[key] : undefined;
}

function resolvePath(path: string, scope: Scope): unknown {
  if (path === "@key") return scope.key;
  let s: Scope | null = scope;
  let p = path;
  while (p.startsWith("../")) {
    s = s?.parent ?? null;
    p = p.slice(3);
  }
  if (!s) return undefined;
  if (p === "this" || p === ".") return s.ctx;
  if (p.startsWith("this.")) p = p.slice(5);
  let cur: unknown = s.ctx;
  for (const part of p.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = getOwn(cur, part);
  }
  return cur;
}

function isTruthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v) && v !== 0;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(stringify).join(",");
  return String(v);
}

function evalExpr(
  expr: string,
  scope: Scope,
  helpers: TemplateHelpers,
): { s: string; raw: boolean } {
  const parts = expr.split(/\s+/);
  const head = parts[0] ?? "";
  if (head === "lookup" && parts.length === 3) {
    const obj = resolvePath(parts[1] ?? "", scope);
    const keyVal = resolvePath(parts[2] ?? "", scope);
    const v = obj !== null && typeof obj === "object" ? getOwn(obj, String(keyVal)) : undefined;
    return { s: stringify(v), raw: false };
  }
  const helper = helpers[head];
  if (helper && parts.length === 2) {
    return { s: helper.fn(resolvePath(parts[1] ?? "", scope)), raw: helper.raw };
  }
  if (parts.length !== 1) throw new Error(`Unsupported expression: ${expr}`);
  return { s: stringify(resolvePath(head, scope)), raw: false };
}

function renderNodes(nodes: Node[], scope: Scope, helpers: TemplateHelpers): string {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") {
      out += n.v;
    } else if (n.t === "expr") {
      const r = evalExpr(n.expr, scope, helpers);
      out += n.raw || r.raw ? r.s : escapeHtml(r.s);
    } else if (n.kind === "if") {
      if (isTruthy(resolvePath(n.expr, scope))) out += renderNodes(n.body, scope, helpers);
    } else {
      const coll = resolvePath(n.expr, scope);
      if (Array.isArray(coll)) {
        for (const item of coll) {
          out += renderNodes(n.body, { ctx: item, parent: scope }, helpers);
        }
      } else if (coll !== null && typeof coll === "object") {
        for (const [key, item] of Object.entries(coll)) {
          out += renderNodes(n.body, { ctx: item, parent: scope, key }, helpers);
        }
      }
    }
  }
  return out;
}

export function compileTemplate(
  source: string,
  helpers: TemplateHelpers,
): (context: unknown) => string {
  const ast = parse(source);
  return (context) => renderNodes(ast, { ctx: context, parent: null }, helpers);
}
