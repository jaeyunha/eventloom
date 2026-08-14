import type {
  DeliverableAsset,
  DeliverableAssetHistoryEntry,
  DeliverableComment,
  DeliverableReviewState,
  DeliverableSession,
  DeliverableSpeakerProfile,
  DeliverableTask,
} from "./api";
import type { FileFamilyProjection } from "./file-family-model";

export interface FileReviewContext {
  readonly asset: DeliverableAsset;
  readonly family: FileFamilyProjection;
  readonly versions: readonly DeliverableAsset[];
  readonly speakerLabel: string;
  readonly sessionLabel: string;
  readonly taskLabel: string;
}

export interface FileReviewDrawerProps {
  readonly open: boolean;
  readonly family: FileFamilyProjection | undefined;
  readonly asset: DeliverableAsset | undefined;
  readonly sessions: readonly DeliverableSession[];
  readonly tasks: readonly DeliverableTask[];
  readonly profiles: readonly DeliverableSpeakerProfile[];
  readonly history: readonly DeliverableAssetHistoryEntry[];
  readonly comments: readonly DeliverableComment[];
  readonly loading: boolean;
  readonly busy: boolean;
  readonly assetHistoryError: string | null;
  readonly commentsError: string | null;
  readonly reviewAvailable: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelectVersion?: (assetId: string) => void;
  readonly onDownload?: (assetId: string) => Promise<void>;
  readonly onAddComment?: (body: string, expectedVersion: number) => Promise<void>;
  readonly onReview?: (
    state: DeliverableReviewState,
    note: string | undefined,
    release: boolean,
  ) => Promise<void>;
}

export type FileReviewBodyProps = Omit<FileReviewDrawerProps, "open" | "onOpenChange">;
