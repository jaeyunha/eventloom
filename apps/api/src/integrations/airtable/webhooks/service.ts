import type { AirtableSecretStore } from "../control/service";
import {
  type AirtableWebhookProvider,
  AirtableWebhookProviderError,
  type AirtableWebhookSpecification,
} from "./provider";
import type { D1AirtableWebhookRegistrationRepository } from "./repository";
import type { AirtableWebhookDueRegistration } from "./types";

export interface AirtableWebhookRefreshServiceOptions {
  workerId: string;
  notificationUrl: (registrationId: string) => string;
  specification: AirtableWebhookSpecification;
  specificationHash: string;
  refreshAheadMs?: number;
  leaseDurationMs?: number;
  batchSize?: number;
  now?: () => Date;
  createId?: () => string;
  createLeaseToken?: () => string;
}

export interface AirtableWebhookRefreshResult {
  examined: number;
  refreshed: number;
  recreated: number;
  skipped: number;
  failed: number;
}

export interface AirtableWebhookRegistrationLifecycleRepository {
  create: D1AirtableWebhookRegistrationRepository["create"];
  completeCreate: D1AirtableWebhookRegistrationRepository["completeCreate"];
  findById: D1AirtableWebhookRegistrationRepository["findById"];
  listDue: D1AirtableWebhookRegistrationRepository["listDue"];
  claimRefresh: D1AirtableWebhookRegistrationRepository["claimRefresh"];
  finishRefresh: D1AirtableWebhookRegistrationRepository["finishRefresh"];
  replace: D1AirtableWebhookRegistrationRepository["replace"];
  disable: D1AirtableWebhookRegistrationRepository["disable"];
}

export class AirtableWebhookRefreshService {
  private readonly refreshAheadMs: number;
  private readonly leaseDurationMs: number;
  private readonly batchSize: number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createLeaseToken: () => string;

