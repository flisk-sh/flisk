export type TemplateHelper = (value: unknown) => string;
export type TemplateHelpers = Record<string, {
    fn: TemplateHelper;
    raw: boolean;
}>;
export declare function compileTemplate(source: string, helpers: TemplateHelpers): (context: unknown) => string;
