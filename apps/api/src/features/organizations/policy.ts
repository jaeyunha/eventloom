import {
  type OrganizationEntitlement,
  organizationEntitlementCapabilities,
} from "@eventloom/contracts";

export interface OrganizationEntitlementRepository {
  getEntitlement(organizationId: string): Promise<OrganizationEntitlement | null>;
}

export interface OrganizationEntitlementAudit {
  readonly id: string;
  readonly traceId: string;
  readonly occurredAt: string;
  readonly expectedRevision: number;
}

export interface OrganizationEntitlementCommandRepository
  extends OrganizationEntitlementRepository {
  putEntitlement(
    entitlement: OrganizationEntitlement,
    audit: OrganizationEntitlementAudit,
  ): Promise<OrganizationEntitlement>;
}

export class OrganizationEntitlementConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationEntitlementConflictError";
  }
}

export type EventCreationAuthorization =
  | { readonly kind: "unrestricted" }
  | {
      readonly kind: "entitled";
      readonly entitlement: OrganizationEntitlement;
    };

export interface OrganizationPolicy {
  authorizeEventCreation(organizationId: string): Promise<EventCreationAuthorization>;
}

export type OrganizationPolicyErrorCode =
  | "ENTITLEMENT_MISSING"
  | "ORGANIZATION_RESTRICTED"
  | "ENTITLEMENT_NOT_ACTIVE"
  | "ENTITLEMENT_EXPIRED"
  | "CAPABILITY_NOT_GRANTED";

export class OrganizationPolicyError extends Error {
  readonly code: OrganizationPolicyErrorCode;

  constructor(code: OrganizationPolicyErrorCode, message: string) {
    super(message);
    this.name = "OrganizationPolicyError";
    this.code = code;
  }
}

export class InMemoryOrganizationEntitlementRepository
  implements OrganizationEntitlementCommandRepository
{
  readonly #entitlements: Map<string, OrganizationEntitlement>;
  readonly #audits = new Map<string, OrganizationEntitlement>();

  constructor(seed: readonly OrganizationEntitlement[] = []) {
    this.#entitlements = new Map(
      seed.map((entitlement) => [entitlement.organizationId, structuredClone(entitlement)]),
    );
  }

  async getEntitlement(organizationId: string): Promise<OrganizationEntitlement | null> {
    return structuredClone(this.#entitlements.get(organizationId) ?? null);
  }

  async putEntitlement(
    entitlement: OrganizationEntitlement,
    audit: OrganizationEntitlementAudit,
  ): Promise<OrganizationEntitlement> {
    const current = this.#entitlements.get(entitlement.organizationId);
    if (current !== undefined && structuredClone(current).revision === entitlement.revision) {
      if (JSON.stringify(current) !== JSON.stringify(entitlement)) {
        throw new OrganizationEntitlementConflictError(
          "The entitlement revision is already associated with another payload.",
        );
      }
      const prior = this.#audits.get(audit.id);
      if (prior !== undefined && JSON.stringify(prior) === JSON.stringify(entitlement)) {
        return structuredClone(current);
      }
      throw new OrganizationEntitlementConflictError(
        "The organization entitlement revision is stale.",
      );
    }
    if (
      (current === undefined && audit.expectedRevision !== 0) ||
      (current !== undefined && current.revision !== audit.expectedRevision) ||
      entitlement.revision <= audit.expectedRevision
    ) {
      throw new OrganizationEntitlementConflictError(
        "The organization entitlement revision is stale.",
      );
    }
    this.#entitlements.set(entitlement.organizationId, structuredClone(entitlement));
    this.#audits.set(audit.id, structuredClone(entitlement));
    return structuredClone(entitlement);
  }
}

export class SelfHostedOrganizationPolicy implements OrganizationPolicy {
  async authorizeEventCreation(_organizationId: string): Promise<EventCreationAuthorization> {
    return { kind: "unrestricted" };
  }
}

export interface ManagedOrganizationPolicyOptions {
  readonly clock?: () => Date;
}

export type OrganizationPolicyConfiguration =
  | {
      readonly deploymentMode: "self-hosted";
    }
  | {
      readonly deploymentMode: "managed";
      readonly repository: OrganizationEntitlementRepository;
      readonly options?: ManagedOrganizationPolicyOptions;
    };

export function createOrganizationPolicy(
  configuration: OrganizationPolicyConfiguration,
): OrganizationPolicy {
  if (configuration.deploymentMode === "self-hosted") {
    return new SelfHostedOrganizationPolicy();
  }
  return new ManagedOrganizationPolicy(configuration.repository, configuration.options);
}

export class ManagedOrganizationPolicy implements OrganizationPolicy {
  readonly #repository: OrganizationEntitlementRepository;
  readonly #clock: () => Date;

  constructor(
    repository: OrganizationEntitlementRepository,
    options: ManagedOrganizationPolicyOptions = {},
  ) {
    this.#repository = repository;
    this.#clock = options.clock ?? (() => new Date());
  }

  async authorizeEventCreation(organizationId: string): Promise<EventCreationAuthorization> {
    const entitlement = await this.#repository.getEntitlement(organizationId);
    if (entitlement === null) {
      throw new OrganizationPolicyError(
        "ENTITLEMENT_MISSING",
        "The organization does not have an active entitlement.",
      );
    }
    if (entitlement.state !== "active") {
      throw new OrganizationPolicyError(
        "ORGANIZATION_RESTRICTED",
        "The organization is restricted.",
      );
    }

    const now = this.#clock().getTime();
    if (Date.parse(entitlement.notBefore) > now) {
      throw new OrganizationPolicyError(
        "ENTITLEMENT_NOT_ACTIVE",
        "The organization entitlement is not active yet.",
      );
    }
    if (entitlement.expiresAt !== null && Date.parse(entitlement.expiresAt) <= now) {
      throw new OrganizationPolicyError(
        "ENTITLEMENT_EXPIRED",
        "The organization entitlement has expired.",
      );
    }
    if (!entitlement.capabilities.includes(organizationEntitlementCapabilities.eventCreation)) {
      throw new OrganizationPolicyError(
        "CAPABILITY_NOT_GRANTED",
        "The organization entitlement does not grant event creation.",
      );
    }

    return {
      kind: "entitled",
      entitlement,
    };
  }
}
