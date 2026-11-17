import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/native-windows.js
var NATIVE_WINDOWS_REFUSAL = "Landscape startup needs Ubuntu on WSL2. Native Windows runs only services that declare a command, as local processes.";
var WINDOWS_GUIDE_URL = "https://github.com/flisk-sh/flisk/blob/main/docs/setup/windows.md";
var NATIVE_WINDOWS_NEXT_STEP = [
  "You are on Windows. Open Ubuntu (WSL2) and run Flisk there:",
  "  1. In PowerShell (as administrator): wsl --install -d Ubuntu",
  "  2. Open the Ubuntu app, then run:",
  "       curl -fsSL https://flisk.sh/install.sh | sh",
  "       flisk up",
  `Windows guide: ${WINDOWS_GUIDE_URL}`
].join("\n");
var NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP = `${NATIVE_WINDOWS_REFUSAL}
${NATIVE_WINDOWS_NEXT_STEP}`;
function nativeWindowsStackRefusal(platform, allowNativeWindows) {
  if (platform !== "win32" || allowNativeWindows === "1")
    return null;
  return NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP;
}
function nativeWindowsImportNotice(platform, allowNativeWindows) {
  if (platform !== "win32" || allowNativeWindows === "1")
    return null;
  return [
    "Note for Windows: import works here, but `flisk up` for container services (an image or a Dockerfile) needs Ubuntu on WSL2.",
    "  Services that declare a command run on Windows as local processes.",
    "  To start the imported app, clone it inside Ubuntu (~/, not /mnt/c or D:\\) with Docker Desktop's WSL integration on,",
    "  and install Node and Tilt in Ubuntu too.",
    `  Windows guide: ${WINDOWS_GUIDE_URL}`
  ].join("\n");
}

export {
  NATIVE_WINDOWS_REFUSAL,
  WINDOWS_GUIDE_URL,
  NATIVE_WINDOWS_NEXT_STEP,
  NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP,
  nativeWindowsStackRefusal,
  nativeWindowsImportNotice
};
