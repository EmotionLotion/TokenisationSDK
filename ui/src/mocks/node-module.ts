// Browser shim for node:module — prevents crash from SDK's DeploymentService
export function createRequire() {
  return function require(id: string) {
    console.warn(`[browser shim] require("${id}") called — returning empty object`);
    return {};
  };
}

export default { createRequire };
