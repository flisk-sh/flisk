export declare const SERVICE_MANIFEST_SCHEMA_VERSION = 1;
export declare const SERVICE_MANIFEST_SCHEMA_URL = "https://flisk.sh/schema.service.json";
/**
 * Errors for generated-output fields whose values could change the generated YAML. The value itself is not echoed, because it may
 * contain the newline that makes it dangerous.
 */
export declare function validateGeneratedStringFields(manifest: Record<string, unknown>, displayPath: string): string[];
export interface ServiceManifestValidation {
    errors: string[];
    warnings: string[];
    manifest?: Record<string, unknown>;
}
export declare function getInvalidServiceRoutePathFields(value: unknown): ("apiPath" | "basePath")[];
export declare function validateServiceManifest(value: unknown, displayPath: string): ServiceManifestValidation;
/**
 * Generated-output errors for one service.json. A file that cannot be read or parsed returns none here, because
 * validateServiceManifestFile reports that case.
 */
export declare function generatedFieldErrorsForFile(filePath: string, displayPath: string): string[];
export declare function validateServiceManifestFile(filePath: string, displayPath: string): ServiceManifestValidation;
