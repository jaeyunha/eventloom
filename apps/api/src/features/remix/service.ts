import {
  type ApplyRemixInput,
  type ContentRemixCandidate,
  type ContentRevision,
  type GenerateRemixInput,
  type RegenerateRemixInput,
  type RejectRemixInput,
  type RemixActor,
  type RemixAuditAction,
  type RemixAuditEntry,
  type RemixCandidateFilter,
  type RemixClock,
  type RemixContent,
  type RemixContentGateway,
  type RemixField,
  type RemixIdGenerator,
  type RemixProvider,
  type RemixProviderInput,
  type RemixProviderOutput,
  type RemixRecordFilter,
  type RemixRepository,
  type RemixServiceOptions,
  type RemixSessionContent,
  type RemixSourceRecord,
  type RemixSpeakerContent,
  remixSessionFields,
  remixSpeakerFields,
} from "./types";

export type RemixErrorCode =
  | "REMIX_DEPENDENCY_UNAVAILABLE"
  | "REMIX_INVALID_INPUT"
  | "REMIX_FORBIDDEN"
  | "REMIX_NOT_FOUND"
  | "REMIX_CONFLICT"
  | "REMIX_PROVIDER_FAILURE"
  | "REMIX_PROVIDER_INVALID_OUTPUT";

export class RemixError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 502 | 503;

  constructor(
    readonly code: RemixErrorCode,
    message: string,
    status: 400 | 403 | 404 | 409 | 502 | 503,
  ) {
    super(message);
    this.name = "RemixError";
    this.status = status;
  }
}

const MAX_ID_LENGTH = 200;
const MAX_TONE_LENGTH = 120;
const MAX_GUIDANCE_LENGTH = 2_000;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_SOURCE_IDS = 100;
const MAX_FILTER_ITEMS = 50;
const MAX_TAG_LENGTH = 100;
const MAX_TAGS = 50;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_BIOGRAPHY_LENGTH = 20_000;

const sessionFieldSet = new Set<RemixField>(remixSessionFields);
const speakerFieldSet = new Set<RemixField>(remixSpeakerFields);

export class RemixService {
  readonly #repository: RemixRepository | undefined;
  readonly #contentGateway: RemixContentGateway | undefined;
  readonly #provider: RemixProvider | undefined;
  readonly #clock: RemixClock;
  readonly #idGenerator: RemixIdGenerator;

  constructor(
    repository?: RemixRepository,
    contentGateway?: RemixContentGateway,
    provider?: RemixProvider,
    options: RemixServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#contentGateway = contentGateway;
    this.#provider = provider;
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#idGenerator =
      options.idGenerator ??
      ({
        nextId: (prefix) => `${prefix}_${crypto.randomUUID()}`,
      } satisfies RemixIdGenerator);
  }

  async listRecords(
    actor: RemixActor,
    eventId: string,
    input: { sourceType: "session" | "speaker"; filter?: RemixRecordFilter },
  ): Promise<readonly RemixSourceRecord[]> {
    const normalizedEventId = requireId(eventId, "Event id");
    requireHumanOrganizer(actor, normalizedEventId);
    const gateway = this.requireContentGateway();
    const sourceType = requireSourceType(input.sourceType);
    const filter = normalizeFilter(sourceType, input.filter);
    if (sourceType === "session") {
      return structuredClone(
        (
          await gateway.listSessions({
            tenantId: requireId(actor.tenantId, "Tenant id"),
            eventId: normalizedEventId,
            ...(filter === undefined ? {} : { filter }),
          })
        ).filter(
          (record) =>
            record.kind === "session" &&
            record.eventId === normalizedEventId &&
            matchesRecordFilter(record, filter),
        ),
      );
    }
    return structuredClone(
      (
        await gateway.listSpeakers({
          tenantId: requireId(actor.tenantId, "Tenant id"),
          eventId: normalizedEventId,
          ...(filter === undefined ? {} : { filter }),
        })
      ).filter(
        (record) =>
          record.kind === "speaker" &&
          record.eventId === normalizedEventId &&
          matchesRecordFilter(record, filter),
      ),
    );
  }

