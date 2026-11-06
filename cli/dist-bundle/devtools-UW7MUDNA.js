import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import "./chunk-VVP2Y2AJ.js";

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/ink@8.0.0+a3129c410b405b6c/node_modules/ink/build/devtools-window-polyfill.js
var customGlobal = globalThis;
customGlobal.window ||= globalThis;
customGlobal.self ||= globalThis;
customGlobal.window.__REACT_DEVTOOLS_COMPONENT_FILTERS__ = [
  {
    // ComponentFilterElementType
    type: 1,
    // ElementTypeHostComponent
    value: 7,
    isEnabled: true
  },
  {
    // ComponentFilterDisplayName
    type: 2,
    value: "InternalApp",
    isEnabled: true,
    isValid: true
  },
  {
    // ComponentFilterDisplayName
    type: 2,
    value: "InternalAppContext",
    isEnabled: true,
    isValid: true
  },
  {
    // ComponentFilterDisplayName
    type: 2,
    value: "InternalStdoutContext",
    isEnabled: true,
    isValid: true
  },
  {
    // ComponentFilterDisplayName
    type: 2,
    value: "InternalStderrContext",
    isEnabled: true,
    isValid: true
  },
  {
    // ComponentFilterDisplayName
    type: 2,
    value: "InternalStdinContext",
    isEnabled: true,
    isValid: true
  },
  {
    // ComponentFilterDisplayName
    type: 2,
    value: "InternalFocusContext",
    isEnabled: true,
    isValid: true
  }
];

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/ink@8.0.0+a3129c410b405b6c/node_modules/ink/build/devtools.js
import devtools from "react-devtools-core";

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/ink@8.0.0+a3129c410b405b6c/node_modules/ink/build/is-devtools-reachable.js
var isDevToolsReachable = async (url = "ws://localhost:8097", timeoutMs = 2e3) => new Promise((resolve) => {
  const socket = new WebSocket(url);
  const timeout = setTimeout(() => {
    resolve(false);
    socket.close();
  }, timeoutMs);
  timeout.unref();
  socket.addEventListener("open", () => {
    clearTimeout(timeout);
    socket.close();
    resolve(true);
  });
  socket.addEventListener("error", () => {
    clearTimeout(timeout);
    resolve(false);
  });
});
var is_devtools_reachable_default = isDevToolsReachable;

// ../../../../../../../../Users/katerynaburym/Developer/Codex/flisk/node_modules/.bun/ink@8.0.0+a3129c410b405b6c/node_modules/ink/build/devtools.js
if (await is_devtools_reachable_default()) {
  devtools.initialize();
  devtools.connectToDevTools();
} else {
  console.warn("DEV is set to true, but the React DevTools server is not running. Start it with:\n\n$ npx react-devtools\n");
}