  constructor(
    private readonly registrations: AirtableWebhookRegistrationLifecycleRepository,
    private readonly provider: AirtableWebhookProvider,
    private readonly secrets: AirtableSecretStore,
    private readonly options: AirtableWebhookRefreshServiceOptions,
  ) {
    this.refreshAheadMs = positiveInteger(options.refreshAheadMs ?? 24 * 60 * 60 * 1_000);
    this.leaseDurationMs = positiveInteger(options.leaseDurationMs ?? 60_000);
    this.batchSize = positiveInteger(options.batchSize ?? 50);
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => `airtable_webhook_${crypto.randomUUID()}`);
    this.createLeaseToken = options.createLeaseToken ?? (() => crypto.randomUUID());
  }

  async create(input: {
    organizationId: string;
    connectionId: string;
    credentialReference: string;
    baseId: string;
  }) {
    const createdAt = timestamp(this.now());
    const id = this.createId();
    await this.registrations.create({
      id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      specificationHash: this.options.specificationHash,
      createdAt,
    });

    const credential = await this.secrets.get(input.credentialReference);
    try {
      const providerRegistration = await this.provider.create({
        credential,
        baseId: input.baseId,
        notificationUrl: this.options.notificationUrl(id),
        specification: this.options.specification,
      });
      const completed = await this.registrations.completeCreate({
        registrationId: id,
        expectedVersion: 1,
        providerWebhookId: providerRegistration.id,
        macSecret: providerRegistration.macSecret,
        expiresAt: providerRegistration.expiresAt,
        updatedAt: timestamp(this.now()),
      });
      if (completed === null) {
        await this.provider.delete({
          credential,
          baseId: input.baseId,
          webhookId: providerRegistration.id,
        });
        throw new Error("The Airtable webhook creation lease was lost.");
      }
      return completed;
    } catch (error) {
      await this.registrations.disable({
        registrationId: id,
        status: "invalid",
        updatedAt: timestamp(this.now()),
      });
      throw error;
    }
  }

  async disable(input: {
    registrationId: string;
    credentialReference: string;
    baseId: string;
  }): Promise<void> {
    const registration = await this.registrations.findById(input.registrationId);
    if (registration === null || registration.status === "deleted") return;
    const credential = await this.secrets.get(input.credentialReference);
    if (registration.providerWebhookId !== null) {
      try {
        await this.provider.delete({
          credential,
          baseId: input.baseId,
          webhookId: registration.providerWebhookId,
        });
      } catch (error) {
        if (!(error instanceof AirtableWebhookProviderError && error.status === 404)) throw error;
      }
    }
    await this.registrations.disable({
      registrationId: input.registrationId,
      status: "deleted",
      updatedAt: timestamp(this.now()),
    });
  }

  async refreshDue(): Promise<AirtableWebhookRefreshResult> {
    const startedAt = this.now();
    const now = timestamp(startedAt);
    const refreshBefore = timestamp(new Date(startedAt.getTime() + this.refreshAheadMs));
    const due = await this.registrations.listDue({ refreshBefore, now, limit: this.batchSize });
    const result: AirtableWebhookRefreshResult = {
      examined: due.length,
      refreshed: 0,
      recreated: 0,
      skipped: 0,
      failed: 0,
    };

    for (const candidate of due) {
      const outcome = await this.refreshCandidate(candidate);
      result[outcome] += 1;
    }
    return result;
  }

  private async refreshCandidate(
    candidate: AirtableWebhookDueRegistration,
  ): Promise<"refreshed" | "recreated" | "skipped" | "failed"> {
    const claimedAtDate = this.now();
    const claimedAt = timestamp(claimedAtDate);
    const refreshToken = this.createLeaseToken();
    const claimed = await this.registrations.claimRefresh({
      registrationId: candidate.id,
      expectedVersion: candidate.registrationVersion,
      workerId: this.options.workerId,
      refreshToken,
      claimedAt,
      leaseExpiresAt: timestamp(new Date(claimedAtDate.getTime() + this.leaseDurationMs)),
    });
    if (claimed === null) return "skipped";

    try {
      const credential = await this.secrets.get(claimed.credentialReference);
      const recreate =
        claimed.providerWebhookId === null ||
        claimed.specificationHash !== this.options.specificationHash ||
        candidate.status === "invalid";
      if (recreate) {
        await this.recreate(claimed, credential, refreshToken);
        return "recreated";
      }

      const providerWebhookId = claimed.providerWebhookId;
      if (providerWebhookId === null)
        throw new Error("The active Airtable webhook has no provider ID.");
      try {
        const refreshed = await this.provider.refresh({
          credential,
          baseId: claimed.baseId,
          webhookId: providerWebhookId,
        });
        const finished = await this.registrations.finishRefresh({
          registrationId: claimed.id,
          refreshToken,
          expiresAt: refreshed.expiresAt,
          updatedAt: timestamp(this.now()),
        });
        return finished === null ? "skipped" : "refreshed";
      } catch (error) {
        if (!(error instanceof AirtableWebhookProviderError && error.requiresRecreation))
          throw error;
        await this.recreate(claimed, credential, refreshToken);
        return "recreated";
      }
    } catch {
      await this.registrations.disable({
        registrationId: claimed.id,
        status: "invalid",
        updatedAt: timestamp(this.now()),
        refreshToken,
      });
      return "failed";
    }
  }

  private async recreate(
    registration: AirtableWebhookDueRegistration,
    credential: string,
    refreshToken: string,
  ): Promise<void> {
    const created = await this.provider.create({
      credential,
      baseId: registration.baseId,
      notificationUrl: this.options.notificationUrl(registration.id),
      specification: this.options.specification,
    });
    const replaced = await this.registrations.replace({
      registrationId: registration.id,
      refreshToken,
      providerWebhookId: created.id,
      macSecret: created.macSecret,
      expiresAt: created.expiresAt,
      specificationHash: this.options.specificationHash,
      updatedAt: timestamp(this.now()),
    });
    if (replaced === null) {
      await this.provider.delete({
        credential,
        baseId: registration.baseId,
        webhookId: created.id,
      });
      throw new Error("The Airtable webhook refresh lease was lost.");
    }
    if (registration.providerWebhookId !== null && registration.providerWebhookId !== created.id) {
      try {
        await this.provider.delete({
          credential,
          baseId: registration.baseId,
          webhookId: registration.providerWebhookId,
        });
      } catch {
        // The replacement is already active; stale-provider cleanup is best effort.
      }
    }
  }
}

function timestamp(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error("The Airtable webhook clock is invalid.");
  return date.toISOString();
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Airtable webhook timing and batch options must be positive integers.");
  }
  return value;
}
