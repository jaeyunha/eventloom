import type { ReviewAutosaveQueue } from "./scorecard-review-autosave-queue";

export function createReviewAutosaveQueue(
  onPendingChange: (pending: boolean) => void = () => undefined,
): ReviewAutosaveQueue {
  let tail = Promise.resolve();
  let pendingCount = 0;
  return {
    enqueue(operation) {
      pendingCount += 1;
      onPendingChange(true);
      const result = tail.then(operation);
      const settled = result.finally(() => {
        pendingCount -= 1;
        onPendingChange(pendingCount > 0);
      });
      tail = settled.catch(() => undefined);
      return settled;
    },
    whenIdle() {
      return tail;
    },
    isPending() {
      return pendingCount > 0;
    },
  };
}
