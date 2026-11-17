import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  DATABASE_RESOURCE_TYPE
} from "./chunk-U3566SRZ.js";

// dist/utils/status-groups.js
var NO_STACK_LABEL = "(no stack)";
function isUnhealthyState(state) {
  return state?.status === "error" || state?.status === "pending";
}
function hasNoOwnProcess(resource, state) {
  return resource.type === DATABASE_RESOURCE_TYPE && (state?.status ?? "unknown") === "unknown";
}
function healthCountedResources(resources, states) {
  return resources.filter((resource) => !hasNoOwnProcess(resource, states?.[resource.name]));
}
function groupServicesByStack(stacks, unassigned, states) {
  const build = (name, resources) => ({
    name,
    resources: [...resources],
    healthy: resources.filter((resource) => states?.[resource.name]?.status === "ready").length,
    total: healthCountedResources(resources, states).length
  });
  const groups = stacks.map((stack) => build(stack.name, stack.resources));
  if (unassigned.length > 0)
    groups.push(build(NO_STACK_LABEL, unassigned));
  return groups;
}
function unhealthyServiceNames(resources, states) {
  return resources.filter((r) => isUnhealthyState(states?.[r.name])).map((r) => r.name);
}

export {
  hasNoOwnProcess,
  healthCountedResources,
  groupServicesByStack,
  unhealthyServiceNames
};
