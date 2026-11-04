"""Animated SVG: Claude Code running inside a Warp terminal pane builds a shop with Flisk.

Layout follows Warp's documented UI for third-party CLI agents (tab bar, pane
header with the working directory, and the agent toolbelt row at the bottom of
the pane) and Claude Code's terminal UI (⏺ tool calls, ⎿ results, the ✻
spinner and the rounded input box).

The session is illustrative. Every flisk command, output line and URL comes
from the README demos, which were captured from a real run.

Usage: python3 scripts/demo/make_demo_warp_claude.py docs/assets/demo-claude-in-warp.svg [fonts.json]
fonts.json maps a font weight ("400", "700") to a base64 JetBrains Mono (OFL) woff2 subset.
"""

import json
import sys
from html import escape
from pathlib import Path

W, H = 1270, 760
FS, LH = 15, 22
CW = FS * 0.6
FONT = "'Hack','JetBrains Mono',ui-monospace,Menlo,monospace"
SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

BG, PANE, CHROME, LINE = "#0f0f10", "#141415", "#0b0b0c", "#2b2b2e"
TEXT, DIM, FAINT = "#e8e8e8", "#8b8b90", "#5c5c61"
ORANGE, GREEN, BLUE, TEAL = "#d97757", "#4eba65", "#8ab4f8", "#3fb6a8"


class Svg:
    def __init__(self, total, label, fonts):
        self.T, self.label, self.fonts = total, label, fonts
        self.css, self.body, self.n = [], [], 0

    def p(self, t):
        return max(0.0, min(100.0, t / self.T * 100))

    def show(self, a_s, b_s=None, transient=False):
        self.n += 1
        a, b = self.p(a_s), (self.p(b_s) if b_s is not None else 97.0)
        k = f"k{self.n}"
        self.css.append(f"@keyframes {k}{{0%,{max(a - .01, 0):.2f}%{{opacity:0}}{a:.2f}%,{b:.2f}%{{opacity:1}}"
                        f"{min(b + .01, 100):.2f}%,100%{{opacity:0}}}}.{k}{{opacity:0;animation:{k} {self.T}s linear infinite}}")
        return f"f {k}" + (" transient" if transient else "")

    def typed(self, x, y, chars, t0, dur, cover):
        self.n += 1
        a, b = self.p(t0), self.p(t0 + dur)
        w = chars * CW + 12
        k = f"c{self.n}"
        self.css.append(f"@keyframes {k}{{0%,{a:.2f}%{{transform:translateX(0);opacity:1;animation-timing-function:steps({max(chars, 1)},end)}}"
                        f"{b:.2f}%{{transform:translateX({w:.1f}px);opacity:1}}{min(b + .05, 100):.2f}%,100%{{opacity:0;transform:translateX({w:.1f}px)}}}}"
                        f".{k}{{animation:{k} {self.T}s linear infinite}}")
        self.body.append(f'<rect class="cv {k}" x="{x - 1:.1f}" y="{y - FS}" width="{w:.1f}" height="{LH}" fill="{cover}"/>')

    def add(self, s):
        self.body.append(s)

    def render(self):
        faces = "".join(
            f"@font-face{{font-family:'JetBrains Mono';font-weight:{wt};src:url(data:font/woff2;base64,{b64}) format('woff2')}}"
            for wt, b64 in (self.fonts or {}).items())
        base = (".spin{animation:spin .9s steps(4) infinite}@keyframes spin{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}"
                "text{white-space:pre;font-variant-ligatures:none}")
        rm = "@media (prefers-reduced-motion: reduce){.f{animation:none!important;opacity:1!important}.cv,.transient{display:none}.spin{animation:none}}"
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" '
                f'aria-label="{escape(self.label)}">\n<title>{escape(self.label)}</title>\n'
                f"<style>{faces}{''.join(self.css)}{base}{rm}</style>\n" + "\n".join(self.body) + "\n</svg>\n")


