import { conflict } from "./errors";
import type {
  EvaluationPlanScheduleState,
  EvaluationPlanScheduleSync,
  EvaluationRepository,
  EvaluationRoundScheduleState,
} from "./repository";

export const MAX_REVISION_DEPTH = 16;
const MAX_SYNCHRONIZED_ROUNDS = 200;
export const MAX_REVISION_RECONCILIATION_ROUNDS = MAX_REVISION_DEPTH * MAX_SYNCHRONIZED_ROUNDS;

export interface EvaluationPlanLineageVersion {
  readonly planId: string;
  readonly expectedVersion: number;
}

export interface RevisionScheduleSnapshot {
  readonly lineageVersions: readonly EvaluationPlanLineageVersion[];
  readonly syncs: readonly EvaluationPlanScheduleSync[];
  readonly truncated: boolean;
}

function mapPredecessorRounds(
  child: EvaluationPlanScheduleState,
  parent: EvaluationPlanScheduleState,
): readonly EvaluationRoundScheduleState[] {
  const childRoundByPredecessorId = new Map<string, EvaluationRoundScheduleState>();
  for (const round of child.rounds) {
    const sourceRoundId = round.predecessorRoundId ?? null;
    if (sourceRoundId === null) continue;
    if (childRoundByPredecessorId.has(sourceRoundId)) {
      throw conflict("Review plan revision contains duplicate round lineage.");
    }
    childRoundByPredecessorId.set(sourceRoundId, round);
  }
  return parent.rounds.map((round) => {
    const childRound = childRoundByPredecessorId.get(round.id);
    if (childRound === undefined) {
      throw conflict("Review plan revisions cannot remove a predecessor round.");
    }
    return {
      ...round,
      opensAt: childRound.opensAt ?? null,
      closesAt: childRound.closesAt ?? null,
    };
  });
}

function operationalStateChanged(
  current: EvaluationPlanScheduleState,
  updated: EvaluationPlanScheduleState,
): boolean {
  if (
    current.status !== updated.status ||
    current.closesAt !== updated.closesAt ||
    current.rounds.length !== updated.rounds.length
  ) {
    return true;
  }
  return current.rounds.some((round, index) => {
    const nextRound = updated.rounds[index];
    return (
      nextRound === undefined ||
      round.id !== nextRound.id ||
      round.revision !== nextRound.revision ||
      (round.opensAt ?? null) !== (nextRound.opensAt ?? null) ||
      (round.closesAt ?? null) !== (nextRound.closesAt ?? null)
    );
  });
}

export async function revisionScheduleSnapshot(
  repository: EvaluationRepository,
  activeRevision: EvaluationPlanScheduleState,
  updatedAt: string,
  options: {
    readonly allowOversizedPlans?: boolean;
    readonly ignoreRoundLimit?: boolean;
    readonly truncateAtRoundLimit?: boolean;
  } = {},
): Promise<RevisionScheduleSnapshot> {
  const visited = new Set<string>([activeRevision.id]);
  const lineageVersions: EvaluationPlanLineageVersion[] = [];
  const syncs: EvaluationPlanScheduleSync[] = [];
  let synchronizedRoundCount = 0;
  let child = activeRevision;

  for (let depth = 0; depth < MAX_REVISION_DEPTH; depth += 1) {
    const parentId = child.predecessorPlanId ?? null;
    if (parentId === null) return { lineageVersions, syncs, truncated: false };
    if (visited.has(parentId)) {
      throw conflict("Review plan revision lineage contains a cycle.");
    }
    const parent = await repository.getPlanScheduleState(activeRevision.tenantId, parentId);
    if (parent === null || parent.eventId !== activeRevision.eventId) {
      throw conflict("Review plan revision predecessor is unavailable.");
    }
    lineageVersions.push({ planId: parent.id, expectedVersion: parent.version });
    visited.add(parent.id);
    const scheduledParent: EvaluationPlanScheduleState = {
      ...parent,
      status: activeRevision.status,
      closesAt: child.closesAt,
      rounds: mapPredecessorRounds(child, parent),
    };
    if (operationalStateChanged(parent, scheduledParent)) {
      const updatedParent = {
        ...scheduledParent,
        version: parent.version + 1,
        updatedAt,
      };
      const nextRoundCount = synchronizedRoundCount + scheduledParent.rounds.length;
      if (nextRoundCount > MAX_REVISION_RECONCILIATION_ROUNDS) {
        throw conflict("Review plan revision reconciliation exceeds the total round limit.");
      }
      if (nextRoundCount > MAX_SYNCHRONIZED_ROUNDS && options.ignoreRoundLimit !== true) {
        if (options.truncateAtRoundLimit === true && syncs.length > 0) {
          return { lineageVersions, syncs, truncated: true };
        }
        if (
          options.truncateAtRoundLimit === true &&
          options.allowOversizedPlans === true &&
          syncs.length === 0
        ) {
          return {
            lineageVersions,
            syncs: [{ plan: updatedParent, expectedVersion: parent.version }],
            truncated: true,
          };
        }
        throw conflict("Review plan revision schedule exceeds the synchronization limit.");
      }
      synchronizedRoundCount = nextRoundCount;
      syncs.push({ plan: updatedParent, expectedVersion: parent.version });
      child = updatedParent;
    } else {
      child = scheduledParent;
    }
  }

  if (child.predecessorPlanId !== null && child.predecessorPlanId !== undefined) {
    throw conflict("Review plan revision depth exceeds the synchronization limit.");
  }
  return { lineageVersions, syncs, truncated: false };
}
