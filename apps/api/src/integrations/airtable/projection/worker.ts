import type { AirtableSyncJob } from "../sync/contracts";

export interface AirtableProjectionPayload {
  tableId: string;
  fields?: Record<string, unknown>;
}

export interface AirtableRecordMapping {
  tableId: string;
  recordId: string;
  lastExportedVersion: number | null;
}

export interface AirtableProjectionProvider {
  performUpsert(input: {
    tableId: string;
    applicationId: string;
    fields: Record<string, unknown>;
    recordId?: string;
  }): Promise<{ recordId: string }>;
  archive(input: { tableId: string; recordId: string }): Promise<void>;
  delete(input: { tableId: string; recordId: string }): Promise<void>;
}

export interface AirtableProjectionRepository {
  getCurrentSourceVersion(input: {
    organizationId: string;
    entityType: string;
    applicationId: string;
  }): Promise<number | null>;
  getMapping(input: {
    connectionId: string;
    entityType: string;
    applicationId: string;
  }): Promise<AirtableRecordMapping | null>;
  complete(input: ClaimIdentity & { completedAt: string }): Promise<boolean>;
  completeWithMapping(
    input: ClaimIdentity & {
      organizationId: string;
      connectionId: string;
      entityType: string;
      applicationId: string;
      tableId: string;
      recordId: string;
      sourceVersion: number;
      completedAt: string;
    },
  ): Promise<boolean>;
  retry(
    input: ClaimIdentity & {
      availableAt: string;
      error: string;
    },
  ): Promise<boolean>;
  fail(
    input: ClaimIdentity & {
      completedAt: string;
      error: string;
    },
  ): Promise<boolean>;
}

export interface ClaimIdentity {
  jobId: string;
  owner: string;
  claimToken: string;
}

export interface ProcessClaimedJobInput {
  job: AirtableSyncJob;
  owner: string;
  claimToken: string;
}

export type ProcessClaimedJobResult =
  | { status: "succeeded" | "stale" | "retried" | "failed" }
  | { status: "claim-rejected" };

export interface AirtableProjectionWorkerOptions {
  now?: () => Date;
  retryBaseMilliseconds?: number;
  retryMaximumMilliseconds?: number;
}

export interface RetryDecision {
  retryable: boolean;
  retryAfterMilliseconds?: number;
  message: string;
}

interface ErrorWithResponse {
  status?: unknown;
  statusCode?: unknown;
  headers?: unknown;
  response?: {
    status?: unknown;
    headers?: unknown;
  };
  message?: unknown;
  name?: unknown;
}

const applicationIdField = "Application ID";
const defaultRetryBaseMilliseconds = 1_000;
const defaultRetryMaximumMilliseconds = 60_000;

function errorStatus(error: ErrorWithResponse): number | undefined {
  const value = error.status ?? error.statusCode ?? error.response?.status;
  return typeof value === "number" ? value : undefined;
}

function headerValue(headers: unknown, name: string): string | null {
  if (headers === null || headers === undefined) return null;
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get(name: string): string | null }).get(name);
  }
  if (typeof headers !== "object") return null;
  const entries = Object.entries(headers as Record<string, unknown>);
  const entry = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
  if (!entry) return null;
  const value = entry[1];
  return Array.isArray(value) ? String(value[0]) : String(value);
}

function retryAfterMilliseconds(value: string | null, now: Date): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const instant = Date.parse(value);
  if (Number.isNaN(instant)) return undefined;
  return Math.max(0, instant - now.getTime());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as ErrorWithResponse).message === "string"
  ) {
    return (error as ErrorWithResponse).message as string;
  }
  return String(error);
}

export function classifyAirtableProjectionError(error: unknown, now: Date): RetryDecision {
  const candidate = (typeof error === "object" && error !== null ? error : {}) as ErrorWithResponse;
  const status = errorStatus(candidate);
  const message = errorMessage(error);

  if (status === 429) {
    const headers = candidate.headers ?? candidate.response?.headers;
    const delay = retryAfterMilliseconds(headerValue(headers, "retry-after"), now);
    return {
      retryable: true,
      ...(delay === undefined ? {} : { retryAfterMilliseconds: delay }),
      message,
    };
  }
  if (status === undefined || status === 408 || status === 409 || status === 425 || status >= 500) {
    return { retryable: true, message };
  }
  return { retryable: false, message };
}

