"use client";

export interface ReviewAutosaveQueue {
  enqueue(operation: () => Promise<void>): Promise<void>;
  whenIdle(): Promise<void>;
  isPending(): boolean;
}
