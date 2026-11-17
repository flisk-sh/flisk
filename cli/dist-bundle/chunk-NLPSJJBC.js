import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/spinner.js
var FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
function startSpinner(initialText) {
  const stream = process.stderr;
  const animate = stream.isTTY === true;
  let frame = 0;
  let text = initialText;
  let timer;
  const render = () => stream.write(`\r\x1B[2K${source_default.cyan(FRAMES[frame])} ${text}`);
  if (animate) {
    render();
    timer = setInterval(() => {
      frame = (frame + 1) % FRAMES.length;
      render();
    }, 80);
  } else {
    stream.write(`- ${text}
`);
  }
  const finish = (symbol, message) => {
    if (timer)
      clearInterval(timer);
    stream.write(`${animate ? "\r\x1B[2K" : ""}${symbol} ${message ?? text}
`);
  };
  return {
    get text() {
      return text;
    },
    set text(value) {
      text = value;
      if (!animate)
        stream.write(`- ${text}
`);
    },
    succeed: (message) => finish(source_default.green("\u2714"), message),
    fail: (message) => finish(source_default.red("\u2716"), message),
    warn: (message) => finish(source_default.yellow("\u26A0"), message)
  };
}

export {
  startSpinner
};
