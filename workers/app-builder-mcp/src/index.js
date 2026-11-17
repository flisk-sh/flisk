// Build Me an App MCP: a remote, read-only, keyless MCP server at https://build.flisk.si/mcp for the Claude directory.
// Say what app you want, get a plain-words plan and the commands to run it on your own computer. No storage, no model.
import { APPLE_TOUCH_PNG_BASE64, FAVICON_ICO_BASE64, ICON_512_PNG_BASE64, ICON_SVG } from "./icons.js";
import { MAX_BODY_BYTES, overLimit } from "./limits.js";
import { appBuilderMcpRoute } from "./mcp.js";
import { withSecurityHeaders } from "./security-headers.js";

const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...headers } });

const SOURCE = "https://github.com/flisk-sh/flisk/tree/main/workers/app-builder-mcp";
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Build Me an App: plan an app in plain words</title>
<meta name="description" content="Tell your AI what app you want. It plans the parts and gives you the exact commands to build and run it on your own computer.">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:2rem 1rem;color:#1a1a1a;background:#fff}
@media(prefers-color-scheme:dark){body{color:#eee;background:#111}a{color:#8bdfff}}
h1{font-size:2rem;line-height:1.2;margin:0 0 .5rem}
.btn{display:inline-block;margin:.5rem 0 1.5rem;padding:.6rem 1.1rem;border-radius:.4rem;background:#1a1a1a;color:#fff;text-decoration:none;font-weight:600}
code{font:14px ui-monospace,Menlo,monospace;word-break:break-all}
</style>
</head>
<body>
<main>
<h1>Plan an app in plain words</h1>
<p>For anyone with an AI assistant: say what app you want and get a plan and the exact commands to run it on your own computer.</p>
<p><a class="btn" href="${SOURCE}">See how to add it</a></p>
<p>Build Me an App MCP (Streamable HTTP, no key, read-only): <code>https://build.flisk.si/mcp</code></p>
<p>Tools: plan_app, list_app_starters</p>
<p>Try it without an AI: <code>npx @flisk-sh/flisk demo</code></p>
<p>Source: <a href="${SOURCE}">${SOURCE}</a></p>
<p>Privacy: nothing is stored, nothing is logged by this server's code, no account, no key.</p>
</main>
</body>
</html>
`;

const STATIC = {
  "/favicon.ico": ["image/x-icon", bytesOf(FAVICON_ICO_BASE64)],
  "/apple-touch-icon.png": ["image/png", bytesOf(APPLE_TOUCH_PNG_BASE64)],
  "/icon-512.png": ["image/png", bytesOf(ICON_512_PNG_BASE64)],
  "/icon.svg": ["image/svg+xml", ICON_SVG],
  "/robots.txt": ["text/plain; charset=utf-8", "User-agent: *\nAllow: /\n"],
  "/": ["text/html; charset=utf-8", PAGE],
  "/about": ["text/html; charset=utf-8", PAGE],
};

const app = {
  async fetch(request, env = {}) {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") {
      // Only POSTs do work: count them per caller, and refuse a body that is far larger than any real message.
      if (request.method === "POST") {
        const { limited, retryAfter } = await overLimit(request, env);
        if (limited) return json({ error: "rate_limited", hint: "Too many requests from this address. Try again later." }, 429, { "retry-after": String(retryAfter) });
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "too_large", hint: `Keep the request under ${MAX_BODY_BYTES} bytes.` }, 413);
      }
      return appBuilderMcpRoute(request, json);
    }
    if (pathname === "/health") return json({ ok: true });
    const hit = STATIC[pathname];
    if (hit && (request.method === "GET" || request.method === "HEAD")) {
      return new Response(request.method === "HEAD" ? null : hit[1], { headers: { "content-type": hit[0], "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
    }
    return json({ error: "not_found", hint: "The MCP server is at /mcp" }, 404);
  },
};

export default {
  async fetch(request, env = {}, ctx) {
    return withSecurityHeaders(await app.fetch(request, env, ctx));
  },
};
