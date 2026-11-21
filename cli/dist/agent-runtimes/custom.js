import { getCustomAgentIndexTemplate } from "./custom-index-template.js";
export { getCustomAgentIndexTemplate };
/**
 * The `custom` agent runtime: a plain Bun HTTP service with no model SDK, no agent framework and no vendor dependency.
 * It is the escape hatch the agent resource type is built on. Replace the `runTurn` body with your model call and tools;
 * the process contract around it (health, readiness, session checkpoints, SIGTERM drain) is what Flisk relies on.
 * The generated `index.ts` itself lives in `custom-index-template.ts`, split into
 * named sections so the template text is diffable in review.
 */
export const customAgentRuntime = {
    id: "custom",
    label: "Custom agent runtime (Bun HTTP, no vendor dependency)",
    dependencies: {},
    devDependencies: {},
    createIndex: getCustomAgentIndexTemplate,
};
