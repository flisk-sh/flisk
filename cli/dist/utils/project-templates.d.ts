export interface ProjectTemplate {
    repo: string;
    description: string;
    bundledPath?: string;
    fixedDir?: string;
}
/** Public starter repositories plus the bundled default product example. */
export declare const PROJECT_TEMPLATES: Record<string, ProjectTemplate>;
