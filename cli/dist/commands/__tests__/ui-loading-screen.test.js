import { jsx as _jsx } from "react/jsx-runtime";
import { renderToString } from "ink";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "../ui.js";
describe("ui LoadingScreen", () => {
    it("shows honest text with no percentage", () => {
        const out = renderToString(_jsx(LoadingScreen, { animated: false }));
        expect(out).toContain("Discovering resources...");
        expect(out).not.toContain("%");
    });
    it("renders a spinner frame only when animated", () => {
        expect(renderToString(_jsx(LoadingScreen, { animated: true }))).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Discovering/);
        expect(renderToString(_jsx(LoadingScreen, { animated: false }))).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });
});
//# sourceMappingURL=ui-loading-screen.test.js.map