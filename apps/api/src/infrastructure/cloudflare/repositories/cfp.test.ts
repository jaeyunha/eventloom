import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import type { Submission } from "../../../features/cfp/model";
import { D1CfpRepository } from "./cfp";

class RecordingD1 {
  readonly batches: string[][] = [];
  prepare(sql: string) {
    return {
      sql,
      bind: (..._values: unknown[]) => this.prepare(sql),
      all: async () => ({ results: [] }),
      first: async () => null,
      raw: async () => [],
      run: async () => ({ meta: { changes: 1 } }),
    };
  }
  async batch(statements: Array<{ sql?: string }>) {
    this.batches.push(statements.map((statement) => statement.sql ?? String(statement)));
    return statements.map(() => ({ meta: { changes: 1 }, results: [] }));
  }
}

const submission: Submission = {
  id: "submission-1",
  tenantId: "org-1",
  eventId: "event-1",
  formId: "form-1",
  ownerAccountId: "account-1",
  formVersion: 1,
  version: 1,
  status: "draft",
  completedSteps: ["welcome"],
  answers: { title: "Atomic CFP" },
  participants: [],
  secondaryContacts: [],
  createdAt: "2026-08-13T10:00:00.000Z",
  updatedAt: "2026-08-13T10:00:00.000Z",
};

describe("D1CfpRepository", () => {
  it("batches the submission CAS, normalized snapshot, and immutable version audit", async () => {
    const database = new RecordingD1();
    const repository = new D1CfpRepository(database as unknown as D1Database);

    await repository.saveSubmissionVersion(
      {
        submission,
        reason: "draft_created",
        actorId: "account-1",
        idempotencyKey: "create-1",
      },
      null,
    );

    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO submissions");
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO submission_answers");
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO submission_versions");
  });

  it("does not enqueue an Airtable sync job without a connected tenant connection", async () => {
    const database = new RecordingD1();
    const repository = new D1CfpRepository(database as unknown as D1Database);

    await repository.saveSubmissionVersion(
      { submission, reason: "draft_created", actorId: "account-1" },
      null,
    );

    expect(database.batches[0]?.join("\n")).not.toContain("airtable_sync_jobs");
  });
});
