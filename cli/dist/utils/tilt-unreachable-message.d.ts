/**
 * What `flisk logs` says when no Tilt answers on the port. The usual cause is that the stack is not up, so the message
 * names the command that starts it; Tilt's own connection error is not repeated, because it only restates that.
 */
export declare function tiltUnreachableMessage(port: string): string;
