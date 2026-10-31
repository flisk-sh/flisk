// Flisk App Builder: a remote, read-only, keyless MCP server at https://mcp.flisk.sh/mcp for the Claude directory.
// Say what app you want, get a plain-words plan and the commands to run it on your own computer. No storage, no model.
import { APPLE_TOUCH_PNG_BASE64, FAVICON_ICO_BASE64, ICON_512_PNG_BASE64, ICON_SVG } from "./icons.js";
import { appBuilderMcpRoute } from "./mcp.js";

const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...headers } });

const PAGE = `Flisk App Builder (MCP)

Tell your AI what app you want. It plans the parts and gives you the exact commands to build and run it on your own computer.

MCP server (Streamable HTTP, no key, read-only): https://mcp.flisk.sh/mcp
Tools: plan_app, list_app_starters
Try it without an AI: npx @flisk-sh/flisk demo
Source: https://github.com/flisk-sh/flisk/tree/main/workers/app-builder-mcp
Privacy: nothing is stored, nothing is logged by this server's code, no account, no key.
`;

const STATIC = {
  "/favicon.ico": ["image/x-icon", bytesOf(FAVICON_ICO_BASE64)],
  "/apple-touch-icon.png": ["image/png", bytesOf(APPLE_TOUCH_PNG_BASE64)],
  "/icon-512.png": ["image/png", bytesOf(ICON_512_PNG_BASE64)],
  "/icon.svg": ["image/svg+xml", ICON_SVG],
  "/robots.txt": ["text/plain; charset=utf-8", "User-agent: *\nAllow: /\n"],
  "/": ["text/plain; charset=utf-8", PAGE],
  "/about": ["text/plain; charset=utf-8", PAGE],
};

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") return appBuilderMcpRoute(request, json);
    if (pathname === "/health") return json({ ok: true });
    const hit = STATIC[pathname];
    if (hit && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(request.method === "HEAD" ? null : hit[1], { headers: { "content-type": hit[0], "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
    }
    return json({ error: "not_found", hint: "The MCP server is at /mcp" }, 404);
  },
};
