import { createApp } from "./app";

export type {
  ApiBindings,
  ApiDependencies,
  EvaluationRouteDependencies,
} from "./app";
export { createApp };

const app = createApp();

export default app;
