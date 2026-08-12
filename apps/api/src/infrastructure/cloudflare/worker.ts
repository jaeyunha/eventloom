import runtimeWorker from "../../index";

export { AgendaCoordinator } from "./agenda-coordinator";

export const fetch = runtimeWorker.fetch;
export const queue = runtimeWorker.queue;
export const scheduled = runtimeWorker.scheduled;

const worker = {
  fetch,
  queue,
  scheduled,
};

export default worker;