def tx(x, y, s, color=TEXT, weight=400, size=FS, cls=None, anchor=None, family=None):
    c = f' class="{cls}"' if cls else ""
    a = f' text-anchor="{anchor}"' if anchor else ""
    f = f' font-family="{family}"' if family else ""
    return f'<text{c} x="{x:.1f}" y="{y}" fill="{color}" font-weight="{weight}" font-size="{size}"{a}{f}>{escape(s)}</text>'


def chip(x, y, label, w=None, tint=False):
    w = w or (len(label) * 7.2 + 22)
    fill, stroke, col = ("#16302a", "#2f6b5c", "#9fe0cf") if tint else ("#18181a", "#323236", "#b8b8bd")
    return (f'<rect x="{x}" y="{y}" width="{w:.0f}" height="24" rx="5" fill="{fill}" stroke="{stroke}"/>'
            + tx(x + 11, y + 16.5, label, col, 400, 12.5, family=SANS)), x + w + 8


def build(fonts):
    T = 22.0
    s = Svg(T, "Claude Code, running in the Warp terminal, builds a small online shop with Flisk and runs it locally", fonts)
    s.add(f'<rect width="{W}" height="{H}" fill="#050506"/>')
    s.add(f'<rect x="8.5" y="8.5" width="{W - 17}" height="{H - 17}" rx="12" fill="{BG}" stroke="{LINE}"/>')
    # tab bar
    s.add(f'<path d="M9 21a12 12 0 0 1 12-12h{W - 42}a12 12 0 0 1 12 12v23H9z" fill="{CHROME}"/>')
    s.add(f'<line x1="9" y1="44.5" x2="{W - 9}" y2="44.5" stroke="{LINE}"/>')
    for i, col in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        s.add(f'<circle cx="{30 + i * 19}" cy="27" r="6" fill="{col}"/>')
    s.add(f'<rect x="96" y="14" width="250" height="26" rx="6" fill="{BG}"/>'
          f'<line x1="104" y1="39.5" x2="338" y2="39.5" stroke="{TEAL}" stroke-width="2"/>')
    s.add(f'<circle cx="112" cy="27" r="4" fill="{ORANGE}"/>' + tx(124, 31.5, "claude · ~/my-shop", TEXT, 500, 12.5, family=SANS))
    s.add(tx(362, 32, "+", DIM, 400, 17, family=SANS))

    s.add(f'<g font-family="{FONT}">')
    # pane header (Warp shows the working directory and the agent version here)
    s.add(tx(30, 70, "~/my-shop", FAINT, 400, 13))
    s.add(tx(W - 30, 70, "Claude Code", FAINT, 400, 13, anchor="end"))

    x0, y = 30, 104
    prompt1 = "Build me a small online shop with a storefront and an orders API,"
    prompt2 = "and run it on my laptop with Flisk."

    # Claude Code input box + hint, pinned near the bottom of the pane
    by = H - 128
    s.add(f'<rect x="24" y="{by}" width="{W - 48}" height="40" rx="8" fill="none" stroke="#4a4a4f"/>')
    s.add(tx(40, by + 26, ">", DIM))
    full = prompt1 + " " + prompt2
    shown = full[:118]
    s.add(tx(58, by + 26, shown, TEXT, cls=s.show(0.3, 2.9, True)))
    s.typed(58, by + 26, len(shown), 0.3, 2.2, BG)
    s.add(f'<rect class="{s.show(2.9)}" x="58" y="{by + 12}" width="9" height="18" fill="{TEXT}" fill-opacity=".75"/>')
    s.add(tx(30, by + 62, "? for shortcuts", FAINT, 400, 12.5))

    # Warp agent toolbelt row
    ty = H - 50
    s.add(f'<line x1="9" y1="{ty - 10.5}" x2="{W - 9}" y2="{ty - 10.5}" stroke="{LINE}"/>')
    s.add(f'<rect x="24" y="{ty + 6}" width="9" height="12" rx="1" fill="none" stroke="{DIM}"/>')
    cx = 44
    for label, tint in (("Rich Input  ^G", True), ("File explorer", False), ("/remote-control", False)):
        c, cx = chip(cx, ty, label, tint=tint)
        s.add(c)
    c, _ = chip(W - 150, ty, "▢ ~/my-shop", 126)
    s.add(c)

    # transcript
    s.add(f'<g class="{s.show(2.9)}">' + tx(x0, y, "> " + prompt1, DIM) + tx(x0 + 2 * CW, y + LH, prompt2, DIM) + "</g>")
    y += LH * 2 + 16
    s.add(f'<g class="{s.show(3.6)}">' + tx(x0, y, "⏺", TEXT) + tx(x0 + 22, y, "I'll use Flisk to create the project, add both services and start them.") + "</g>")
    y += LH + 14

    calls = [
        ("flisk project --yes", 4.4, ["✓ Created: .flisk/project.json", "✓ Created: .env (the defaults work as-is)",
                                      "✅ Project configuration complete!"]),
        ("flisk resource orders-api --type backend --stack shop --yes", 6.6, ["✅ Resource created successfully!"]),
        ("flisk resource shop-web --type frontend --stack shop --yes", 8.6, ["✅ Resource created successfully!"]),
        ("flisk up shop", 10.6, ['Starting 2 services from stack "shop"...', "🌍 Frontend URLs:",
                                 "- shop-web: http://app.my-shop.localhost/shop-web/health", "🔧 Backend API URLs:",
                                 "- orders-api: http://api.my-shop.localhost/api/orders/health"]),
    ]
    spinner_y = by - 22
    for cmd, t0, outs in calls:
        run = 1.2 if cmd != "flisk up shop" else 2.4
        t_done = t0 + run
        s.add(f'<g class="{s.show(t0, t_done, True)}"><text class="spin" x="{x0}" y="{y}" fill="{TEXT}" font-size="{FS}">⏺</text></g>')
        s.add(tx(x0, y, "⏺", GREEN, cls=s.show(t_done)))
        s.add(f'<text class="{s.show(t0)}" x="{x0 + 22}" y="{y}" font-size="{FS}" fill="{TEXT}">'
              f'<tspan font-weight="700">Bash</tspan><tspan fill="{DIM}">(</tspan>{escape(cmd)}<tspan fill="{DIM}">)</tspan></text>')
        s.add(f'<g class="{s.show(t0 + 0.15, t_done, True)}">'
              + f'<text class="spin" x="{x0}" y="{spinner_y}" fill="{ORANGE}" font-size="{FS}">✻</text>'
              + tx(x0 + 22, spinner_y, f"Running {cmd.split(' --')[0]}… (esc to interrupt)", ORANGE) + "</g>")
        to = t_done
        for i, line in enumerate(outs):
            y += LH
            col = BLUE if "http://" in line else DIM
            g = tx(x0 + 24, y, "⎿", FAINT) if i == 0 else ""
            s.add(f'<g class="{s.show(to)}">{g}{tx(x0 + 22 + 4 * CW, y, line, col)}</g>')
            to += 0.18
        y += LH + 10

    t_end = 13.6
    s.add(f'<g class="{s.show(t_end)}">' + tx(x0, y, "⏺", TEXT)
          + tx(x0 + 22, y, "Your shop is running on your laptop:") + "</g>")
    s.add(f'<g class="{s.show(t_end + .3)}">' + tx(x0 + 44, y + LH, "Storefront  ", DIM)
          + tx(x0 + 44 + 12 * CW, y + LH, "http://app.my-shop.localhost/shop-web/health", BLUE) + "</g>")
    s.add(f'<g class="{s.show(t_end + .5)}">' + tx(x0 + 44, y + 2 * LH, "Orders API  ", DIM)
          + tx(x0 + 44 + 12 * CW, y + 2 * LH, "http://api.my-shop.localhost/api/orders/health", BLUE) + "</g>")
    s.add("</g>")
    return s.render()


if __name__ == "__main__":
    out = Path(sys.argv[1])
    fonts = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 else None
    out.write_text(build(fonts), encoding="utf-8")
    print("wrote", out, out.stat().st_size)
