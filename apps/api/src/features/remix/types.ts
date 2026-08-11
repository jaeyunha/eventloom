export type RemixSourceType = "session" | "speaker";

export type RemixField = "title" | "description" | "tags" | "tracks" | "biography";

export const remixSessionFields = ["title", "description", "tags", "tracks"] as const;
export const remixSpeakerFields = ["biography"] as const;

export type RemixSessionField = (typeof remixSessionFields)[number];
export type RemixSpeakerField = (typeof remixSpeakerFields)[number];

export interface RemixSessionContent {
  title: string;
  description: string;
  tags: readonly string[];
  tracks: readonly string[];
}

export interface RemixSpeakerContent {
  biography: string;
}

export type RemixContent = RemixSessionContent | RemixSpeakerContent;

export interface RemixSessionRecord extends Omit<RemixSessionContent, "tags" | "tracks"> {
  kind: "session";
  id: string;
  eventId: string;
  revision: number;
  tags?: readonly string[];
  tracks?: readonly string[];
}

export interface RemixSpeakerRecord extends RemixSpeakerContent {
  kind: "speaker";
  id: string;
  eventId: string;
  revision: number;
}

export type RemixSourceRecord = RemixSessionRecord | RemixSpeakerRecord;

export interface RemixRecordFilter {
  ids?: readonly string[];
  query?: string;
  tags?: readonly string[];
  tracks?: readonly string[];
}

export interface RemixOrganizerGrant {
  eventId: string;
  role: "organizer";
}

export interface RemixActor {
  tenantId: string;
  userId: string;
  kind: "human" | "automation";
  grants: readonly RemixOrganizerGrant[];
}

export interface RemixProvenance {
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  requestId?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface RemixProviderInput {
  tenantId: string;
  eventId: string;
  source: RemixSourceRecord;
  fields: readonly RemixField[];
  tone: string;
  guidance: string;
  parentCandidateId: string | null;
  generation: number;
}

export interface RemixProviderOutput {
  /** The provider may return only the requested fields; omitted fields retain their source value. */
  content: Readonly<Record<string, unknown>>;
  changeSummary?: string;
  provenance: Omit<RemixProvenance, "generatedAt"> & {
    generatedAt?: string;
  };
}

export interface RemixProvider {
  generate(input: RemixProviderInput): Promise<RemixProviderOutput>;
}

export interface ContentRemixCandidate {
  id: string;
  tenantId: string;
  eventId: string;
  sourceType: RemixSourceType;
  sourceId: string;
  sourceRevision: number;
  fields: readonly RemixField[];
  tone: string;
  guidance: string;
  original: RemixContent;
  candidate: RemixContent;
  changedFields: readonly RemixField[];
  changeSummary: string;
  provenance: RemixProvenance;
  status: "pending" | "applied" | "rejected" | "stale";
  version: number;
  generation: number;
  parentCandidateId: string | null;
  createdAt: string;
  createdBy: string;
  appliedAt?: string;
  appliedBy?: string;
  appliedRevisionId?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  staleAt?: string;
  staleReason?: string;
}

export interface ContentRevision {
  id: string;
  tenantId: string;
  eventId: string;
  sourceType: RemixSourceType;
  sourceId: string;
  sourceRevision: number;
  fields: readonly RemixField[];
  content: RemixContent;
  candidateId: string;
  appliedBy: string;
  appliedAt: string;
}

export type RemixAuditAction =
  | "candidate.generated"
  | "candidate.regenerated"
  | "candidate.stale"
  | "candidate.rejected"
  | "candidate.applied";

export interface RemixAuditEntry {
  id: string;
  tenantId: string;
  eventId: string;
  candidateId: string;
  actorId: string;
  action: RemixAuditAction;
  createdAt: string;
  details: Readonly<Record<string, string | number | boolean>>;
}

export interface RemixCandidateFilter {
  status?: ContentRemixCandidate["status"];
  sourceType?: RemixSourceType;
  sourceId?: string;
}

export interface RemixRepository {
  getCandidateById(tenantId: string, candidateId: string): Promise<ContentRemixCandidate | null>;
  getCandidate(
    tenantId: string,
    eventId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate | null>;
  listCandidates(
    tenantId: string,
    eventId: string,
    filter?: RemixCandidateFilter,
  ): Promise<readonly ContentRemixCandidate[]>;
  saveCandidate(candidate: ContentRemixCandidate, expectedVersion: number | null): Promise<void>;
  appendAudit(entry: RemixAuditEntry): Promise<void>;
  listAudit(tenantId: string, eventId: string): Promise<readonly RemixAuditEntry[]>;
}

export interface RemixContentGateway {
  listSessions(input: {
    tenantId: string;
    eventId: string;
    filter?: RemixRecordFilter;
  }): Promise<readonly RemixSessionRecord[]>;
  listSpeakers(input: {
    tenantId: string;
    eventId: string;
    filter?: RemixRecordFilter;
  }): Promise<readonly RemixSpeakerRecord[]>;
  getSession(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSessionRecord | null>;
  getSpeaker(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSpeakerRecord | null>;
  applyRevision(input: {
    tenantId: string;
    eventId: string;
    sourceType: RemixSourceType;
    sourceId: string;
    expectedSourceRevision: number;
    fields: readonly RemixField[];
    content: RemixContent;
    candidateId: string;
    actorId: string;
    appliedAt: string;
  }): Promise<ContentRevision>;
}

export interface RemixClock {
  now(): Date;
}

export interface RemixIdGenerator {
  nextId(prefix: "candidate" | "audit"): string;
}

export interface RemixServiceOptions {
  clock?: RemixClock;
  idGenerator?: RemixIdGenerator;
}

export interface GenerateRemixInput {
  eventId: string;
  sourceType: RemixSourceType;
  sourceIds: readonly string[];
  fields: readonly RemixField[];
  tone: string;
  guidance?: string;
}

export interface RegenerateRemixInput {
  eventId?: string;
  candidateId: string;
  tone?: string;
  guidance?: string;
}

export interface ApplyRemixInput {
  eventId?: string;
  candidateId: string;
  expectedVersion?: number;
  /** Optional human edits. Keys must remain inside the candidate field allowlist. */
  content?: Readonly<Record<string, unknown>>;
}

export interface RejectRemixInput {
  eventId?: string;
  candidateId: string;
  reason?: string;
}
