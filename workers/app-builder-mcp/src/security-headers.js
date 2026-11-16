// Baseline security headers for every response. Copies the response (headers can be immutable) and passes the body stream through untouched.
// Default policy for a response that sets none: https-only sources, inline code allowed, no plugins, no foreign framing.
const DEFAULT_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https: wss:; media-src 'self' https:; frame-src 'self' https:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https:";

const BASELINE = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

export function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BASELINE)) if (!headers.has(name)) headers.set(name, value);
  const csp = headers.get("content-security-policy");
  if (!csp) headers.set("content-security-policy", DEFAULT_CSP);
  else if (!/(^|;)\s*frame-ancestors\s/i.test(csp)) headers.set("content-security-policy", `${csp.replace(/;\s*$/, "")}; frame-ancestors 'self'`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers, webSocket: response.webSocket });
}