  async generate(
    actor: RemixActor,
    input: GenerateRemixInput,
  ): Promise<readonly ContentRemixCandidate[]> {
    const eventId = requireId(input.eventId, "Event id");
    requireHumanOrganizer(actor, eventId);
    const provider = this.requireProvider();
    const repository = this.requireRepository();
    const gateway = this.requireContentGateway();
    const sourceType = requireSourceType(input.sourceType);
    const sourceIds = normalizeIds(input.sourceIds, "Source ids", MAX_SOURCE_IDS);
    const fields = normalizeFields(sourceType, input.fields);
    const tone = normalizeTone(input.tone);
    const guidance = normalizeGuidance(input.guidance);
    const candidates: ContentRemixCandidate[] = [];
    const sources: RemixSourceRecord[] = [];
    for (const sourceId of sourceIds) {
      const source = await this.getSource(gateway, actor.tenantId, eventId, sourceType, sourceId);
      if (source === null) {
        throw notFound(`The ${sourceType} record was not found.`);
      }
      sources.push(source);
    }

    for (const source of sources) {
      candidates.push(
        await this.buildCandidate({
          actor,
          source,
          fields,
          tone,
          guidance,
          parentCandidateId: null,
          generation: 1,
          provider,
        }),
      );
    }
    for (const candidate of candidates) {
      await repository.saveCandidate(candidate, null);
      await repository.appendAudit(
        this.audit(candidate, actor.userId, "candidate.generated", {
          sourceRevision: candidate.sourceRevision,
          generation: candidate.generation,
          provider: candidate.provenance.provider,
          model: candidate.provenance.model,
          promptVersion: candidate.provenance.promptVersion,
        }),
      );
    }

    return structuredClone(candidates);
  }

  async listCandidates(
    actor: RemixActor,
    eventId: string,
    filter?: RemixCandidateFilter,
  ): Promise<readonly ContentRemixCandidate[]> {
    const normalizedEventId = requireId(eventId, "Event id");
    requireHumanOrganizer(actor, normalizedEventId);
    const repository = this.requireRepository();
    this.requireContentGateway();
    const normalizedFilter = normalizeCandidateFilter(filter);
    const candidates = await repository.listCandidates(
      requireId(actor.tenantId, "Tenant id"),
      normalizedEventId,
      normalizedFilter,
    );
    const visible: ContentRemixCandidate[] = [];
    for (const candidate of candidates) {
      if (candidate.tenantId !== actor.tenantId || candidate.eventId !== normalizedEventId) {
        continue;
      }
      if (
        normalizedFilter?.sourceType !== undefined &&
        candidate.sourceType !== normalizedFilter.sourceType
      ) {
        continue;
      }
      if (
        normalizedFilter?.sourceId !== undefined &&
        candidate.sourceId !== normalizedFilter.sourceId
      ) {
        continue;
      }
      const current = await this.syncStaleness(actor, candidate);
      if (normalizedFilter?.status !== undefined && current.status !== normalizedFilter.status) {
        continue;
      }
      visible.push(current);
    }
    return structuredClone(visible);
  }

