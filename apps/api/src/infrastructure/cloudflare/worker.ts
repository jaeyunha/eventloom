import runtimeWorker from "../../index";
import { consumeOutboxQueue } from "./outbox-consumer";

export { AgendaCoordinator } from "./agenda-coordinator";

export const fetch = runtimeWorker.fetch;
export const queue = consumeOutboxQueue;

const worker = {
  fetch,
  queue,
};

export default worker;
