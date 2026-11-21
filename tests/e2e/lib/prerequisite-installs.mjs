// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The prerequisites table in README.md, docs/quickstart.md and the translated READMEs must never show a
// `curl … | bash` installer as the only way to install Tilt or Bun on Windows. A Windows PowerShell command,
// or an explicit WSL2 instruction for the Docker + Tilt path, is the alternative.

const POSIX_INSTALL = /curl[^`\n]*\|\s*bash/i;
const WINDOWS_INSTALL = /\bpowershell\b|\birm\b|\biex\b|DownloadString|\bWSL\s*2?\b/i;

// Markdown tables escape a literal pipe inside a code span as `\|`. Restore it before splitting cells.
const cellsOf = (line) =>
  line
    .replace(/\\\|/g, "\u0000")
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim().replaceAll("\u0000", "|"));

/** Return one message per Tilt/Bun table row whose install cell is POSIX-only. */
export function posixOnlyPrerequisiteInstalls(text) {
  const findings = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = cellsOf(line);
    if (cells.length < 3) continue;
    const tool = cells[0].replace(/[*`_]/g, "").trim();
    if (!/^(tilt|bun)$/i.test(tool)) continue;
    const install = cells[2];
    if (!POSIX_INSTALL.test(install)) continue;
    if (WINDOWS_INSTALL.test(install)) continue;
    findings.push(`${tool}: POSIX-only curl | bash install with no Windows alternative`);
  }
  return findings;
}
