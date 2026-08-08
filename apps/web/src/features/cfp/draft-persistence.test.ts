import { describe, expect, it } from "vitest";
import {
  BrowserCfpDraftPersistence,
  MemoryCfpDraftPersistence,
  getCfpDraftStorageKey,
} from "./draft-persistence";
import { createEmptyDraft } from "./types";

class FakeStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("CFP draft persistence", () => {
  it("round-trips drafts without sharing mutable references", async () => {
    const persistence = new MemoryCfpDraftPersistence();
    const draft = createEmptyDraft("future-conf", "2026-08-08T12:00:00.000Z");
    draft.submission.title = "A durable proposal";

    await persistence.save(draft);
    draft.submission.title = "Changed after save";

    const restored = await persistence.load("future-conf");
    expect(restored?.submission.title).toBe("A durable proposal");
  });

  it("isolates drafts by event slug and clears only the requested event", async () => {
    const persistence = new MemoryCfpDraftPersistence();
    await persistence.save(createEmptyDraft("event-a"));
    await persistence.save(createEmptyDraft("event-b"));

    await persistence.clear("event-a");

    expect(await persistence.load("event-a")).toBeNull();
    expect(await persistence.load("event-b")).not.toBeNull();
  });

  it("fails closed for corrupt or cross-event browser data", async () => {
    const storage = new FakeStorage();
    const persistence = new BrowserCfpDraftPersistence(storage);
    storage.setItem(getCfpDraftStorageKey("event-a"), "not-json");
    storage.setItem(getCfpDraftStorageKey("event-b"), JSON.stringify(createEmptyDraft("other-event")));

    expect(await persistence.load("event-a")).toBeNull();
    expect(await persistence.load("event-b")).toBeNull();
  });

  it("uses an encoded, versioned browser key", () => {
    expect(getCfpDraftStorageKey("community summit/2026")).toBe(
      "open-sessionboard:cfp-draft:v1:community%20summit%2F2026",
    );
  });
});
