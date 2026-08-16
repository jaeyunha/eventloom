import { FilePenLine } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, WorkspaceSurface } from "@/components/workspace/workspace-ui";
import type { RemixCandidate, RemixSourceRecord } from "../api";
import styles from "../remix-workspace.module.css";
import { RemixCandidateDetail } from "./remix-candidate-detail";
import { candidateSource, candidateStatusLabel, sourceLabel } from "./remix-workspace-model";

type CandidateFilter = RemixCandidate["status"] | "all";

interface RemixReviewProps {
  readonly candidates: readonly RemixCandidate[];
  readonly records: readonly RemixSourceRecord[];
  readonly candidateFilter: CandidateFilter;
  readonly onCandidateFilterChange: (value: CandidateFilter) => void;
  readonly selectedCandidateId: string | null;
  readonly onSelectCandidate: (candidateId: string) => void;
  readonly selectedCandidate: RemixCandidate | undefined;
  readonly staleCandidate: boolean;
  readonly draftContent: Readonly<Record<string, string>>;
  readonly onDraftChange: (field: string, value: string) => void;
  readonly busyAction: string | null;
  readonly loading: boolean;
  readonly apiAvailable: boolean;
  readonly onRegenerate: () => void;
  readonly onReject: () => void;
  readonly humanConfirmed: boolean;
  readonly onHumanConfirmedChange: (confirmed: boolean) => void;
  readonly canApply: boolean;
  readonly onOpenApply: () => void;
  readonly applyButtonRef: React.RefObject<HTMLButtonElement | null>;
}

function parseCandidateFilter(value: string): CandidateFilter {
  if (value === "pending" || value === "applied" || value === "rejected" || value === "stale") {
    return value;
  }
  return "all";
}

function candidateTone(candidate: RemixCandidate) {
  if (candidate.status === "applied") return "success" as const;
  if (candidate.status === "rejected") return "danger" as const;
  if (candidate.status === "stale") return "warning" as const;
  return "info" as const;
}

export function RemixReview({
  candidates,
  records,
  candidateFilter,
  onCandidateFilterChange,
  selectedCandidateId,
  onSelectCandidate,
  selectedCandidate,
  staleCandidate,
  draftContent,
  onDraftChange,
  busyAction,
  loading,
  apiAvailable,
  onRegenerate,
  onReject,
  humanConfirmed,
  onHumanConfirmedChange,
  canApply,
  onOpenApply,
  applyButtonRef,
}: RemixReviewProps) {
  const selectedSource = candidateSource(selectedCandidate, records);

  return (
    <WorkspaceSurface
      data-section="remix-review"
      title="Review suggestions"
      description="Compare each private suggestion with its source, edit it, then apply or reject it."
      actions={
        <div className={styles.candidateFilter}>
          <Label className={styles.srOnly} htmlFor="remix-candidate-filter">
            Filter suggestions
          </Label>
          <Select
            value={candidateFilter}
            onValueChange={(value) => onCandidateFilterChange(parseCandidateFilter(value))}
          >
            <SelectTrigger id="remix-candidate-filter" aria-label="Filter suggestions">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All suggestions</SelectItem>
                <SelectItem value="pending">Ready for review</SelectItem>
                <SelectItem value="stale">Source changed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {candidates.length === 0 ? (
        <Empty className={styles.reviewEmpty}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilePenLine />
            </EmptyMedia>
            <EmptyTitle>No suggestions to review</EmptyTitle>
            <EmptyDescription>
              Select content and generate a suggestion above. It will appear here before anything
              changes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className={styles.reviewGrid}>
          <aside className={styles.candidateQueue} aria-label="Suggestion queue">
            <ul>
              {candidates.map((candidate) => {
                const source = candidateSource(candidate, records);
                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      className={styles.candidateRow}
                      data-selected={selectedCandidateId === candidate.id ? "true" : undefined}
                      aria-pressed={selectedCandidateId === candidate.id}
                      onClick={() => onSelectCandidate(candidate.id)}
                    >
                      <span>
                        <strong>{sourceLabel(source)}</strong>
                        <small>Generation {candidate.generation}</small>
                      </span>
                      <StatusBadge tone={candidateTone(candidate)} dot={false}>
                        {candidateStatusLabel(candidate)}
                      </StatusBadge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          {selectedCandidate ? (
            <RemixCandidateDetail
              candidate={selectedCandidate}
              source={selectedSource}
              stale={staleCandidate}
              draftContent={draftContent}
              onDraftChange={onDraftChange}
              busyAction={busyAction}
              loading={loading}
              apiAvailable={apiAvailable}
              onRegenerate={onRegenerate}
              onReject={onReject}
              humanConfirmed={humanConfirmed}
              onHumanConfirmedChange={onHumanConfirmedChange}
              canApply={canApply}
              onOpenApply={onOpenApply}
              applyButtonRef={applyButtonRef}
            />
          ) : null}
        </div>
      )}
    </WorkspaceSurface>
  );
}
