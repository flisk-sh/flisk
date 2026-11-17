import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/compose-project-name.js
function toComposeProjectName(projectName) {
  return projectName.replace(/-/g, "_");
}

export {
  toComposeProjectName
};
