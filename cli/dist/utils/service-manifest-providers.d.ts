/**
 * `models` (Compose / Docker Model Runner): models a bring-your-own resource uses, each `{ "name": "llm", "model": "ai/smollm2" }`.
 * The service gets `models: [llm]` and the stack's Compose file a top-level `models:` entry. `model` is written quoted into the
 * generated YAML, so only a model reference or a Compose variable is accepted. Mirrors engine/.../compose/byo_models.star.
 */
export declare function modelsErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * `env` on a bring-your-own resource (#2923): plain, committed configuration written into the container's Compose `environment`.
 * A command service's `env` is checked with the other command-service fields (validateNativeServiceFields). Mirrors
 * engine/.../compose/byo_env.star.
 */
export declare function byoEnvErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * `provides`: the connection settings a resource gives the services that list it in `dependsOn` (REDIS_URL for a Redis).
 * Each one is written into the dependent's generated env file, which `flisk config verify` checks and which must hold no
 * secret, so the values are plain URLs and names. Mirrors _dependency_provides_lines in
 * engine/.../orchestrator/generators/env.star.
 */
export declare function providesErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/** One entry of `providers`, with `required` resolved: a token is required unless the provider has a local fallback. */
export interface ProviderSpec {
    id: string;
    url: string;
    tokenSecret?: string;
    fallback?: string;
    required: boolean;
}
/** The well-formed entries of `providers` (malformed ones are reported by {@link providersErrors}). */
export declare function providersOf(manifest: Record<string, unknown> | undefined): ProviderSpec[];
/**
 * `providers`: external endpoints a service calls (IBM Quantum, Amazon Braket, a hosted model API) with the secret that holds
 * their token, and optionally a local resource to use while the token is missing. Mirrors
 * engine/.../docker/secrets/providers.star, which refuses the same values.
 */
export declare function providersErrors(manifest: Record<string, unknown>, displayPath: string): string[];
