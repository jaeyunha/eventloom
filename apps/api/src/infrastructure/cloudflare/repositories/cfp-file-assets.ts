import type { FileRequest } from "../../../features/cfp/model";
import {
  CfpError,
  type CfpFileAsset,
  type CfpFileAssetGateway,
  type CfpFileUploadAuthorization,
  type CfpRepository,
} from "../../../features/cfp/service";
import {
  type CfpFileAssetCapabilityProvider,
  type CfpFileAssetDatabase,
  cfpFileAssetBinding,
  cfpFileAssetId,
  cfpFileAssetObjectSegment,
  cfpFileAssetView,
  cfpFileUploadExpiresAt,
  finalizeCfpFileAsset,
  findCfpFileAsset,
  insertPendingCfpFileAsset,
  type StoredCfpFileAsset,
} from "./cfp-file-asset-records";
export class D1CfpFileAssetGateway implements CfpFileAssetGateway {
  readonly #database: CfpFileAssetDatabase;
  readonly #cfp: CfpRepository;
  readonly #privateAssets: CfpFileAssetCapabilityProvider;
  readonly #now: () => Date;

  constructor(options: {
    database: CfpFileAssetDatabase;
    cfp: CfpRepository;
    privateAssets: CfpFileAssetCapabilityProvider;
    now?: () => Date;
  }) {
    this.#database = options.database;
    this.#cfp = options.cfp;
    this.#privateAssets = options.privateAssets;
    this.#now = options.now ?? (() => new Date());
  }