  async getCandidate(
    actor: RemixActor,
    eventId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate> {
    const normalizedEventId = requireId(eventId, "Event id");
    requireHumanOrganizer(actor, normalizedEventId);
    const repository = this.requireRepository();
    const candidate = await repository.getCandidate(
      requireId(actor.tenantId, "Tenant id"),
      normalizedEventId,
      requireId(candidateId, "Candidate id"),
    );
    if (candidate === null || candidate.tenantId !== actor.tenantId) {
      throw notFound("The remix candidate was not found.");
    }
    return structuredClone(await this.syncStaleness(actor, candidate));
  }

  async regenerate(actor: RemixActor, input: RegenerateRemixInput): Promise<ContentRemixCandidate> {
    const repository = this.requireRepository();
    const provider = this.requireProvider();
    const gateway = this.requireContentGateway();
    const candidateId = requireId(input.candidateId, "Candidate id");
    const currentCandidate = await this.findCandidateForActor(actor, candidateId, input.eventId);
    const synchronized = await this.syncStaleness(actor, currentCandidate);
    if (synchronized.status === "applied") {
      throw conflict("An applied remix candidate cannot be regenerated.");
    }

    const source = await this.getSource(
      gateway,
      actor.tenantId,
      synchronized.eventId,
      synchronized.sourceType,
      synchronized.sourceId,
    );
    if (source === null) {
      throw notFound(`The ${synchronized.sourceType} record was not found.`);
    }
    const tone = input.tone === undefined ? synchronized.tone : normalizeTone(input.tone);
    const guidance =
      input.guidance === undefined ? synchronized.guidance : normalizeGuidance(input.guidance);
    const next = await this.buildCandidate({
      actor,
      source,
      fields: synchronized.fields,
      tone,
      guidance,
      parentCandidateId: synchronized.id,
      generation: synchronized.generation + 1,
      provider,
    });

    if (synchronized.status === "pending") {
      const rejected: ContentRemixCandidate = {
        ...synchronized,
        status: "rejected",
        version: synchronized.version + 1,
        rejectedAt: this.now(),
        rejectedBy: actor.userId,
        rejectionReason: "Superseded by regeneration.",
      };
      await repository.saveCandidate(rejected, synchronized.version);
      await repository.appendAudit(
        this.audit(rejected, actor.userId, "candidate.rejected", {
          reason: "regenerated",
        }),
      );
    }

    await repository.saveCandidate(next, null);
    await repository.appendAudit(
      this.audit(next, actor.userId, "candidate.regenerated", {
        sourceRevision: next.sourceRevision,
        generation: next.generation,
        parentCandidateId: synchronized.id,
        provider: next.provenance.provider,
        model: next.provenance.model,
        promptVersion: next.provenance.promptVersion,
      }),
    );
    return structuredClone(next);
  }

  async reject(actor: RemixActor, input: RejectRemixInput): Promise<ContentRemixCandidate> {
    const repository = this.requireRepository();
    const candidate = await this.findCandidateForActor(
      actor,
      requireId(input.candidateId, "Candidate id"),
      input.eventId,
    );
    const synchronized = await this.syncStaleness(actor, candidate);
    if (synchronized.status === "applied") {
      throw conflict("An applied remix candidate cannot be rejected.");
    }
    if (synchronized.status === "rejected") {
      return structuredClone(synchronized);
    }
    const rejected: ContentRemixCandidate = {
      ...synchronized,
      status: "rejected",
      version: synchronized.version + 1,
      rejectedAt: this.now(),
      rejectedBy: actor.userId,
      rejectionReason: normalizeReason(input.reason),
    };
    await repository.saveCandidate(rejected, synchronized.version);
    await repository.appendAudit(
      this.audit(rejected, actor.userId, "candidate.rejected", {
        reason: rejected.rejectionReason ?? "rejected",
      }),
    );
    return structuredClone(rejected);
  }

  async apply(actor: RemixActor, input: ApplyRemixInput): Promise<ContentRevision> {
    const repository = this.requireRepository();
    const gateway = this.requireContentGateway();
    const candidate = await this.findCandidateForActor(
      actor,
      requireId(input.candidateId, "Candidate id"),
      input.eventId,
    );
    const synchronized = await this.syncStaleness(actor, candidate);
    if (input.expectedVersion !== undefined && input.expectedVersion !== synchronized.version) {
      throw conflict("The remix candidate changed since it was loaded.");
    }
    if (synchronized.status !== "pending") {
      throw conflict("Only a pending remix candidate can be applied.");
    }

    const source = await this.getSource(
      gateway,
      actor.tenantId,
      synchronized.eventId,
      synchronized.sourceType,
      synchronized.sourceId,
    );
    if (source === null) {
      await this.syncStaleness(actor, synchronized);
      throw conflict("The source content no longer exists.");
    }
    if (source.revision !== synchronized.sourceRevision) {
      await this.syncStaleness(actor, synchronized);
      throw conflict("The remix candidate is stale and must be regenerated.");
    }

    const editedContent =
      input.content === undefined
        ? synchronized.candidate
        : mergeContent(
            synchronized.sourceType,
            synchronized.candidate,
            normalizePatch(synchronized.sourceType, synchronized.fields, input.content),
          );
    const appliedAt = this.now();
    let revision: ContentRevision;
    try {
      revision = await gateway.applyRevision({
        tenantId: actor.tenantId,
        eventId: synchronized.eventId,
        sourceType: synchronized.sourceType,
        sourceId: synchronized.sourceId,
        expectedSourceRevision: synchronized.sourceRevision,
        fields: synchronized.fields,
        content: editedContent,
        candidateId: synchronized.id,
        actorId: actor.userId,
        appliedAt,
      });
    } catch (error) {
      if (error instanceof RemixError) throw error;
      throw new RemixError("REMIX_CONFLICT", "The source content could not be revised.", 409);
    }
    validateAppliedRevision(revision, synchronized);

    const applied: ContentRemixCandidate = {
      ...synchronized,
      candidate: structuredClone(editedContent),
      status: "applied",
      version: synchronized.version + 1,
      appliedAt,
      appliedBy: actor.userId,
      appliedRevisionId: revision.id,
    };
    await repository.saveCandidate(applied, synchronized.version);
    await repository.appendAudit(
      this.audit(applied, actor.userId, "candidate.applied", {
        sourceRevision: synchronized.sourceRevision,
        contentRevisionId: revision.id,
        humanEdited: input.content !== undefined,
      }),
    );
    return structuredClone(revision);
  }

  async listAudit(actor: RemixActor, eventId: string): Promise<readonly RemixAuditEntry[]> {
    const normalizedEventId = requireId(eventId, "Event id");
    requireHumanOrganizer(actor, normalizedEventId);
    return structuredClone(
      (
        await this.requireRepository().listAudit(
          requireId(actor.tenantId, "Tenant id"),
          normalizedEventId,
        )
      ).filter((entry) => entry.tenantId === actor.tenantId && entry.eventId === normalizedEventId),
    );
  }

  private async buildCandidate(input: {
    actor: RemixActor;
    source: RemixSourceRecord;
    fields: readonly RemixField[];
    tone: string;
    guidance: string;
    parentCandidateId: string | null;
    generation: number;
    provider: RemixProvider;
  }): Promise<ContentRemixCandidate> {
    const providerInput: RemixProviderInput = {
      tenantId: requireId(input.actor.tenantId, "Tenant id"),
      eventId: input.source.eventId,
      source: structuredClone(input.source),
      fields: [...input.fields],
      tone: input.tone,
      guidance: input.guidance,
      parentCandidateId: input.parentCandidateId,
      generation: input.generation,
    };
    let output: RemixProviderOutput;
    try {
      output = await input.provider.generate(providerInput);
    } catch (error) {
      if (error instanceof RemixError) throw error;
      throw new RemixError("REMIX_PROVIDER_FAILURE", "The remix provider failed.", 502);
    }
    const original = sourceContent(input.source);
    const patch = normalizeProviderOutput(input.source.kind, input.fields, output);
    const candidate = mergeContent(input.source.kind, original, patch);
    const changedFields = input.fields.filter(
      (field) => !sameFieldValue(field, original, candidate),
    );
    const summary = normalizeSummary(output.changeSummary, changedFields);
    const provenance = normalizeProvenance(output.provenance, this.now());
    const createdAt = this.now();
    return {
      id: this.#idGenerator.nextId("candidate"),
      tenantId: input.actor.tenantId,
      eventId: input.source.eventId,
      sourceType: input.source.kind,
      sourceId: input.source.id,
      sourceRevision: input.source.revision,
      fields: [...input.fields],
      tone: input.tone,
      guidance: input.guidance,
      original: structuredClone(original),
      candidate: structuredClone(candidate),
      changedFields,
      changeSummary: summary,
      provenance,
      status: "pending",
      version: 1,
      generation: input.generation,
      parentCandidateId: input.parentCandidateId,
      createdAt,
      createdBy: input.actor.userId,
    };
  }

  private async findCandidateForActor(
    actor: RemixActor,
    candidateId: string,
    expectedEventId?: string,
  ): Promise<ContentRemixCandidate> {
    const repository = this.requireRepository();
    const found = await repository.getCandidateById(
      requireId(actor.tenantId, "Tenant id"),
      candidateId,
    );
    if (found === null) {
      throw notFound("The remix candidate was not found.");
    }
    if (expectedEventId !== undefined && found.eventId !== requireId(expectedEventId, "Event id")) {
      throw notFound("The remix candidate was not found.");
    }
    requireHumanOrganizer(actor, found.eventId);
    return found;
  }

  private async syncStaleness(
    actor: RemixActor,
    candidate: ContentRemixCandidate,
  ): Promise<ContentRemixCandidate> {
    if (candidate.status !== "pending") return candidate;
    const source = await this.getSource(
      this.requireContentGateway(),
      actor.tenantId,
      candidate.eventId,
      candidate.sourceType,
      candidate.sourceId,
    );
    if (source !== null && source.revision === candidate.sourceRevision) {
      return candidate;
    }
    const staleAt = this.now();
    const stale: ContentRemixCandidate = {
      ...candidate,
      status: "stale",
      version: candidate.version + 1,
      staleAt,
      staleReason:
        source === null
          ? "Source content was deleted."
          : "Source content changed after generation.",
    };
    const repository = this.requireRepository();
    await repository.saveCandidate(stale, candidate.version);
    await repository.appendAudit(
      this.audit(stale, actor.userId, "candidate.stale", {
        previousSourceRevision: candidate.sourceRevision,
        currentSourceRevision: source?.revision ?? 0,
      }),
    );
    return stale;
  }

  private async getSource(
    gateway: RemixContentGateway,
    tenantId: string,
    eventId: string,
    sourceType: "session" | "speaker",
    sourceId: string,
  ): Promise<RemixSourceRecord | null> {
    if (sourceType === "session") {
      const source = await gateway.getSession({ tenantId, eventId, sourceId });
      return source !== null &&
        source.kind === "session" &&
        source.eventId === eventId &&
        source.id === sourceId &&
        validRevision(source.revision)
        ? source
        : null;
    }
    const source = await gateway.getSpeaker({ tenantId, eventId, sourceId });
    return source !== null &&
      source.kind === "speaker" &&
      source.eventId === eventId &&
      source.id === sourceId &&
      validRevision(source.revision)
      ? source
      : null;
  }

  private audit(
    candidate: ContentRemixCandidate,
    actorId: string,
    action: RemixAuditAction,
    details: Readonly<Record<string, string | number | boolean>>,
  ) {
    return {
      id: this.#idGenerator.nextId("audit"),
      tenantId: candidate.tenantId,
      eventId: candidate.eventId,
      candidateId: candidate.id,
      actorId,
      action,
      createdAt: this.now(),
      details,
    };
  }

  private requireRepository(): RemixRepository {
    if (this.#repository === undefined) {
      throw dependencyUnavailable("A remix repository is not configured.");
    }
    return this.#repository;
  }

  private requireContentGateway(): RemixContentGateway {
    if (this.#contentGateway === undefined) {
      throw dependencyUnavailable("A remix content gateway is not configured.");
    }
    return this.#contentGateway;
  }

  private requireProvider(): RemixProvider {
    if (this.#provider === undefined) {
      throw dependencyUnavailable("A remix provider is not configured.");
    }
    return this.#provider;
  }

  private now(): string {
    return this.#clock.now().toISOString();
  }
}

function requireHumanOrganizer(actor: RemixActor, eventId: string): void {
  if (
    actor.kind !== "human" ||
    !actor.grants.some((grant) => grant.eventId === eventId && grant.role === "organizer")
  ) {
    throw new RemixError("REMIX_FORBIDDEN", "A human event organizer is required.", 403);
  }
}

function requireId(value: string, field: string): string {
  if (typeof value !== "string") {
    throw invalid(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_ID_LENGTH) {
    throw invalid(`${field} must contain between 1 and ${MAX_ID_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeIds(
  values: readonly string[],
  field: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > maximum) {
    throw invalid(`${field} must contain between 1 and ${maximum} values.`);
  }
  const normalized = values.map((value) => requireId(value, field));
  if (new Set(normalized).size !== normalized.length) {
    throw invalid(`${field} must not contain duplicates.`);
  }
  return normalized;
}

function normalizeTone(value: string): string {
  return normalizeBoundedText(value, "Tone", MAX_TONE_LENGTH);
}

function normalizeGuidance(value: string | undefined): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw invalid("Guidance must be text.");
  if (value.trim().length === 0) return "";
  return normalizeBoundedText(value, "Guidance", MAX_GUIDANCE_LENGTH);
}

function normalizeReason(value: string | undefined): string {
  if (value === undefined) return "Rejected by organizer.";
  return normalizeBoundedText(value, "Rejection reason", MAX_SUMMARY_LENGTH);
}

function normalizeBoundedText(value: string, field: string, maximum: number): string {
  if (typeof value !== "string") throw invalid(`${field} must be text.`);
  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (normalized.length === 0 || normalized.length > maximum || hasUnsafeControl(normalized)) {
    throw invalid(`${field} must contain between 1 and ${maximum} safe characters.`);
  }
  return normalized;
}

function normalizeOptionalSummary(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw providerInvalid("The remix provider returned an invalid change summary.");
  }
  if (value.trim().length === 0) return undefined;
  return normalizeBoundedText(value, "Change summary", MAX_SUMMARY_LENGTH);
}

function hasUnsafeControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

function requireSourceType(value: string): "session" | "speaker" {
  if (value !== "session" && value !== "speaker") {
    throw invalid("Source type must be session or speaker.");
  }
  return value;
}
function normalizeFields(
  sourceType: "session" | "speaker",
  fields: readonly RemixField[],
): readonly RemixField[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw invalid("At least one remix field must be selected.");
  }
  const allowed = sourceType === "session" ? sessionFieldSet : speakerFieldSet;
  const normalized = [...fields];
  if (
    new Set(normalized).size !== normalized.length ||
    normalized.some((field) => !allowed.has(field))
  ) {
    throw invalid(`The selected fields are not allowed for ${sourceType} content.`);
  }
  return normalized;
}

function normalizeFilter(
  sourceType: "session" | "speaker",
  filter: RemixRecordFilter | undefined,
): RemixRecordFilter | undefined {
  if (filter === undefined) return undefined;
  if (sourceType === "speaker" && (filter.tags !== undefined || filter.tracks !== undefined)) {
    throw invalid("Speaker records cannot be filtered by session tags or tracks.");
  }
  const normalized: RemixRecordFilter = {};
  if (filter.ids !== undefined) {
    normalized.ids = normalizeIds(filter.ids, "Record ids", MAX_FILTER_ITEMS);
  }
  if (filter.query !== undefined)
    normalized.query = normalizeBoundedText(filter.query, "Query", 200);
  if (filter.tags !== undefined) normalized.tags = normalizeLabels(filter.tags, "Tags");
  if (filter.tracks !== undefined) normalized.tracks = normalizeLabels(filter.tracks, "Tracks");
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

function normalizeCandidateFilter(
  filter: RemixCandidateFilter | undefined,
): RemixCandidateFilter | undefined {
  if (filter === undefined) return undefined;
  if (filter.sourceId !== undefined)
    return { ...filter, sourceId: requireId(filter.sourceId, "Source id") };
  return filter;
}
function matchesRecordFilter(
  record: RemixSourceRecord,
  filter: RemixRecordFilter | undefined,
): boolean {
  if (filter === undefined) return true;
  if (filter.ids !== undefined && !filter.ids.includes(record.id)) return false;
  if (
    filter.query !== undefined &&
    !JSON.stringify(record).toLowerCase().includes(filter.query.toLowerCase())
  ) {
    return false;
  }
  if (record.kind === "session") {
    if (filter.tags !== undefined && !filter.tags.every((tag) => record.tags?.includes(tag))) {
      return false;
    }
    if (
      filter.tracks !== undefined &&
      !filter.tracks.every((track) => record.tracks?.includes(track))
    ) {
      return false;
    }
  }
  return true;
}

function normalizeLabels(values: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(values) || values.length > MAX_FILTER_ITEMS) {
    throw invalid(`${field} cannot contain more than ${MAX_FILTER_ITEMS} values.`);
  }
  return values.map((value) => normalizeLabel(value, field));
}

function normalizeLabel(value: string, field: string): string {
  if (typeof value !== "string") throw invalid(`${field} must contain text values.`);
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_TAG_LENGTH ||
    hasUnsafeControl(normalized)
  ) {
    throw invalid(`${field} values must contain between 1 and ${MAX_TAG_LENGTH} safe characters.`);
  }
  return normalized;
}

function sourceContent(source: RemixSourceRecord): RemixContent {
  if (source.kind === "session") {
    return {
      title: normalizeContentText(source.title, "Session title", MAX_TITLE_LENGTH),
      description: normalizeContentText(
        source.description,
        "Session description",
        MAX_DESCRIPTION_LENGTH,
      ),
      tags: normalizeSourceLabels(source.tags, "Session tags"),
      tracks: normalizeSourceLabels(source.tracks, "Session tracks"),
    } satisfies RemixSessionContent;
  }
  return {
    biography: normalizeContentText(source.biography, "Speaker biography", MAX_BIOGRAPHY_LENGTH),
  } satisfies RemixSpeakerContent;
}

function normalizeSourceLabels(
  values: readonly string[] | undefined,
  field: string,
): readonly string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > MAX_TAGS) {
    throw invalid(`${field} cannot contain more than ${MAX_TAGS} values.`);
  }
  const labels = values.map((value) => normalizeLabel(value, field));
  if (new Set(labels).size !== labels.length)
    throw invalid(`${field} must not contain duplicates.`);
  return labels;
}

function normalizeContentText(value: string, field: string, maximum: number): string {
  if (typeof value !== "string") throw invalid(`${field} must be text.`);
  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (
    normalized.length > maximum ||
    hasUnsafeControl(normalized) ||
    (field.toLowerCase().includes("title") && normalized.length === 0)
  ) {
    throw invalid(`${field} exceeds its safe content limit.`);
  }
  return normalized;
}

function normalizeProviderOutput(
  sourceType: "session" | "speaker",
  fields: readonly RemixField[],
  output: RemixProviderOutput,
): Readonly<Record<string, unknown>> {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    throw providerInvalid("The remix provider returned an invalid response.");
  }
  if (
    output.content === null ||
    typeof output.content !== "object" ||
    Array.isArray(output.content)
  ) {
    throw providerInvalid("The remix provider returned invalid content.");
  }
  const allowed = sourceType === "session" ? sessionFieldSet : speakerFieldSet;
  const selected = new Set(fields);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output.content)) {
    if (!allowed.has(key as RemixField) || !selected.has(key as RemixField)) {
      throw providerInvalid("The remix provider returned a field outside the requested allowlist.");
    }
    if (key === "title") {
      patch[key] = normalizeContentText(value as string, "Candidate title", MAX_TITLE_LENGTH);
    } else if (key === "description") {
      patch[key] = normalizeContentText(
        value as string,
        "Candidate description",
        MAX_DESCRIPTION_LENGTH,
      );
    } else if (key === "biography") {
      patch[key] = normalizeContentText(
        value as string,
        "Candidate biography",
        MAX_BIOGRAPHY_LENGTH,
      );
    } else if (key === "tags" || key === "tracks") {
      patch[key] = normalizeSourceLabels(value as readonly string[], `Candidate ${key}`);
    } else {
      throw providerInvalid("The remix provider returned an unsupported field.");
    }
  }
  return patch;
}

function normalizePatch(
  sourceType: "session" | "speaker",
  fields: readonly RemixField[],
  content: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  try {
    return normalizeProviderOutput(sourceType, fields, {
      content,
      provenance: { provider: "human", model: "human", promptVersion: "human" },
    });
  } catch (error) {
    if (error instanceof RemixError && error.code === "REMIX_PROVIDER_INVALID_OUTPUT") {
      throw invalid(error.message);
    }
    throw error;
  }
}

function mergeContent(
  sourceType: "session" | "speaker",
  original: RemixContent,
  patch: Readonly<Record<string, unknown>>,
): RemixContent {
  if (sourceType === "session") {
    const session = original as RemixSessionContent;
    return {
      title: (patch.title as string | undefined) ?? session.title,
      description: (patch.description as string | undefined) ?? session.description,
      tags: (patch.tags as readonly string[] | undefined) ?? [...session.tags],
      tracks: (patch.tracks as readonly string[] | undefined) ?? [...session.tracks],
    } satisfies RemixSessionContent;
  }
  const speaker = original as RemixSpeakerContent;
  return {
    biography: (patch.biography as string | undefined) ?? speaker.biography,
  } satisfies RemixSpeakerContent;
}

function sameFieldValue(field: RemixField, left: RemixContent, right: RemixContent): boolean {
  const read = (content: RemixContent): string | readonly string[] | undefined => {
    if (field === "title" && "title" in content) return content.title;
    if (field === "description" && "description" in content) return content.description;
    if (field === "tags" && "tags" in content) return content.tags;
    if (field === "tracks" && "tracks" in content) return content.tracks;
    if (field === "biography" && "biography" in content) return content.biography;
    return undefined;
  };
  const leftValue = read(left);
  const rightValue = read(right);
  if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
    return leftValue.join("\u0000") === rightValue.join("\u0000");
  }
  return leftValue === rightValue;
}

function normalizeSummary(value: string | undefined, changedFields: readonly RemixField[]): string {
  const explicit = normalizeOptionalSummary(value);
  if (explicit !== undefined) return explicit;
  return changedFields.length === 0
    ? "No requested fields changed."
    : `Changed fields: ${changedFields.join(", ")}.`;
}

function normalizeProvenance(provenance: RemixProviderOutput["provenance"], generatedAt: string) {
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    typeof provenance.provider !== "string" ||
    typeof provenance.model !== "string" ||
    typeof provenance.promptVersion !== "string"
  ) {
    throw providerInvalid("The remix provider did not return provenance.");
  }
  const provider = normalizeBoundedText(provenance.provider, "Provider name", 200);
  const model = normalizeBoundedText(provenance.model, "Provider model", 200);
  const promptVersion = normalizeBoundedText(provenance.promptVersion, "Prompt version", 200);
  const result: {
    provider: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
    requestId?: string;
    metadata?: Readonly<Record<string, string>>;
  } = { provider, model, promptVersion, generatedAt };
  if (provenance.requestId !== undefined) {
    result.requestId = normalizeBoundedText(provenance.requestId, "Provider request id", 300);
  }
  if (provenance.metadata !== undefined) {
    if (
      provenance.metadata === null ||
      typeof provenance.metadata !== "object" ||
      Array.isArray(provenance.metadata)
    ) {
      throw providerInvalid("The remix provider returned invalid provenance metadata.");
    }
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(provenance.metadata)) {
      metadata[normalizeBoundedText(key, "Provenance metadata key", 100)] = normalizeBoundedText(
        value,
        "Provenance metadata value",
        500,
      );
    }
    result.metadata = metadata;
  }
  return result;
}

function validateAppliedRevision(
  revision: ContentRevision,
  candidate: ContentRemixCandidate,
): void {
  if (
    revision === null ||
    typeof revision !== "object" ||
    typeof revision.id !== "string" ||
    revision.id.trim().length === 0 ||
    !validRevision(revision.sourceRevision) ||
    revision.tenantId !== candidate.tenantId ||
    revision.eventId !== candidate.eventId ||
    revision.sourceType !== candidate.sourceType ||
    revision.sourceId !== candidate.sourceId ||
    revision.candidateId !== candidate.id
  ) {
    throw new RemixError(
      "REMIX_CONFLICT",
      "The content gateway returned an invalid revision.",
      409,
    );
  }
}

function invalid(message: string): RemixError {
  return new RemixError("REMIX_INVALID_INPUT", message, 400);
}
function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function notFound(message: string): RemixError {
  return new RemixError("REMIX_NOT_FOUND", message, 404);
}

function conflict(message: string): RemixError {
  return new RemixError("REMIX_CONFLICT", message, 409);
}

function dependencyUnavailable(message: string): RemixError {
  return new RemixError("REMIX_DEPENDENCY_UNAVAILABLE", message, 503);
}

function providerInvalid(message: string): RemixError {
  return new RemixError("REMIX_PROVIDER_INVALID_OUTPUT", message, 502);
}
