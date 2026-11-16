// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { PROJECT_TEMPLATES, templateTargetDir } from "../../utils/project-templates.js";
import { formatProjectPaths } from "../project.js";

/** Bundled starters are written by the CLI, not cloned from their own repository. */
const BUNDLED_STARTERS = Object.entries(PROJECT_TEMPLATES)
  .filter(([, template]) => template.bundledPath || template.generated || template.composed)
  .map(([name]) => name);

describe("templateTargetDir for bundled starters", () => {
  it("uses the starter name for every starter that is written without a clone", () => {
    expect(BUNDLED_STARTERS).toEqual(
      expect.arrayContaining([
        "swarm",
        "security",
        "super-agent",
        "langgraph",
        "tool-loop",
        "next-postgres",
      ]),
    );
    for (const name of BUNDLED_STARTERS) {
      if (name === "example") continue; // The bundled example keeps its own repository folder.
      expect(templateTargetDir(name), name).toBe(name);
    }
  });

  it("still uses the repository name for starters cloned from their own repository", () => {
    expect(templateTargetDir("restaurant")).toBe("flisk-restaurant-example");
    expect(templateTargetDir("saas")).toBe("flisk-saas-starter");
    expect(templateTargetDir("agent-stack")).toBe("flisk-agent-stack");
    expect(templateTargetDir("example")).toBe("flisk-example");
  });

  it("gives distinct starters distinct default folders, except aliases of one repository", () => {
    const folders = new Map<string, string[]>();
    for (const name of Object.keys(PROJECT_TEMPLATES)) {
      const folder = templateTargetDir(name);
      folders.set(folder, [...(folders.get(folder) ?? []), name]);
    }
    for (const [folder, names] of folders) {
      if (names.length === 1) continue;
      // `demo` and `restaurant` are two names for the same project, so one folder is right for them.
      const repos = new Set(names.map((name) => PROJECT_TEMPLATES[name]?.repo));
      expect(repos.size, `${folder} is shared by ${names.join(", ")}`).toBe(1);
      expect(
        names.every((name) => !PROJECT_TEMPLATES[name]?.generated),
        folder,
      ).toBe(true);
      expect(
        names.every((name) => !PROJECT_TEMPLATES[name]?.composed),
        folder,
      ).toBe(true);
    }
  });

  it("lets an explicit --path win", () => {
    for (const name of BUNDLED_STARTERS) {
      expect(templateTargetDir(name, "my-app"), name).toBe("my-app");
    }
  });
});

