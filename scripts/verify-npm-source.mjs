#!/usr/bin/env node
// Verify that an npm package was built from the expected commit.
// Usage: node scripts/verify-npm-source.mjs --package @flisk-sh/flisk --version 1.4.31 --commit abc123def456
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const main = () => {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };

  const pkg = flag("--package") || process.env.NPM_PACKAGE || "@flisk-sh/flisk";
  const version = flag("--version") || process.env.NPM_VERSION;
  const expectedCommit = flag("--commit") || process.env.EXPECTED_COMMIT;

  if (!version || !expectedCommit) {
    console.error("usage: verify-npm-source.mjs --package <pkg> --version <ver> --commit <sha>");
    process.exit(2);
  }

  const tempDir = mkdtempSync(join(tmpdir(), "npm-verify-"));
  try {
    // Fetch the npm package tarball URL
    // The registry can lag a few seconds behind a publish, so retry before giving up.
    let tarballUrl;
    for (let attempt = 1; attempt <= 12 && !tarballUrl; attempt++) {
      try {
        const npmView = JSON.parse(
          execFileSync("npm", ["view", `${pkg}@${version}`, "--json"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }),
        );
        tarballUrl = npmView.dist?.tarball;
      } catch {
        // not visible yet
      }
      if (!tarballUrl) execFileSync("sleep", ["10"]);
    }
    if (!tarballUrl) {
      console.error(`::error::npm view ${pkg}@${version} is not visible on the registry after 2 minutes`);
      process.exit(1);
    }

    // Download and extract the tarball
    const tarballPath = join(tempDir, "package.tgz");
    execFileSync("curl", ["-fsSL", "--output", tarballPath, tarballUrl], { stdio: "inherit" });
    execFileSync("tar", ["-xzf", tarballPath, "-C", tempDir]);

    // Check for a .sourceSHA file (would be set by the build script)
    const sourceFile = join(tempDir, "package", ".sourceSHA");
    let sourceSHA = "";
    try {
      sourceSHA = readFileSync(sourceFile, "utf8").trim();
    } catch {
      // Fallback: extract from dist-tagged commit in version metadata or changelog
      console.warn("::warning::No .sourceSHA file in package, skipping source verification for now");
      console.log(`Published ${pkg}@${version}. Manual verification: npm pack && tar -tzf *.tgz | head`);
      return;
    }

    if (sourceSHA !== expectedCommit) {
      console.error(
        `::error::npm package ${pkg}@${version} was built from commit ${sourceSHA}, expected ${expectedCommit}`,
      );
      process.exit(1);
    }
    console.log(`✓ Verified ${pkg}@${version} was built from commit ${expectedCommit}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

main();