function parsePayload(job: AirtableSyncJob): AirtableProjectionPayload {
  const parsed: unknown = JSON.parse(job.payloadJson);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as AirtableProjectionPayload).tableId !== "string"
  ) {
    throw new Error("Invalid Airtable projection payload");
  }
  const fields = (parsed as AirtableProjectionPayload).fields;
  if (
    fields !== undefined &&
    (typeof fields !== "object" || fields === null || Array.isArray(fields))
  ) {
    throw new Error("Invalid Airtable projection fields");
  }
  return parsed as AirtableProjectionPayload;
}

export class AirtableProjectionWorker {
  private readonly now: () => Date;
  private readonly retryBaseMilliseconds: number;
  private readonly retryMaximumMilliseconds: number;

  constructor(
    private readonly provider: AirtableProjectionProvider,
    private readonly repository: AirtableProjectionRepository,
    options: AirtableProjectionWorkerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.retryBaseMilliseconds = options.retryBaseMilliseconds ?? defaultRetryBaseMilliseconds;
    this.retryMaximumMilliseconds =
      options.retryMaximumMilliseconds ?? defaultRetryMaximumMilliseconds;
  }

  async process(input: ProcessClaimedJobInput): Promise<ProcessClaimedJobResult> {
    const { job, owner, claimToken } = input;
    if (job.state !== "claimed" || job.claimOwner !== owner || job.claimToken !== claimToken) {
      return { status: "claim-rejected" };
    }

    const claim: ClaimIdentity = { jobId: job.id, owner, claimToken };
    const startedAt = this.now();

    try {
      const currentVersion = await this.repository.getCurrentSourceVersion({
        organizationId: job.organizationId,
        entityType: job.entityType,
        applicationId: job.applicationId,
      });
      if (currentVersion !== null && currentVersion > job.sourceVersion) {
        return (await this.repository.complete({ ...claim, completedAt: startedAt.toISOString() }))
          ? { status: "stale" }
          : { status: "claim-rejected" };
      }

      const payload = parsePayload(job);
      const mapping = await this.repository.getMapping({
        connectionId: job.connectionId,
        entityType: job.entityType,
        applicationId: job.applicationId,
      });

      if (job.operation === "upsert" || job.operation === "reconcile") {
        const result = await this.provider.performUpsert({
          tableId: payload.tableId,
          applicationId: job.applicationId,
          fields: { ...(payload.fields ?? {}), [applicationIdField]: job.applicationId },
          ...(mapping === null ? {} : { recordId: mapping.recordId }),
        });
        return (await this.repository.completeWithMapping({
          ...claim,
          organizationId: job.organizationId,
          connectionId: job.connectionId,
          entityType: job.entityType,
          applicationId: job.applicationId,
          tableId: payload.tableId,
          recordId: result.recordId,
          sourceVersion: job.sourceVersion,
          completedAt: this.now().toISOString(),
        }))
          ? { status: "succeeded" }
          : { status: "claim-rejected" };
      }

      if (mapping !== null) {
        if (job.operation === "archive") {
          await this.provider.archive({ tableId: mapping.tableId, recordId: mapping.recordId });
        } else {
          await this.provider.delete({ tableId: mapping.tableId, recordId: mapping.recordId });
        }
      }
      return (await this.repository.complete({ ...claim, completedAt: this.now().toISOString() }))
        ? { status: "succeeded" }
        : { status: "claim-rejected" };
    } catch (error) {
      const failedAt = this.now();
      const decision = classifyAirtableProjectionError(error, failedAt);
      if (decision.retryable) {
        const exponentialDelay = Math.min(
          this.retryMaximumMilliseconds,
          this.retryBaseMilliseconds * 2 ** job.attempts,
        );
        const delay = decision.retryAfterMilliseconds ?? exponentialDelay;
        return (await this.repository.retry({
          ...claim,
          availableAt: new Date(failedAt.getTime() + delay).toISOString(),
          error: decision.message,
        }))
          ? { status: "retried" }
          : { status: "claim-rejected" };
      }
      return (await this.repository.fail({
        ...claim,
        completedAt: failedAt.toISOString(),
        error: decision.message,
      }))
        ? { status: "failed" }
        : { status: "claim-rejected" };
    }
  }
}
