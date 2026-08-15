import { describe, expect, it, vi } from "vitest";
import type { AirtableListOptions } from "../infrastructure/airtable";
import { type AirtableJsonStore, listEventScopedJson } from "./airtable";

interface TestRecord {
  readonly id: string;
}

type ListOptions = Omit<AirtableListOptions, "cursor">;
type TestStore = Pick<AirtableJsonStore<TestRecord>, "list">;

const EXPECTED_FILTER = 'FIND("event-123",{Payload JSON})>0';

describe("listEventScopedJson", () => {
  it("propagates a scoped read TypeError without an unfiltered retry", async () => {
    const failure = new TypeError("scoped read failed");
    const list = vi.fn(async (options: ListOptions = {}): Promise<TestRecord[]> => {
      if (options.filterByFormula !== undefined) throw failure;
      return [];
    });
    const store: TestStore = { list };

    await expect(listEventScopedJson(store, "Payload JSON", "event-123")).rejects.toBe(failure);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ filterByFormula: EXPECTED_FILTER });
  });

  it("returns records from a successful scoped call", async () => {
    const records: TestRecord[] = [{ id: "record-1" }];
    const list = vi.fn(async (_options: ListOptions = {}): Promise<TestRecord[]> => records);
    const store: TestStore = { list };

    await expect(listEventScopedJson(store, "Payload JSON", "event-123")).resolves.toEqual(records);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ filterByFormula: EXPECTED_FILTER });
  });
});
