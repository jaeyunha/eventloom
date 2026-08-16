import { Eye, RefreshCw } from "lucide-react";
import Image from "next/image";
import { StatusBadge } from "@/components/workspace";
import { Button } from "../../components/ui/button";
import { ORGANIZER_HEADSHOT_ACCEPTED_TYPES, type SpeakerAsset } from "./api";
import { organizerHeadshotPreviewPath } from "./speaker-headshot-logic";
import { FormMessage } from "./speaker-invitations";
import { assetSize, dateLabel, statusLabel } from "./speaker-roster-logic";
import styles from "./speaker-workspace.module.css";

export function SpeakerStatusBadge({ status }: Readonly<{ status: string }>) {
  const tone =
    status === "declined" || status === "revoked"
      ? "danger"
      : status === "confirmed" || status === "accepted"
        ? "success"
        : status === "invited"
          ? "info"
          : "neutral";
  return <StatusBadge tone={tone}>{statusLabel(status)}</StatusBadge>;
}
export interface SpeakerAssetDownloadProps {
  readonly asset: SpeakerAsset;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onRequest: (asset: SpeakerAsset) => Promise<string | null>;
}

export function SpeakerAssetDownload({
  asset,
  busy,
  disabled,
  error,
  onRequest,
}: SpeakerAssetDownloadProps) {
  if (asset.status !== "ready") {
    return <span className={styles.muted}>Download is not available for this asset.</span>;
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={async () => {
          const downloadUrl = await onRequest(asset);
          if (downloadUrl !== null && typeof window !== "undefined") {
            window.location.assign(downloadUrl);
          }
        }}
        disabled={disabled}
        aria-busy={busy}
        aria-label={`Download ${asset.fileName}`}
      >
        <Eye data-icon="inline-start" />
        {busy ? "Preparing download…" : "Download / view"}
      </Button>
      {error ? <FormMessage message={error} error /> : null}
    </>
  );
}
export function SpeakerAssetMetadata({ asset }: Readonly<{ asset: SpeakerAsset }>) {
  return (
    <span className={styles.muted}>
      {asset.contentType} · {assetSize(asset.byteSize)} · {statusLabel(asset.status)} · uploaded{" "}
      {dateLabel(asset.uploadedAt)}
    </span>
  );
}
export interface SpeakerHeadshotProps {
  readonly speakerName: string;
  readonly asset: SpeakerAsset | null;
  readonly imageUrl: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly revision: number;
  readonly onRetry?: () => void;
  readonly onImageError?: () => void;
}

export function SpeakerHeadshot({
  speakerName,
  asset,
  imageUrl,
  loading,
  error,
  revision,
  onRetry,
  onImageError,
}: SpeakerHeadshotProps) {
  const label = `${speakerName} headshot`;
  const safeImageUrl = imageUrl === null ? null : organizerHeadshotPreviewPath(imageUrl);
  const isReadyImage =
    asset !== null &&
    asset.status === "ready" &&
    safeImageUrl !== null &&
    ORGANIZER_HEADSHOT_ACCEPTED_TYPES.includes(
      asset.contentType.trim().toLowerCase() as (typeof ORGANIZER_HEADSHOT_ACCEPTED_TYPES)[number],
    );
  return (
    <div className={styles.headshot} role="img" aria-label={label}>
      {isReadyImage ? (
        <Image
          key={`${asset.assetId}:${revision}`}
          src={safeImageUrl}
          alt={`${speakerName} headshot`}
          width={640}
          height={360}
          unoptimized
          className={styles.headshotImage}
          onError={onImageError}
        />
      ) : (
        <div className={styles.headshotFallback}>
          <strong>
            {loading
              ? "Loading headshot…"
              : error
                ? "Headshot unavailable"
                : asset === null
                  ? "No headshot uploaded"
                  : asset.status !== "ready"
                    ? "Headshot is not ready"
                    : "Headshot preview unavailable"}
          </strong>
          <span className={styles.muted}>
            {error ??
              (loading
                ? "Requesting a secure preview from the organizer API."
                : "A secure preview is not available for this speaker.")}
          </span>
          {onRetry && !loading && (error !== null || asset !== null) ? (
            <Button variant="outline" size="sm" type="button" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              Retry headshot preview
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
