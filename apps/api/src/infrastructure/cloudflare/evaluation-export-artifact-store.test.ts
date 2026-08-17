import { describe, expect, it } from "vitest";
import { R2EvaluationExportArtifactStore } from "./evaluation-export-jobs";

describe("R2 evaluation export artifacts", () => {
  it("roundtrips CSV through the deterministic private key", async () => {
    const objects = new Map<string, { body: string; contentType: string }>();
    const bucket = {
      async put(key: string, body: string, options: { httpMetadata: { contentType: string } }) {
        objects.set(key, { body, contentType: options.httpMetadata.contentType });
      },
      async get(key: string) {
        const object = objects.get(key);
        return object === undefined
          ? null
          : { text: async () => object.body, httpMetadata: { contentType: object.contentType } };
      },
    } as unknown as R2Bucket;
    const artifacts = new R2EvaluationExportArtifactStore(bucket);
    const key = "evaluation-exports/tenant-1/event-1/plan-1/run-1.csv";

    await artifacts.put(key, {
      body: "review_id,score\nr1,5\n",
      contentType: "text/csv; charset=utf-8",
    });

    await expect(artifacts.get(key)).resolves.toEqual({
      body: "review_id,score\nr1,5\n",
      contentType: "text/csv; charset=utf-8",
    });
    expect([...objects.keys()]).toEqual([key]);
  });
});
