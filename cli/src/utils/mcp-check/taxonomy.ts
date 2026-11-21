// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/** localhost, *.localhost, 127.0.0.0/8 and [::1]: hosts on this machine, where nothing else can answer instead. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

/**
 * Whether a failed fetch is a refused connection to a loopback host: the operating system has said that nothing listens
 * there, so a retry would get the same answer (#3887). Bun puts the code on the error, Node on its cause.
 */
export function isFinalNetworkError(target: string, error: unknown): boolean {
  const codes = [
    (error as { code?: unknown } | null)?.code,
    (error as { cause?: { code?: unknown } } | null)?.cause?.code,
  ];
  if (!codes.some((code) => code === "ECONNREFUSED" || code === "ConnectionRefused")) return false;
  try {
    return isLoopbackHost(new URL(target).hostname);
  } catch {
    return false;
  }
}