  async issueUpload(
    input: Parameters<CfpFileAssetGateway["issueUpload"]>[0],
  ): Promise<CfpFileUploadAuthorization> {
    const context = await this.#context(input);
    const fileName = input.fileName.trim();
    const contentType = input.contentType.trim().toLowerCase();
    if (
      input.idempotencyKey.trim().length === 0 ||
      fileName.length === 0 ||
      fileName.length > 255 ||
      contentType.length === 0 ||
      contentType.length > 255 ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > context.fileRequest.maxBytes ||
      !context.fileRequest.allowedMimeTypes.some((allowed) => {
        const candidate = allowed.trim().toLowerCase();
        return (
          candidate === contentType ||
          (candidate.endsWith("/*") && contentType.startsWith(candidate.slice(0, -1)))
        );
      })
    ) {
      throw new CfpError("VALIDATION_FAILED", "The upload metadata is not allowed.");
    }
    const requestKey = JSON.stringify([
      input.tenantId,
      input.eventId,
      input.submissionId,
      input.owner,
      context.participantId ?? "submission",
      input.fieldKey,
      input.idempotencyKey,
    ]);
    const assetId = await cfpFileAssetId(requestKey);
    const objectKey = [
      "cfp",
      encodeURIComponent(input.tenantId),
      encodeURIComponent(input.eventId),
      encodeURIComponent(input.submissionId),
      input.owner,
      encodeURIComponent(context.participantId ?? "submission"),
      encodeURIComponent(input.fieldKey),
      assetId,
      cfpFileAssetObjectSegment(fileName),
    ].join("/");
    const current = await findCfpFileAsset(
      this.#database,
      input.tenantId,
      input.eventId,
      input.submissionId,
      assetId,
    );
    if (current) {
      const matches =
        current.owner === input.owner &&
        current.participant_id === (context.participantId ?? null) &&
        current.field_key === input.fieldKey &&
        current.file_name === fileName &&
        current.content_type === contentType &&
        current.size_bytes === input.sizeBytes &&
        current.object_key === objectKey;
      if (!matches) throw new CfpError("CONFLICT", "The file upload request conflicts.");
      if (current.state !== "pending_upload") {
        throw new CfpError("CONFLICT", "The file upload is already finalized.");
      }
    } else {
      await insertPendingCfpFileAsset(this.#database, {
        id: assetId,
        organization_id: input.tenantId,
        event_id: input.eventId,
        submission_id: input.submissionId,
        owner: input.owner,
        participant_id: context.participantId ?? null,
        field_key: input.fieldKey,
        object_key: objectKey,
        file_name: fileName,
        content_type: contentType,
        size_bytes: input.sizeBytes,
        createdAt: this.#now().toISOString(),
      });
    }
    const asset =
      current ??
      (await findCfpFileAsset(
        this.#database,
        input.tenantId,
        input.eventId,
        input.submissionId,
        assetId,
      ));
    if (!asset) throw new CfpError("VALIDATION_FAILED", "The file upload could not be stored.");
    const expiresAt = cfpFileUploadExpiresAt(this.#now());
    const grant = await this.#privateAssets.registerUploadCapability(
      cfpFileAssetBinding(asset, expiresAt),
    );
    return { asset: cfpFileAssetView(asset), grant };
  }

  async finalizeUpload(
    input: Parameters<CfpFileAssetGateway["finalizeUpload"]>[0],
  ): Promise<CfpFileAsset> {
    const asset = await this.#load(input);
    if (asset.state === input.state) return cfpFileAssetView(asset);
    if (asset.state !== "pending_upload") {
      throw new CfpError("CONFLICT", "The file upload is already finalized.");
    }
    const expiresAt = cfpFileUploadExpiresAt(this.#now());
    const binding = cfpFileAssetBinding(asset, expiresAt);
    if (input.state === "ready") {
      const verified = await this.#privateAssets.verifyUploadCapability(binding);
      if (!verified) throw new CfpError("CONFLICT", "The uploaded object could not be verified.");
    } else {
      await this.#privateAssets.invalidateUploadCapability(binding);
    }
    await finalizeCfpFileAsset(this.#database, {
      tenantId: input.tenantId,
      eventId: input.eventId,
      submissionId: input.submissionId,
      assetId: input.assetId,
      state: input.state,
      rejectionReason: input.state === "rejected" ? (input.rejectionReason ?? null) : null,
      finalizedAt: this.#now().toISOString(),
      objectKey: asset.object_key,
    });
    const finalized = await this.#load(input);
    if (finalized.state !== input.state) {
      throw new CfpError("CONFLICT", "The file asset changed before it could be finalized.");
    }
    return cfpFileAssetView(finalized);
  }

  async getAsset(
    input: Parameters<CfpFileAssetGateway["getAsset"]>[0],
  ): Promise<CfpFileAsset | null> {
    try {
      return cfpFileAssetView(await this.#load(input));
    } catch (error) {
      if (error instanceof CfpError) return null;
      throw error;
    }
  }

  async #context(input: {
    tenantId: string;
    eventId: string;
    submissionId: string;
    owner: "submission" | "participant";
    participantId?: string;
    fieldKey: string;
  }): Promise<{ fileRequest: FileRequest; participantId?: string }> {
    const event = await this.#cfp.getEvent(input.tenantId, input.eventId);
    const submission = await this.#cfp.getSubmission(input.tenantId, input.submissionId);
    if (!event || !submission || submission.eventId !== input.eventId) {
      throw new CfpError("NOT_FOUND", "The submission was not found.");
    }
    const form = await this.#cfp.getForm(input.tenantId, submission.formId);
    if (!form || form.eventId !== input.eventId) {
      throw new CfpError("NOT_FOUND", "The submission form was not found.");
    }
    const fields = input.owner === "submission" ? form.submissionFields : form.participantFields;
    const field = fields.find((candidate) => candidate.key === input.fieldKey);
    if (
      !field?.fileRequest ||
      field.fileRequest.owner !== input.owner ||
      field.kind !== "file_request"
    ) {
      throw new CfpError("FORBIDDEN", "The file request is not authorized.");
    }
    const participantId = input.owner === "participant" ? input.participantId : undefined;
    if (input.owner === "participant") {
      if (!participantId || !submission.participants.some(({ id }) => id === participantId)) {
        throw new CfpError("FORBIDDEN", "The participant file request is not authorized.");
      }
    } else if (input.participantId) {
      throw new CfpError("FORBIDDEN", "The submission file request cannot name a participant.");
    }
    return {
      fileRequest: field.fileRequest,
      ...(participantId ? { participantId } : {}),
    };
  }

  async #load(input: {
    tenantId: string;
    eventId: string;
    submissionId: string;
    assetId: string;
    owner: "submission" | "participant";
    participantId?: string;
    fieldKey?: string;
  }): Promise<StoredCfpFileAsset> {
    const asset = await findCfpFileAsset(
      this.#database,
      input.tenantId,
      input.eventId,
      input.submissionId,
      input.assetId,
    );
    if (!asset) throw new CfpError("NOT_FOUND", "The file asset was not found.");
    const fieldKey = input.fieldKey ?? asset.field_key;
    const context = await this.#context({ ...input, fieldKey });
    if (
      asset.owner !== input.owner ||
      asset.participant_id !== (context.participantId ?? null) ||
      asset.field_key !== fieldKey
    ) {
      throw new CfpError("NOT_FOUND", "The file asset was not found.");
    }
    return asset;
  }
}
