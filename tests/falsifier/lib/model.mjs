// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// FALSIFIER's independent specification. Nothing here imports from cli/ or from ORACLE's invariants: it is what a user is entitled
// to expect, written down separately so a CLI surface cannot "agree" with a wrong implementation of the same rule.

// A resource and stack name becomes a container hostname, so it must be an RFC 1123 DNS label: lowercase letters, digits and
// hyphens, 1-63 characters, no leading or trailing hyphen.
export const MAX_NAME = 63;
export function isValidName(name) {
  return typeof name === "string" && name.length <= MAX_NAME && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name);
}

// graph: { nodeName: [dependsOn names] }. Returns one cycle as an array of names (a self-loop is [a]), or null. Iterative
// colouring DFS, written without reference to the CLI's detector.
export function findCycle(graph) {
  const state = new Map(); // undefined = new, 1 = on the stack, 2 = done
  for (const root of Object.keys(graph)) {
    if (state.get(root)) continue;
    const stack = [[root, 0]];
    const path = [root];
    state.set(root, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const next = (graph[top[0]] ?? []).filter((d) => d in graph)[top[1]++];
      if (next === undefined) { state.set(top[0], 2); stack.pop(); path.pop(); continue; }
      if (state.get(next) === 1) return path.slice(path.indexOf(next));
      if (!state.get(next)) { state.set(next, 1); stack.push([next, 0]); path.push(next); }
    }
  }
  return null;
}

export function dangling(graph) {
  return Object.entries(graph).flatMap(([from, deps]) => deps.filter((d) => !(d in graph)).map((to) => ({ from, to })));
}

// The exporter writes double-quoted scalars. Read the `environment:` and `depends_on:` of one service block without a YAML
// library. A value that is not a quoted scalar is returned as {raw}, which no string equals: an unquoted `yes` or `007` is a
// YAML 1.1 boolean / octal that Compose may read as something else.
export function parseComposeService(text, name) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l === `  ${name}:` || l === `  "${name}":`);
  if (at === -1) return null;
  const end = lines.findIndex((l, i) => i > at && /^  \S/.test(l) || (i > at && /^\S/.test(l)));
  const block = lines.slice(at + 1, end === -1 ? undefined : end);
  const env = {};
  const dependsOn = [];
  let section = "";
  let image = null;
  for (const l of block) {
    const head = /^    (\w+):\s*(.*)$/.exec(l);
    if (head) { section = head[1]; if (section === "image") image = unquote(head[2]); continue; }
    const kv = /^      ("?[\w.-]+"?):\s*(.*)$/.exec(l);
    if (kv && section === "environment") env[kv[1].replace(/^"|"$/g, "")] = unquote(kv[2]);
    else if (kv && section === "depends_on") dependsOn.push(kv[1].replace(/^"|"$/g, ""));
    const item = /^      - (.*)$/.exec(l);
    if (item && section === "depends_on") dependsOn.push(unquote(item[1]));
  }
  return { env, dependsOn, image };
}
function unquote(s) {
  const v = s.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return { raw: v }; } }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return { raw: v };
}
