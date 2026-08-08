import type {
  PrivateAssetGateway,
  PrivateDownloadGrant,
  PrivateUploadGrant,
  SpeakerAccessScope,
  SpeakerAsset,
  SpeakerAssetKind,
  SpeakerPortalView,
  SpeakerProfile,
  SpeakerRepository,
  SpeakerSubmission,
  SpeakerTask,
  SpeakerTaskStatus,
} from "./types";

export type SpeakerServiceErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "VERSION_CONFLICT"
  | "INVALID_TASK_TRANSITION"
  | "TASK_DEPENDENCY_INCOMPLETE"
  | "TASK_NOT_ACTIVE"
  | "UPLOAD_POLICY_VIOLATION";

export class SpeakerServiceError extends Error {
  constructor(
    readonly code: SpeakerServiceErrorCode,
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "SpeakerServiceError";
  }
}

export interface SpeakerServiceOptions {
  now?: () => Date;
  generateId?: () => string;
}

export interface IssueUploadGrantInput {
  eventId: string;
  accountId: string;
  participantId: string;
  taskId?: string;
  kind: SpeakerAssetKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface SpeakerUploadAuthorization {
  asset: SpeakerAsset;
  grant: PrivateUploadGrant;
}

const completedDependencyStatuses = new Set<SpeakerTaskStatus>(["completed", "waived"]);
const uploadGrantLifetimeMs = 5 * 60 * 1000;
const downloadGrantLifetimeMs = 2 * 60 * 1000;

const uploadPolicies: Record<
  SpeakerAssetKind,
  { maximumBytes: number; contentTypes: ReadonlySet<string>; stripMetadata: boolean }
> = {
  headshot: {
    maximumBytes: 5 * 1024 * 1024,
    contentTypes: new Set(["image/jpeg", "image/png", "image/webp"]),
    stripMetadata: true,
  },
  slides: {
    maximumBytes: 100 * 1024 * 1024,
    contentTypes: new Set([
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]),
    stripMetadata: false,
  },
  supporting_file: {
    maximumBytes: 25 * 1024 * 1024,
    contentTypes: new Set(["application/pdf", "image/jpeg", "image/png", "text/plain"]),
    stripMetadata: false,
  },
};

function notFound(): SpeakerServiceError {
  return new SpeakerServiceError("NOT_FOUND", 404, "The requested speaker resource was not found.");
}

function containsDisallowedTextControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint === 0x7f || (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a))
    );
  });
}

function stripFileNameControls(value: string): string {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 0x20 && codePoint !== 0x7f;
    })
    .join("");
}

function normalizeBiography(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (normalized.length > 5_000 || containsDisallowedTextControl(normalized)) {
    throw new SpeakerServiceError(
      "VALIDATION_ERROR",
      400,
      "The biography must be valid plain text with at most 5000 characters.",
    );
  }
  return normalized;
}

function normalizeTransitionNote(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 1_000 ||
    containsDisallowedTextControl(normalized)
  ) {
    throw new SpeakerServiceError(
      "VALIDATION_ERROR",
      400,
      "The transition note must contain at most 1000 valid plain-text characters.",
    );
  }
  return normalized;
}

function normalizeFileName(value: string): string {
  const normalized = stripFileNameControls(value.normalize("NFC").replace(/[\\/]/g, "-")).trim();
  if (normalized.length === 0 || normalized.length > 120 || normalized === ".") {
    throw new SpeakerServiceError(
      "UPLOAD_POLICY_VIOLATION",
      400,
      "The upload file name is not allowed.",
    );
  }
  return normalized;
}

function assertExpectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SpeakerServiceError(
      "VALIDATION_ERROR",
      400,
      "A non-negative expected version is required.",
    );
  }
}

