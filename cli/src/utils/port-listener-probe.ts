// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { connect } from "node:net";

/**
 * True when something already accepts connections on 127.0.0.1:port. Binding a socket to find out is not enough:
 * on macOS a bind on 127.0.0.1 succeeds even while another process listens on the same port, so a busy port such as
 * 5432 looked free and `flisk doctor` passed before Docker failed to publish it.
 */
export function hasLocalListener(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const finish = (result: boolean): void => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
