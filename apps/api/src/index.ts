import { createApp } from "./app";
import { createRuntimeWorker } from "./runtime/composition";

export type {
  ApiBindings,
  ApiDependencies,
  EvaluationRouteDependencies,
} from "./app";
export { createApp };
export type { RuntimeBindings, RuntimeConfigurationInspection } from "./runtime/cloudflare";
export {
  D1ApiKeyAuthenticatorGateway,
  D1BetterAuthGateway,
  inspectProductionRuntime,
} from "./runtime/cloudflare";
export {
  createRuntimeApp,
  createRuntimeDependencies,
  createRuntimeWorker,
  RuntimeConfigurationError,
} from "./runtime/composition";
export {
  LOCAL_API_KEY,
  LOCAL_ORGANIZATION_ID,
  LOCAL_SESSION_TOKEN,
  LOCAL_SPEAKER_ACCOUNT_ID,
} from "./runtime/local";

export default createRuntimeWorker();
