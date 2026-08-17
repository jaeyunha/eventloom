import type {
  EvaluationExportArtifact,
  EvaluationExportArtifactStore,
} from "../../features/evaluations/export-jobs";

const CSV_CONTENT_TYPE = "text/csv; charset=utf-8" as const;

/** Evaluation CSVs remain private in R2 and use the coordinator's deterministic scoped key. */
export class R2EvaluationExportArtifactStore implements EvaluationExportArtifactStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, artifact: EvaluationExportArtifact): Promise<void> {
    await this.bucket.put(key, artifact.body, {
      httpMetadata: { contentType: artifact.contentType },
    });
  }

  async get(key: string): Promise<EvaluationExportArtifact | undefined> {
    const object = await this.bucket.get(key);
    if (object === null) return undefined;
    return { body: await object.text(), contentType: CSV_CONTENT_TYPE };
  }
}
