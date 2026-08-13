import { describe, expect, it, vi } from "vitest";
import type { AirtableSecretStore } from "../control/service";
import { type AirtableWebhookProvider, AirtableWebhookProviderError } from "./provider";
import {
  AirtableWebhookRefreshService,
  type AirtableWebhookRegistrationLifecycleRepository,
} from "./service";
import type { AirtableWebhookDueRegistration, AirtableWebhookRegistrationRecord } from "./types";

function registration(
  patch: Partial<AirtableWebhookDueRegistration> = {},
): AirtableWebhookDueRegistration {
  return {
    id: "opaque_registration_1",
    organizationId: "organization-1",
    connectionId: "connection-1",
    providerWebhookId: "ach-old",
    macSecretCiphertext: "ciphertext",
    expiresAt: "2026-08-13T18:00:00.000Z",
    specificationHash: "spec-v1",
    status: "active",
    refreshOwner: null,
    refreshToken: null,
    refreshLeaseExpiresAt: null,
    registrationVersion: 2,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    credentialReference: "credential-ref",
    baseId: "app-1",
    ...patch,
  };
}

function harness(candidate: AirtableWebhookDueRegistration, providerPatch = {}) {
  const claimed = {
    ...candidate,
    status: "refreshing" as const,
    refreshOwner: "worker-1",
    refreshToken: "lease-1",
    refreshLeaseExpiresAt: "2026-08-13T12:01:00.000Z",
    registrationVersion: candidate.registrationVersion + 1,
  };
  const repository: AirtableWebhookRegistrationLifecycleRepository = {
    create: vi.fn(async () => undefined),
    completeCreate: vi.fn(async () => candidate),
    findById: vi.fn(async () => candidate),
    listDue: vi.fn(async () => [candidate]),
    claimRefresh: vi.fn(async () => claimed),
    finishRefresh: vi.fn(
      async (input) =>
        ({
          ...claimed,
          status: "active" as const,
          expiresAt: input.expiresAt,
          refreshOwner: null,
          refreshToken: null,
          refreshLeaseExpiresAt: null,
        }) satisfies AirtableWebhookRegistrationRecord,
    ),
    replace: vi.fn(
      async (input) =>
        ({
          ...claimed,
          status: "active" as const,
          providerWebhookId: input.providerWebhookId,
          specificationHash: input.specificationHash,
          refreshOwner: null,
          refreshToken: null,
          refreshLeaseExpiresAt: null,
        }) satisfies AirtableWebhookRegistrationRecord,
    ),
    disable: vi.fn(async () => true),
  };
  const provider: AirtableWebhookProvider = {
    create: vi.fn(async () => ({
      id: "ach-new",
      macSecret: "c2VjcmV0",
      expiresAt: "2026-08-20T12:00:00.000Z",
    })),
    refresh: vi.fn(async () => ({ expiresAt: "2026-08-20T12:00:00.000Z" })),
    delete: vi.fn(async () => undefined),
    ...providerPatch,
  };
  const secrets: AirtableSecretStore = {
    put: vi.fn(async () => "unused"),
    get: vi.fn(async () => "access-token"),
    delete: vi.fn(async () => undefined),
  };
  const service = new AirtableWebhookRefreshService(repository, provider, secrets, {
    workerId: "worker-1",
    notificationUrl: (id) => `https://example.test/webhooks/${id}`,
    specification: { options: { filters: { dataTypes: ["tableData"] } } },
    specificationHash: "spec-v1",
    now: () => new Date("2026-08-13T12:00:00.000Z"),
    createLeaseToken: () => "lease-1",
  });
  return { service, repository, provider, secrets };
}

describe("AirtableWebhookRefreshService", () => {
  it("claims and refreshes a due registration deterministically", async () => {
    const { service, repository, provider } = harness(registration());

    await expect(service.refreshDue()).resolves.toEqual({
      examined: 1,
      refreshed: 1,
      recreated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(repository.listDue).toHaveBeenCalledWith({
      refreshBefore: "2026-08-14T12:00:00.000Z",
      now: "2026-08-13T12:00:00.000Z",
      limit: 50,
    });
    expect(repository.claimRefresh).toHaveBeenCalledWith({
      registrationId: "opaque_registration_1",
      expectedVersion: 2,
      workerId: "worker-1",
      refreshToken: "lease-1",
      claimedAt: "2026-08-13T12:00:00.000Z",
      leaseExpiresAt: "2026-08-13T12:01:00.000Z",
    });
    expect(provider.refresh).toHaveBeenCalledWith({
      credential: "access-token",
      baseId: "app-1",
      webhookId: "ach-old",
    });
  });

  it("recreates a provider webhook when refresh reports it missing", async () => {
    const refresh = vi.fn(async () => {
      throw new AirtableWebhookProviderError("refresh", 404);
    });
    const { service, repository, provider } = harness(registration(), { refresh });

    await expect(service.refreshDue()).resolves.toMatchObject({ recreated: 1, failed: 0 });
    expect(provider.create).toHaveBeenCalledWith({
      credential: "access-token",
      baseId: "app-1",
      notificationUrl: "https://example.test/webhooks/opaque_registration_1",
      specification: { options: { filters: { dataTypes: ["tableData"] } } },
    });
    expect(repository.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: "opaque_registration_1",
        refreshToken: "lease-1",
        providerWebhookId: "ach-new",
        macSecret: "c2VjcmV0",
      }),
    );
    expect(provider.delete).toHaveBeenCalledWith({
      credential: "access-token",
      baseId: "app-1",
      webhookId: "ach-old",
    });
  });

  it("counts a lost claim as skipped without calling the provider", async () => {
    const { service, repository, provider } = harness(registration());
    repository.claimRefresh = vi.fn(async () => null);

    await expect(service.refreshDue()).resolves.toMatchObject({ skipped: 1 });
    expect(provider.refresh).not.toHaveBeenCalled();
    expect(provider.create).not.toHaveBeenCalled();
  });
});
