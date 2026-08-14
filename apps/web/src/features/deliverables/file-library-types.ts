import type {
  DeliverableAsset,
  DeliverableExportDownload,
  DeliverableExportInput,
  DeliverableSession,
  DeliverableSpeakerProfile,
  DeliverableTask,
} from "./api";
import type { FileFamilyProjection } from "./file-family-model";

export interface FileLibraryFilters {
  readonly query: string;
  readonly participantId: string;
  readonly sessionId: string;
  readonly reviewState: string;
}

export interface FileLibraryRow {
  readonly family: FileFamilyProjection;
  readonly asset: DeliverableAsset;
  readonly participantId: string;
  readonly speakerLabel: string;
  readonly sessionId: string;
  readonly sessionLabel: string;
  readonly taskLabel: string;
  readonly reviewValue: string;
  readonly reviewLabel: string;
}

export interface FileLibraryProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly families: readonly FileFamilyProjection[];
  readonly sessions: readonly DeliverableSession[];
  readonly tasks: readonly DeliverableTask[];
  readonly profiles: readonly DeliverableSpeakerProfile[];
  readonly activeFamilyId?: string | null;
  readonly busy: boolean;
  readonly loadFailed: boolean;
  readonly onInspectAsset?: (assetId: string) => void;
  readonly onExport?: (
    input: DeliverableExportInput,
  ) => Promise<DeliverableExportDownload | undefined>;
  readonly onStartDownload?: (download: DeliverableExportDownload) => void;
  readonly onRetry?: () => void;
}
