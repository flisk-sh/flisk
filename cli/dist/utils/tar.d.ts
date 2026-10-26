/**
 * Extracts a gzipped tarball (as an in-memory buffer) into destDir.
 * Shells out to the system `tar` binary rather than pulling in a JS tar
 * implementation - available by default on macOS and Linux. On Windows it
 * runs `tar.exe`, which ships with Windows 10 (1803) and later; see
 * docs/windows-hardware.md.
 */
export declare function extractTarball(data: Buffer, destDir: string): void;
