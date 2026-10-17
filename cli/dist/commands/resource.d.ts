import { Command } from "commander";
import { getBackendIndexTemplate } from "../backend-languages/bun.js";
import type { AgentConfig, CreatableResourceType, PortAssignableResourceType } from "../types/index.js";
export { getDockerfileTemplate, getShutdownHandlerTemplate, getTestTemplate, getWorkerIndexTemplate, } from "../generator/resource-templates.js";
export declare const BASE_TEMPLATE: {
    readonly port: 0;
    readonly dependsOn: readonly [];
    readonly build: {
        readonly dockerfile: "Dockerfile";
        readonly context: ".";
    };
    readonly dev: {
        readonly command: "bun run dev";
        readonly watch: readonly ["src/**/*"];
    };
};
interface TypeSpecificConfig {
    /** The route the engine probes. The engine reads `healthCheckPath` (default /health); a top-level `healthCheck` is read by nothing. */
    healthCheckPath?: string;
    dev?: {
        command: string;
        watch: string[];
    };
}
export declare const TYPE_SPECIFIC: Record<CreatableResourceType, TypeSpecificConfig>;
export declare function resolveByoPort(value: string | undefined, assignedPort: number, resources: Array<{
    config?: {
        port?: number;
    };
}>): number;
export declare function resolveResourcePort(resourceType: PortAssignableResourceType, value: string | undefined, assignedPort: number, resources: Array<{
    config?: {
        port?: number;
    };
}>): number;
export declare function createServiceJson(name: string, type: CreatableResourceType, stack: string, port: number, extraFeatures?: string[], frameworkId?: string, languageId?: string, agent?: AgentConfig): any;
export declare function createByoServiceJson(name: string, stack: string, port: number, options: {
    healthCheckPath: string;
    dockerfile: string;
    image?: string;
    exposeViaProxy?: boolean;
    restart?: string;
}): {
    $schema: string;
    schemaVersion: number;
    appName: string;
    appType: "bring-your-own";
    stack: string;
    port: number;
    healthCheckPath: string;
    image: string;
    exposeViaProxy?: boolean | undefined;
    restart?: string | undefined;
} | {
    $schema: string;
    schemaVersion: number;
    appName: string;
    appType: "bring-your-own";
    stack: string;
    port: number;
    healthCheckPath: string;
    dockerfile: string;
    exposeViaProxy?: boolean | undefined;
    restart?: string | undefined;
};
export declare function createPackageJson(name: string, type: string, frameworkId?: string, prismaEnabled?: boolean, agentConfig?: AgentConfig): {
    name: string;
    version: string;
    type: string;
    scripts: {
        predev?: string | undefined;
        prebuild?: string | undefined;
        dev: string;
        build: string;
        start?: string | undefined;
        test: string;
        lint: string;
        "lint:fix": string;
    };
    dependencies: {
        prisma?: string | undefined;
        "@prisma/client"?: string | undefined;
        "@prisma/adapter-pg"?: string | undefined;
        pg?: string | undefined;
    };
    devDependencies: {
        "@types/bun": string;
        "@types/node": string;
        typescript: string;
        vitest: string;
        "@biomejs/biome": string;
        vite?: string | undefined;
    };
};
export declare const PRISMA_SCHEMA_TEMPLATE = "generator client {\n  provider = \"prisma-client\"\n  output   = \"../generated/prisma\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n}\n";
export declare const PRISMA_CONFIG_TEMPLATE = "export default {\n  schema: \"prisma/schema.prisma\",\n  datasource: {\n    url: process.env.DATABASE_URL,\n  },\n};\n";
export declare function createResourceTsconfig(resourceType: CreatableResourceType, frameworkId?: string): {
    compilerOptions: {
        types?: string[] | undefined;
        target: string;
        module: string;
        moduleResolution: string;
        strict: boolean;
        esModuleInterop: boolean;
        skipLibCheck: boolean;
        forceConsistentCasingInFileNames: boolean;
        outDir: string;
        rootDir: string;
        declaration: boolean;
        declarationMap: boolean;
        sourceMap: boolean;
    };
    include: string[];
    exclude: string[];
};
export declare const TSCONFIG_TEMPLATE: {
    compilerOptions: {
        target: string;
        module: string;
        moduleResolution: string;
        strict: boolean;
        esModuleInterop: boolean;
        skipLibCheck: boolean;
        forceConsistentCasingInFileNames: boolean;
        outDir: string;
        rootDir: string;
        declaration: boolean;
        declarationMap: boolean;
        sourceMap: boolean;
    };
    include: string[];
    exclude: string[];
};
export { getBackendIndexTemplate };
/** Resource types `tdk resource --type` accepts; `byo` is an alias of `bring-your-own`. */
export declare function parseResourceType(type: string): CreatableResourceType | "sdk";
export declare const resourceCommand: Command;