function isSpeakerTransitionAllowed(task: SpeakerTask, toStatus: SpeakerTaskStatus): boolean {
  if (toStatus === "in_progress") {
    return ["not_started", "needs_changes", "overdue", "reopened"].includes(task.status);
  }
  if (toStatus === "submitted") {
    return (
      task.type !== "action" &&
      ["in_progress", "needs_changes", "overdue", "reopened"].includes(task.status)
    );
  }
  if (toStatus === "completed") {
    return (
      task.type === "action" &&
      ["not_started", "in_progress", "overdue", "reopened"].includes(task.status)
    );
  }
  return false;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export class SpeakerService {
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(
    private readonly repository: SpeakerRepository,
    private readonly assetGateway: PrivateAssetGateway,
    options: SpeakerServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
  }

  async getPortal(eventId: string, accountId: string): Promise<SpeakerPortalView> {
    const [submissions, profiles, tasks] = await Promise.all([
      this.listSubmissions(eventId, accountId),
      this.listProfiles(eventId, accountId),
      this.listTasks(eventId, accountId),
    ]);

    return {
      submissions,
      profiles,
      tasks,
      outstandingTaskCount: tasks.filter(
        (task) => task.status !== "completed" && task.status !== "waived",
      ).length,
    };
  }

  async listSubmissions(eventId: string, accountId: string): Promise<SpeakerSubmission[]> {
    const scope = await this.getScope(eventId, accountId);
    const allowedIds = new Set(scope.submissionIds);
    const submissions = await this.repository.listSubmissions(eventId, scope.submissionIds);
    return submissions.filter(
      (submission) => submission.eventId === eventId && allowedIds.has(submission.id),
    );
  }

  async listProfiles(eventId: string, accountId: string): Promise<SpeakerProfile[]> {
    const scope = await this.getScope(eventId, accountId);
    const allowedIds = new Set(scope.participantIds);
    const profiles = await this.repository.listProfiles(eventId, scope.participantIds);
    return profiles.filter(
      (profile) => profile.eventId === eventId && allowedIds.has(profile.participantId),
    );
  }

  async listTasks(eventId: string, accountId: string): Promise<SpeakerTask[]> {
    const scope = await this.getScope(eventId, accountId);
    const allowedParticipantIds = new Set(scope.participantIds);
    const tasks = (await this.repository.listTasks(eventId, scope.participantIds)).filter(
      (task) =>
        task.eventId === eventId &&
        task.owner === "speaker" &&
        allowedParticipantIds.has(task.participantId),
    );
    const submissionIds = unique(tasks.map((task) => task.submissionId));
    const submissions = await this.repository.listSubmissions(eventId, submissionIds);
    const acceptedSubmissionIds = new Set(
      submissions
        .filter((submission) => submission.eventId === eventId && submission.status === "accepted")
        .map((submission) => submission.id),
    );

    return tasks.filter((task) => acceptedSubmissionIds.has(task.submissionId));
  }

  async updateBiography(input: {
    eventId: string;
    accountId: string;
    participantId: string;
    biography: string;
    expectedVersion: number;
  }): Promise<SpeakerProfile> {
    assertExpectedVersion(input.expectedVersion);
    const scope = await this.getScope(input.eventId, input.accountId);
    this.assertParticipantAccess(scope, input.participantId);
    const profile = await this.repository.getProfile(input.eventId, input.participantId);
    if (
      !profile ||
      profile.eventId !== input.eventId ||
      profile.participantId !== input.participantId
    ) {
      throw notFound();
    }
    if (profile.version !== input.expectedVersion) {
      throw new SpeakerServiceError(
        "VERSION_CONFLICT",
        409,
        "The speaker profile has changed. Reload it before saving.",
      );
    }

    const result = await this.repository.updateBiography({
      eventId: input.eventId,
      participantId: input.participantId,
      biography: normalizeBiography(input.biography),
      expectedVersion: input.expectedVersion,
      updatedAt: this.now().toISOString(),
    });
    if (!result.ok) {
      if (result.reason === "version_conflict") {
        throw new SpeakerServiceError(
          "VERSION_CONFLICT",
          409,
          "The speaker profile has changed. Reload it before saving.",
        );
      }
      throw notFound();
    }
    return result.value;
  }

  async transitionTask(input: {
    eventId: string;
    accountId: string;
    taskId: string;
    toStatus: SpeakerTaskStatus;
    expectedVersion: number;
    note?: string;
  }): Promise<{ task: SpeakerTask; transitionId: string }> {
    assertExpectedVersion(input.expectedVersion);
    const scope = await this.getScope(input.eventId, input.accountId);
    const task = await this.repository.getTask(input.eventId, input.taskId);
    if (
      !task ||
      task.eventId !== input.eventId ||
      task.owner !== "speaker" ||
      !scope.participantIds.includes(task.participantId)
    ) {
      throw notFound();
    }
    if (task.version !== input.expectedVersion) {
      throw new SpeakerServiceError(
        "VERSION_CONFLICT",
        409,
        "The speaker task has changed. Reload it before saving.",
      );
    }

    await this.assertTaskIsActive(task);
    await this.assertDependenciesComplete(task);
    if (!isSpeakerTransitionAllowed(task, input.toStatus)) {
      throw new SpeakerServiceError(
        "INVALID_TASK_TRANSITION",
        409,
        "This task transition is not available to the speaker.",
      );
    }

    const transitionId = this.generateId();
    const occurredAt = this.now().toISOString();
    const transitionNote = normalizeTransitionNote(input.note);
    const result = await this.repository.transitionTask({
      eventId: input.eventId,
      taskId: task.id,
      expectedVersion: input.expectedVersion,
      fromStatus: task.status,
      toStatus: input.toStatus,
      transition: {
        id: transitionId,
        eventId: input.eventId,
        taskId: task.id,
        participantId: task.participantId,
        actorAccountId: input.accountId,
        fromStatus: task.status,
        toStatus: input.toStatus,
        ...(transitionNote === undefined ? {} : { note: transitionNote }),
        occurredAt,
      },
    });
    if (!result.ok) {
      if (result.reason === "version_conflict" || result.reason === "invalid_state") {
        throw new SpeakerServiceError(
          "VERSION_CONFLICT",
          409,
          "The speaker task has changed. Reload it before saving.",
        );
      }
      throw notFound();
    }

    return { task: result.value.task, transitionId: result.value.transition.id };
  }

  async issueUploadGrant(input: IssueUploadGrantInput): Promise<SpeakerUploadAuthorization> {
    const scope = await this.getScope(input.eventId, input.accountId);
    this.assertParticipantAccess(scope, input.participantId);
    const policy = uploadPolicies[input.kind];
    if (
      !policy ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > policy.maximumBytes ||
      !policy.contentTypes.has(input.contentType)
    ) {
      throw new SpeakerServiceError(
        "UPLOAD_POLICY_VIOLATION",
        400,
        "The upload type or size is not allowed.",
      );
    }

    if (input.taskId) {
      const task = await this.repository.getTask(input.eventId, input.taskId);
      if (
        !task ||
        task.eventId !== input.eventId ||
        task.participantId !== input.participantId ||
        task.owner !== "speaker" ||
        task.type !== "upload"
      ) {
        throw notFound();
      }
      await this.assertTaskIsActive(task);
      if (
        ["submitted", "completed", "waived"].includes(task.status) ||
        (task.acceptedAssetKinds && !task.acceptedAssetKinds.includes(input.kind))
      ) {
        throw new SpeakerServiceError(
          "UPLOAD_POLICY_VIOLATION",
          400,
          "This file is not allowed for the selected speaker task.",
        );
      }
    }

    const now = this.now();
    const assetId = this.generateId();
    const fileName = normalizeFileName(input.fileName);
    const objectKey = [
      "events",
      encodeURIComponent(input.eventId),
      "participants",
      encodeURIComponent(input.participantId),
      input.kind,
      assetId,
    ].join("/");
    const asset = await this.repository.createPendingAsset({
      id: assetId,
      eventId: input.eventId,
      participantId: input.participantId,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      kind: input.kind,
      objectKey,
      fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      state: "pending_upload",
      createdAt: now.toISOString(),
    });
    const grant = await this.assetGateway.createUploadGrant({
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresAt: new Date(now.getTime() + uploadGrantLifetimeMs).toISOString(),
      private: true,
      requireMalwareScan: true,
      stripMetadata: policy.stripMetadata,
    });

    return { asset, grant };
  }

  async issueDownloadGrant(input: {
    eventId: string;
    accountId: string;
    assetId: string;
  }): Promise<PrivateDownloadGrant> {
    const scope = await this.getScope(input.eventId, input.accountId);
    const asset = await this.repository.getAsset(input.eventId, input.assetId);
    if (
      !asset ||
      asset.eventId !== input.eventId ||
      asset.state !== "ready" ||
      !scope.participantIds.includes(asset.participantId)
    ) {
      throw notFound();
    }

    const expiresAt = new Date(this.now().getTime() + downloadGrantLifetimeMs).toISOString();
    return this.assetGateway.createDownloadGrant({
      objectKey: asset.objectKey,
      fileName: asset.fileName,
      expiresAt,
    });
  }

  private async getScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    if (!eventId || !accountId) {
      throw notFound();
    }
    const scope = await this.repository.getAccessScope(eventId, accountId);
    return {
      submissionIds: unique(scope.submissionIds),
      participantIds: unique(scope.participantIds),
    };
  }

  private assertParticipantAccess(scope: SpeakerAccessScope, participantId: string): void {
    if (!scope.participantIds.includes(participantId)) {
      throw notFound();
    }
  }

  private async assertTaskIsActive(task: SpeakerTask): Promise<void> {
    const submission = await this.repository.getSubmission(task.eventId, task.submissionId);
    if (!submission || submission.eventId !== task.eventId || submission.status !== "accepted") {
      throw new SpeakerServiceError(
        "TASK_NOT_ACTIVE",
        409,
        "Speaker tasks are available only after the submission is accepted.",
      );
    }
  }

  private async assertDependenciesComplete(task: SpeakerTask): Promise<void> {
    if (task.dependencyIds.length === 0) {
      return;
    }
    const dependencies = await this.repository.getTasksByIds(task.eventId, task.dependencyIds);
    const dependencyById = new Map(dependencies.map((dependency) => [dependency.id, dependency]));
    const incomplete = task.dependencyIds.some((dependencyId) => {
      const dependency = dependencyById.get(dependencyId);
      return (
        !dependency ||
        dependency.eventId !== task.eventId ||
        !completedDependencyStatuses.has(dependency.status)
      );
    });
    if (incomplete) {
      throw new SpeakerServiceError(
        "TASK_DEPENDENCY_INCOMPLETE",
        409,
        "Complete the required earlier speaker tasks first.",
      );
    }
  }
}
