import { createApp } from "./app";
export { createApp };
export type {
  ApiBindings,
  ApiDependencies,
  EvaluationRouteDependencies,
} from "./app";

const app = createApp();

export default app;
