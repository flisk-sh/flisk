/**
 * Whether a failed fetch is a refused connection to a loopback host: the operating system has said that nothing listens
 * there, so a retry would get the same answer (#3887). Bun puts the code on the error, Node on its cause.
 */
export declare function isFinalNetworkError(target: string, error: unknown): boolean;
