/** One thing a menu can offer. */
export interface CatalogOption {
    id: string;
    title: string;
    hint: string;
    /** Runs on the host with no Docker or Tilt. False means the Docker route only. */
    local: boolean;
}
/** The frontend frameworks, the registry's default first. */
export declare function frontendCatalog(): CatalogOption[];
export interface LanguageOption extends CatalogOption {
    /** The backend frameworks this language can be combined with; empty when the language owns its runtime. */
    frameworks: CatalogOption[];
}
/** The backend languages, each with the frameworks it can be combined with, the registry's default first. */
export declare function backendCatalog(): LanguageOption[];
/** The ready-made starter projects. A starter the CLI writes itself (`generated`) runs as local processes. */
export declare function starterCatalog(): CatalogOption[];
export interface ExtraOption {
    /** `type` or `type:framework`, the shape `--extras` takes. */
    id: string;
    type: string;
    framework?: string;
    title: string;
    hint: string;
}
/**
 * Extra parts a project can add on the Docker route: the creatable resource types that are not the website or the API, and
 * every framework of the infrastructure types (queues, databases).
 */
export declare function extraCatalog(): ExtraOption[];
/** The programs a local project needs on the host, read from the generators it was built with. */
export declare function localRequirements(parts: {
    frontend: boolean;
    language?: string;
}): string[];