describe("flisk project with two bundled starters in one folder", () => {
  it("creates both folders and prints the folder that was really created", () => {
    const parent = createTempDir("flisk-bundled-starter-");

    const first = runFlisk(["project", "tool-loop", "--yes"], { cwd: parent });
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain(`Created "tool-loop" in tool-loop/`);
    expect(first.stdout).toContain("1. cd tool-loop");
    expect(existsSync(join(parent, "tool-loop", "README.md"))).toBe(true);

    const second = runFlisk(["project", "swarm", "--yes"], { cwd: parent });
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain(`Created "swarm" in swarm/`);
    expect(second.stdout).toContain("1. cd swarm");
    expect(existsSync(join(parent, "swarm", "README.md"))).toBe(true);
    expect(existsSync(join(parent, "flisk"))).toBe(false);
  });

  it("names the real folder in the --json result and --path still wins", () => {
    const parent = createTempDir("flisk-bundled-starter-json-");

    const generated = runFlisk(["project", "tool-loop", "--json"], { cwd: parent });
    expect(generated.status, generated.stderr).toBe(0);
    expect(parseEnvelope(generated.stdout).data).toMatchObject({
      action: "cloned",
      template: "tool-loop",
      path: join(parent, "tool-loop"),
    });

    const explicit = runFlisk(["project", "security", "--path", "my-app", "--json"], {
      cwd: parent,
    });
    expect(explicit.status, explicit.stderr).toBe(0);
    expect(parseEnvelope(explicit.stdout).data).toMatchObject({
      action: "cloned",
      template: "security",
      path: join(parent, "my-app"),
    });
    expect(existsSync(join(parent, "my-app", "README.md"))).toBe(true);
  });

  it("preserves parent folders and quotes spaces in cd next steps for explicit --path", () => {
    const parent = createTempDir("flisk-bundled-starter-nested-");

    const nested = runFlisk(["project", "tool-loop", "--path", "apps/my-app", "--yes"], {
      cwd: parent,
    });
    expect(nested.status, nested.stderr).toBe(0);
    expect(nested.stdout).toContain(`Created "tool-loop" in apps/my-app/`);
    expect(nested.stdout).toContain("1. cd apps/my-app");
    expect(existsSync(join(parent, "apps", "my-app", "README.md"))).toBe(true);

    const spaced = runFlisk(["project", "next-postgres", "--path", "apps/my app/", "--yes"], {
      cwd: parent,
    });
    expect(spaced.status, spaced.stderr).toBe(0);
    expect(spaced.stdout).toContain(`Created "next-postgres" in apps/my app/`);
    for (const cmdLine of formatProjectPaths("apps/my app/", process.platform, process.env)
      .cdCommands) {
      expect(spaced.stdout).toContain(cmdLine);
    }
    expect(existsSync(join(parent, "apps", "my app", "README.md"))).toBe(true);

    const globbed = runFlisk(["project", "tool-loop", "--path", "apps/{a,b}", "--yes"], {
      cwd: parent,
    });
    expect(globbed.status, globbed.stderr).toBe(0);
    for (const cmdLine of formatProjectPaths("apps/{a,b}", process.platform, process.env)
      .cdCommands) {
      expect(globbed.stdout).toContain(cmdLine);
    }
    expect(existsSync(join(parent, "apps", "{a,b}", "README.md"))).toBe(true);

    if (process.platform !== "win32") {
      const backslash = runFlisk(["project", "tool-loop", "--path", "apps/my-app\\", "--yes"], {
        cwd: parent,
      });
      expect(backslash.status, backslash.stderr).toBe(0);
      expect(backslash.stdout).toContain("1. cd 'apps/my-app\\'");
      expect(existsSync(join(parent, "apps", "my-app\\", "README.md"))).toBe(true);
    }

    const dashed = runFlisk(["project", "tool-loop", "--path=-app", "--yes"], {
      cwd: parent,
    });
    expect(dashed.status, dashed.stderr).toBe(0);
    expect(dashed.stdout).toContain(
      process.platform === "win32" ? "1. cd .\\-app" : "1. cd ./-app",
    );
    expect(existsSync(join(parent, "-app", "README.md"))).toBe(true);
  });

  it("formats cd next steps cleanly for Windows cmd.exe, PowerShell, nested shells, and POSIX", () => {
    // Models cmd.exe three-phase parsing (1: %VAR%, 2: quotes & unquoted ^, 3: /v:on !VAR!)
    // and cd drive-switch semantics (/d required when changing drives).
    function evaluateCmdCd(
      command: string,
      env: Record<string, string>,
      delayedExpansion: boolean,
      startDrive = "C:",
    ): { drive: string; target: string } {
      const line = command;

      // Phase 1: interactive %VAR% expansion (undefined %NAME% stays verbatim).
      let p1 = "";
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "%") {
          const close = line.indexOf("%", i + 1);
          if (close !== -1) {
            const name = line.slice(i + 1, close);
            if (Object.hasOwn(env, name)) {
              p1 += env[name];
              i = close;
              continue;
            }
            p1 += line.slice(i, close + 1);
            i = close;
            continue;
          }
        }
        p1 += line[i];
      }

      // Phase 2: quote & unquoted caret parsing (inside "...", ^ is literal).
      let p2 = "";
      let inQuotes = false;
      for (let i = 0; i < p1.length; i++) {
        const ch = p1[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
          p2 += ch;
        } else if (ch === "^" && !inQuotes && i + 1 < p1.length) {
          p2 += p1[++i];
        } else {
          p2 += ch;
        }
      }

      // Phase 3: delayed !VAR! expansion when /v:on and at least one `!` exists.
      let p3 = p2;
      if (delayedExpansion && p2.includes("!")) {
        p3 = "";
        for (let i = 0; i < p2.length; i++) {
          const ch = p2[i];
          if (ch === "^" && i + 1 < p2.length) {
            p3 += p2[++i];
            continue;
          }
          if (ch === "!") {
            const close = findUnescapedBang(p2, i + 1);
            if (close !== -1) {
              const name = p2.slice(i + 1, close);
              p3 += Object.hasOwn(env, name) ? env[name] : "";
              i = close;
              continue;
            }
            // Unmatched `!` is removed by delayed expansion.
            continue;
          }
          p3 += ch;
        }
      }

      const trimmed = p3.trimStart();
      const cmdMatch = /^(cd|pushd)\s+/i.exec(trimmed);
      if (!cmdMatch) throw new Error(`Expected cd or pushd command, got: ${trimmed}`);
      const verb = cmdMatch[1].toLowerCase();
      let rest = trimmed.slice(cmdMatch[0].length).trimStart();
      let switchDrive = verb === "pushd";
      if (verb === "cd" && /^\/d\s+/i.test(rest)) {
        switchDrive = true;
        rest = rest.slice(2).trimStart();
      }
      const target = rest.replace(/"/g, "");
      const driveMatch = /^([A-Za-z]:)/.exec(target);
      const targetDrive = driveMatch ? driveMatch[1].toUpperCase() : startDrive.toUpperCase();
      const drive = switchDrive ? targetDrive : startDrive.toUpperCase();
      return { drive, target };
    }

    function findUnescapedBang(text: string, from: number): number {
      for (let i = from; i < text.length; i++) {
        if (text[i] === "^") {
          i++;
          continue;
        }
        if (text[i] === "!") return i;
      }
      return -1;
    }

    const cmdEnv = { TEMP: "C:\\Temp", BAR: "WRONG" };

    // Explicit cmd adds `/d` for drive paths and quotes/escapes special characters.
    expect(formatProjectPaths("D:\\work\\my-app", "win32", {}, "cmd").cdCommands).toEqual([
      "cd /d D:\\work\\my-app",
    ]);
    expect(evaluateCmdCd("cd /d D:\\work\\my-app", cmdEnv, false, "C:")).toEqual({
      drive: "D:",
      target: "D:\\work\\my-app",
    });

    expect(formatProjectPaths("-app", "win32", {}, "cmd").cdCommands).toEqual(["cd .\\-app"]);

    expect(formatProjectPaths("C:\\work\\O'Reilly app", "win32", {}, "cmd").cdCommands).toEqual([
      'cd /d "C:\\work\\O\'Reilly app"',
    ]);

    expect(formatProjectPaths("apps/%TEMP%", "win32", {}, "cmd").cdCommands).toEqual([
      "cd apps/^%TEMP^%",
    ]);
    expect(evaluateCmdCd("cd apps/^%TEMP^%", cmdEnv, false)).toEqual({
      drive: "C:",
      target: "apps/%TEMP%",
    });
    expect(evaluateCmdCd("cd apps/^%TEMP^%", cmdEnv, true)).toEqual({
      drive: "C:",
      target: "apps/%TEMP%",
    });

    // `!` paths provide mode-specific `cmd.exe` (/v:off) and `cmd.exe (/v:on)` commands,
    // and explicit `cmd-delayed` emits escaping that survives both parsing phases.
    const bangPair = formatProjectPaths("apps/!TEMP!", "win32", {}, "cmd").cdCommands;
    expect(bangPair).toEqual([
      'cmd.exe:         cd "apps/!TEMP!"',
      "cmd.exe (/v:on): cd apps/^^^!TEMP^^^!",
    ]);
    expect(evaluateCmdCd(bangPair[0].replace(/^cmd\.exe:\s+/, ""), cmdEnv, false)).toEqual({
      drive: "C:",
      target: "apps/!TEMP!",
    });
    expect(
      evaluateCmdCd(bangPair[1].replace(/^cmd\.exe \(\/v:on\):\s+/, ""), cmdEnv, true),
    ).toEqual({
      drive: "C:",
      target: "apps/!TEMP!",
    });

    const mixedBang = formatProjectPaths("apps/my %TEMP%! dir", "win32", {}, "cmd").cdCommands;
    expect(mixedBang).toEqual([
      'cmd.exe:         cd "apps/my "^%TEMP^%"! dir"',
      'cmd.exe (/v:on): cd "apps/my "^%TEMP^%^^^!" dir"',
    ]);
    expect(evaluateCmdCd(mixedBang[0].replace(/^cmd\.exe:\s+/, ""), cmdEnv, false)).toEqual({
      drive: "C:",
      target: "apps/my %TEMP%! dir",
    });
    expect(
      evaluateCmdCd(mixedBang[1].replace(/^cmd\.exe \(\/v:on\):\s+/, ""), cmdEnv, true),
    ).toEqual({
      drive: "C:",
      target: "apps/my %TEMP%! dir",
    });

    const unmatchedBang = formatProjectPaths(
      "apps/unmatched!bang",
      "win32",
      {},
      "cmd-delayed",
    ).cdCommands;
    expect(unmatchedBang).toEqual(["cd apps/unmatched^^^!bang"]);
    expect(evaluateCmdCd(unmatchedBang[0], cmdEnv, true)).toEqual({
      drive: "C:",
      target: "apps/unmatched!bang",
    });

    // Without `!`, a caret next to `%` is quoted for cmd rather than doubled into `^^^^`.
    const percentCaret = formatProjectPaths("apps\\100%^", "win32", {}, "cmd").cdCommands;
    expect(percentCaret).toEqual(['cd apps\\100^%"^"']);
    expect(evaluateCmdCd(percentCaret[0], cmdEnv, false)).toEqual({
      drive: "C:",
      target: "apps\\100%^",
    });
    expect(evaluateCmdCd(percentCaret[0], cmdEnv, true)).toEqual({
      drive: "C:",
      target: "apps\\100%^",
    });

    // Git Bash on Windows (`MSYSTEM` without `PROMPT`/`POWERSHELL_DISTRIBUTION_CHANNEL`) selects POSIX formatting.
    expect(formatProjectPaths("apps/100%", "win32", { MSYSTEM: "MINGW64" }).cdCommands).toEqual([
      "cd 'apps/100%'",
    ]);

    // Ambiguous Windows fallback includes Git Bash alongside CMD and PowerShell.
    expect(formatProjectPaths("apps/100%", "win32", {}).cdCommands).toEqual([
      "cmd.exe:    cd apps/100^%",
      "PowerShell: Set-Location -LiteralPath 'apps/100%'",
      "Git Bash:   cd 'apps/100%'",
    ]);

    const caretAndBang = formatProjectPaths(
      "D:\\work\\a^b!TEMP!",
      "win32",
      {},
      "cmd-delayed",
    ).cdCommands;
    expect(caretAndBang).toEqual(["cd /d D:\\work\\a^^^^b^^^!TEMP^^^!"]);
    expect(evaluateCmdCd(caretAndBang[0], cmdEnv, true, "C:")).toEqual({
      drive: "D:",
      target: "D:\\work\\a^b!TEMP!",
    });

    // PowerShell 7+ without PROMPT uses Set-Location -LiteralPath for unsafe chars and bare cd for drive paths.
    expect(
      formatProjectPaths("apps/[demo]", "win32", {
        POWERSHELL_DISTRIBUTION_CHANNEL: "MSI:Windows",
      }).cdCommands,
    ).toEqual(["Set-Location -LiteralPath 'apps/[demo]'"]);
    expect(
      formatProjectPaths("D:\\work\\my-app", "win32", {
        POWERSHELL_DISTRIBUTION_CHANNEL: "MSI:Windows",
      }).cdCommands,
    ).toEqual(["cd D:\\work\\my-app"]);
    expect(
      formatProjectPaths("C:\\work\\O'Reilly app", "win32", {
        POWERSHELL_DISTRIBUTION_CHANNEL: "MSI:Windows",
      }).cdCommands,
    ).toEqual(["Set-Location -LiteralPath 'C:\\work\\O''Reilly app'"]);

    // Windows PowerShell 5.1 launched from CMD inherits PROMPT without POWERSHELL_DISTRIBUTION_CHANNEL,
    // so PROMPT alone is ambiguous and emits labeled cmd, PowerShell, and Git Bash alternatives.
    expect(formatProjectPaths("apps/[demo]", "win32", { PROMPT: "$P$G" }).cdCommands).toEqual([
      'cmd.exe:    cd "apps/[demo]"',
      "PowerShell: Set-Location -LiteralPath 'apps/[demo]'",
      "Git Bash:   cd 'apps/[demo]'",
    ]);
    expect(formatProjectPaths("D:\\work\\my-app", "win32", { PROMPT: "$P$G" }).cdCommands).toEqual([
      "cmd.exe:    cd /d D:\\work\\my-app",
      "PowerShell: cd D:\\work\\my-app",
      "Git Bash:   cd 'D:\\work\\my-app'",
    ]);
    expect(formatProjectPaths("apps/!TEMP!", "win32", { PROMPT: "$P$G" }).cdCommands).toEqual([
      'cmd.exe:         cd "apps/!TEMP!"',
      "cmd.exe (/v:on): cd apps/^^^!TEMP^^^!",
      "PowerShell:      Set-Location -LiteralPath 'apps/!TEMP!'",
      "Git Bash:        cd 'apps/!TEMP!'",
    ]);

    // Nested cmd inside pwsh (both env vars present) also prints labeled alternatives.
    expect(
      formatProjectPaths("apps/my app", "win32", {
        PROMPT: "$P$G",
        POWERSHELL_DISTRIBUTION_CHANNEL: "MSI:Windows",
      }).cdCommands,
    ).toEqual([
      'cmd.exe:    cd "apps/my app"',
      "PowerShell: Set-Location -LiteralPath 'apps/my app'",
      "Git Bash:   cd 'apps/my app'",
    ]);

    // Explicit shell selection (arg or FLISK_SHELL) overrides ambiguous env.
    expect(
      formatProjectPaths(
        "apps/my app",
        "win32",
        { PROMPT: "$P$G", POWERSHELL_DISTRIBUTION_CHANNEL: "MSI:Windows" },
        "cmd",
      ).cdCommands,
    ).toEqual(['cd "apps/my app"']);
    expect(
      formatProjectPaths("apps/[demo]", "win32", {
        PROMPT: "$P$G",
        FLISK_SHELL: "powershell",
      }).cdCommands,
    ).toEqual(["Set-Location -LiteralPath 'apps/[demo]'"]);

    // UNC targets use pushd in CMD (including forward-slash UNC normalization) and never collapse to cd.
    expect(formatProjectPaths("\\\\server\\share\\my-app", "win32", {}, "cmd").cdCommands).toEqual([
      "pushd \\\\server\\share\\my-app",
    ]);
    expect(formatProjectPaths("//server/share/my app", "win32", {}, "cmd").cdCommands).toEqual([
      'pushd "\\\\server\\share\\my app"',
    ]);
    const uncBang = formatProjectPaths("//server/share/!TEMP!", "win32", {}, "cmd").cdCommands;
    expect(uncBang).toEqual([
      'cmd.exe:         pushd "\\\\server\\share\\!TEMP!"',
      "cmd.exe (/v:on): pushd \\\\server\\share\\^^^!TEMP^^^!",
    ]);
    expect(evaluateCmdCd(uncBang[0].replace(/^cmd\.exe:\s+/, ""), cmdEnv, false)).toEqual({
      drive: "C:",
      target: "\\\\server\\share\\!TEMP!",
    });
    expect(evaluateCmdCd(uncBang[1].replace(/^cmd\.exe \(\/v:on\):\s+/, ""), cmdEnv, true)).toEqual(
      {
        drive: "C:",
        target: "\\\\server\\share\\!TEMP!",
      },
    );
    expect(formatProjectPaths("\\\\server\\share\\my-app", "win32", {}).cdCommands).toEqual([
      "cmd.exe:    pushd \\\\server\\share\\my-app",
      "PowerShell: cd \\\\server\\share\\my-app",
      "Git Bash:   cd '\\\\server\\share\\my-app'",
    ]);

    // Forward-slash-rooted Windows paths resolve against a drive/UNC workingDir or normalize `/` -> `\`
    // so `/d` never becomes CMD's `/d` switch and never shares a shortcut across shells.
    expect(formatProjectPaths("/d", "win32", {}, "cmd", "D:\\work").cdCommands).toEqual([
      "cd /d D:\\d",
    ]);
    expect(
      formatProjectPaths("/d", "win32", {}, "cmd", "\\\\server\\share\\work").cdCommands,
    ).toEqual(["pushd \\\\server\\share\\d"]);
    expect(formatProjectPaths("/d", "win32", {}, "cmd", "").cdCommands).toEqual(["cd \\d"]);
    expect(formatProjectPaths("/apps/my app", "win32", {}, "cmd", "C:\\work").cdCommands).toEqual([
      'cd /d "C:\\apps\\my app"',
    ]);
    expect(formatProjectPaths("/d", "win32", {}, "auto", "D:\\work").cdCommands).toEqual([
      "cmd.exe:    cd /d D:\\d",
      "PowerShell: cd /d",
      "Git Bash:   cd D:/d",
    ]);
    expect(
      formatProjectPaths("/d", "win32", { MSYSTEM: "MINGW64" }, "auto", "D:\\work").cdCommands,
    ).toEqual(["cd D:/d"]);
    expect(
      formatProjectPaths("\\d", "win32", { MSYSTEM: "MINGW64" }, "auto", "D:\\work").cdCommands,
    ).toEqual(["cd D:/d"]);
    expect(formatProjectPaths("/apps/my app", "win32", {}, "posix", "C:\\work").cdCommands).toEqual(
      ["cd 'C:/apps/my app'"],
    );
    expect(
      formatProjectPaths("/d", "win32", {}, "posix", "\\\\server\\share\\work").cdCommands,
    ).toEqual(["cd //server/share/d"]);
    expect(formatProjectPaths("/d", "win32", {}, "auto", "").cdCommands).toEqual([
      "cmd.exe:    cd \\d",
      "PowerShell: cd /d",
      "Git Bash:   cd /d",
    ]);

    expect(formatProjectPaths("apps/O'Reilly app", "darwin", {}).cdCommands).toEqual([
      "cd 'apps/O'\\''Reilly app'",
    ]);
  });
});
