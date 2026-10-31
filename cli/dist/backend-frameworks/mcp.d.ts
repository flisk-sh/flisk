import type { BackendFrameworkProvider } from "./types.js";
/**
 * The placeholder icon the scaffold serves at /icon-512.png: a 512 x 512 two-colour PNG (a white ring on green), 1.4 kB.
 * MCP directories and clients show it next to the server's name; the generated comment says to replace it.
 */
export declare const MCP_ICON_512_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAMAAADDpiTIAAAABlBMVEUWo0r///+zeCNEAAAFKklEQVR42u3c0XEYORDEUE7+SSsCfam4IomHCDgNeFW+s70WAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgB7zK7ZJapcC9TLgXgXcq4B8EZAvAvY1wL4G2NcA+xqgXwLsa4B+CbCvAfolQL8E6JcA/RKgXwL0S4B+CdAvAf4VQL8E6JcA/wqgXwL8K4B+CfCvAPolwL8C+FdAXL8E+FdA3b8C4volwL8C6v4VUPevgLp/BdT9KyCuXwL8K6DuXwF1/wqo+1dA3b8C6v4V8L/+z30D/weMroAX/T/wJP4/H1oB1/t//XX8f7GvAm70X3ylAHbuKoBr/Htr2b/3pv17ctq/V6f9e3jav7enA/D6tH8HpP27gX9XZANwR9q/U/h3TNa/e9oBOIh/J2X9u6odgLP4dxj/TksG4Dj+nce/A5sBuJB/N3YDcCT/zuTfoc0AXMq/W7sBOJZ/53YDcC//Lu4G4GQfADf7ADiaf2cHl3A3/y4XgMut4PbgCI7n3/kWcH50Afe73wLOt4DrbeB4G9SOX0sB43QFuFwADleAuw2RunstBaT/d7gAXpmC//gWAmhvwX98DQEIgP/wHD4A8T34jw8igPYg/McnEYAABCAA/qub+ADER+E/vooABCCA8Cr8x3cRgAAEIAD+s8MIoD2MnwDxZfiPTyMAAQhAAAKoTsN/fBwBCEAAAhCAAAQgAP576/gAxOcRgAAEIAABCID/5j4CEIAABCAAAQhAAALo7eN3gfGBBCAA/ssLCUAAAhCAAAQgAAEIQAACEIAABCAAAQhAAAIQgAAEIAABCEAAAhCAAAQgAAEIQAACEIAABCAAAQjAHwvnXwACqP3VIAH4u4ECEIAABCAAAQhAAALwz8TxLwABCEAAAhDAFP65cAE8tY5PQHwcAQhAAAIQgAAEEB1HAfFpBCAAAQhAAAJQQHQZAcSHEYAAFFDeRQACEEB6FwXEVxGAAAQgAAV0RxFAfBOfgPgkAhCAANKTKCA+iAAEoID0HgKIz+ETEF9DAPU1FBDfQgACUEB6CgHEl/AJiA8hgPoQCojPIID6DAqIjzAKaG8ggPoGCogvIID6Au6P/woYPwIFIAA/A/13kOxvgyY8wgggvQL/AhBAeAf+/zzEOFsBjk4HMG72CXCyT4CLFeDeagDjXAU4Nh3AuFUBLk0HMA5VgDMV4MhwAONGBbgwHcA4UAHOU4DjwgGcu9LDp5mJf0Pxf85S46p6AeMkBTgoHcC4p17AOEYBTmkXMO6IB/C/071xhe34v3u9cUC9gPH6eABfj3jz218tYDy8XsB4db2A8eR6AeO99QL2bXrTW9sFTPqhAtgw7R2vVMCedc9/oQL2LXz26xSwdeZjH6aA7WMf+CQFfDT5UY9RwHfbn/AGBVRgvF0A3+0C2G4XwHW7AKbbBfDcLoDldAIMtwvgt10Au+0CuG0XwGy7AF7TCXDaLoDRdgF8phPgsl0Ak+0CeEwnwGG7AAbTCbDXLoC7dAK8tQtgLZ0AY+kE2GoXwFU6AZ7SCXCUToCfdALcpBPgJZ0AJ+kE+EgnwEW5ARbSCTBQbsD26QTsXm7A4uUGbF1uwMrlBuwbjsCu4Qjs2a3Ait0KbJfNwF7JFGwDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPkB9z6yDZK057cAAAAASUVORK5CYII=";
export declare function getMcpIndexTemplate(name: string): string;
/**
 * The generated project's protocol test: it starts the server on a port from the OS and speaks JSON-RPC to /mcp the way a
 * client does (initialize, tools/list, prompts/list, one tools/call), then checks the 405 on GET /mcp and the icon.
 */
export declare function getMcpTestTemplate(name: string): string;
/**
 * The scaffold for \`--type mcp\`. It is not in BACKEND_FRAMEWORKS: \`mcp\` is a resource type of its own, not a \`--framework\`
 * choice for a backend.
 */
export declare const mcpBackendProvider: BackendFrameworkProvider;
