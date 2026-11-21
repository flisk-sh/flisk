// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Hub for the split in #4910: the pure failure taxonomy lives in classify.ts, the printed-URL targets in targets.ts, and
// the network probing in probe.ts. Importers keep importing from here; the split changes no behavior or public name.
export type { UrlFailureCause, UrlProbe } from "./url-check/classify.js";
export {
  classifyProbe,
  describeUrlFailure,
  findMissingEnvName,
  healthUrlOf,
  isLocalGatewayUrl,
  printedHealthUrl,
} from "./url-check/classify.js";
export type { UrlDiagnosisDeps, UrlProber } from "./url-check/probe.js";
export {
  checkPrintedUrls,
  formatUrlFailures,
  probeUrl,
  tiltResourceHasExited,
  URL_CHECK_CONCURRENCY,
  URL_CHECK_DEADLINE_MS,
  URL_PROBE_TIMEOUT_MS,
  URL_SLOW_DEADLINE_MS,
  urlFailureSuggestions,
} from "./url-check/probe.js";
export type { UrlCheck, UrlTarget } from "./url-check/targets.js";
export { buildPrintedUrlTargets } from "./url-check/targets.js";
