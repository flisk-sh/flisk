/**
 * True when something already accepts connections on 127.0.0.1:port. Binding a socket to find out is not enough:
 * on macOS a bind on 127.0.0.1 succeeds even while another process listens on the same port, so a busy port such as
 * 5432 looked free and `flisk doctor` passed before Docker failed to publish it.
 */
export declare function hasLocalListener(port: number, timeoutMs?: number): Promise<boolean>;
