import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/tilt-answer-owner.js
function tiltAnswerIsForeign(resources, projectResourceNames) {
  if (!resources || typeof resources !== "object" || !Array.isArray(resources.items)) {
    return false;
  }
  const names = resourceNames(resources.items);
  if (names.some((name) => projectResourceNames.has(name))) {
    return false;
  }
  const platformResources = /* @__PURE__ */ new Set([
    "traefik",
    "service-discovery-daemon",
    "(Tiltfile)"
    // Tiltfile errors don't indicate a foreign Tilt; they belong to the running project.
  ]);
  return names.some((name) => !platformResources.has(name));
}
function resourceNames(items) {
  const names = [];
  for (const item of items) {
    if (!item || typeof item !== "object")
      continue;
    const metadata = item.metadata;
    if (!metadata || typeof metadata !== "object")
      continue;
    const resourceName = metadata.name;
    if (typeof resourceName !== "string")
      continue;
    names.push(resourceName);
  }
  return names;
}

export {
  tiltAnswerIsForeign
};
