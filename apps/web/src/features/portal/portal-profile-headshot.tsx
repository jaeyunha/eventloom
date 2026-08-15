import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../../components/ui";
import styles from "./portal-profile.module.css";
import { formatPortalDate, formatPortalFileSize, portalAssetStateLabel } from "./portal-ui";
import type { PortalAsset, PortalDownloadGrant, PortalProfile } from "./types";

interface ProfileHeadshotCardProps {
  readonly profile: PortalProfile;
  readonly headshot: PortalAsset | undefined;
  readonly grant: PortalDownloadGrant | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly canRead: boolean;
  readonly taskHref: string | null;
  readonly downloadAsset: (assetId: string) => Promise<PortalDownloadGrant | null>;
}

export function ProfileHeadshotCard({
  profile,
  headshot,
  grant,
  loading,
  error,
  canRead,
  taskHref,
  downloadAsset,
}: ProfileHeadshotCardProps) {
  const [downloading, setDownloading] = useState(false);
  const initials = profile.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");
  const status = !profile.headshotAssetId
    ? "Not uploaded"
    : headshot
      ? portalAssetStateLabel(headshot.state)
      : "Metadata unavailable";

  async function download() {
    if (headshot?.state !== "ready") return;
    setDownloading(true);
    try {
      const freshGrant = await downloadAsset(headshot.id);
      if (freshGrant) window.location.assign(freshGrant.url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <aside aria-labelledby="profile-preview-heading">
      <Card>
        <CardHeader>
          <CardTitle id="profile-preview-heading">Program preview</CardTitle>
        </CardHeader>
        <CardContent className={styles.previewContent}>
          <div className={styles.identity}>
            {grant && headshot?.state === "ready" ? (
              <Image
                className={styles.avatar}
                src={grant.url}
                alt={`${profile.displayName} headshot`}
                width={72}
                height={72}
                unoptimized
              />
            ) : (
              <span className={styles.avatar} aria-hidden="true">
                {initials}
              </span>
            )}
            <div>
              <h2>{profile.displayName}</h2>
              <p>
                {[profile.jobTitle?.trim(), profile.company?.trim()].filter(Boolean).join(" · ") ||
                  "Event speaker"}
              </p>
            </div>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>Headshot status</dt>
              <dd>{status}</dd>
            </div>
            {headshot ? (
              <>
                <div>
                  <dt>File</dt>
                  <dd>{headshot.fileName}</dd>
                </div>
                <div>
                  <dt>Format and size</dt>
                  <dd>
                    {headshot.contentType} · {formatPortalFileSize(headshot.sizeBytes)}
                  </dd>
                </div>
                {headshot.version === undefined ? null : (
                  <div>
                    <dt>Version</dt>
                    <dd>{headshot.version}</dd>
                  </div>
                )}
                <div>
                  <dt>Asset updated</dt>
                  <dd>
                    {formatPortalDate(headshot.finalizedAt ?? headshot.createdAt) ?? "Recently"}
                  </dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Profile updated</dt>
              <dd>{formatPortalDate(profile.updatedAt) ?? "Recently"}</dd>
            </div>
          </dl>
          {headshot?.state === "rejected" && headshot.rejectionReason ? (
            <p className={styles.errorText} role="status">
              {headshot.rejectionReason}
            </p>
          ) : null}
          {loading ? (
            <p className={styles.statusText} role="status">
              Preparing secure headshot access…
            </p>
          ) : null}
          {error ? (
            <p className={styles.errorText} role="status">
              {error}
            </p>
          ) : null}
          <div className={styles.previewActions}>
            {headshot?.state === "ready" && canRead ? (
              <Button
                type="button"
                variant="outline"
                disabled={downloading}
                onClick={() => void download()}
              >
                {downloading ? "Preparing download…" : "Download headshot"}
              </Button>
            ) : null}
            {taskHref ? (
              <Button asChild variant="outline">
                <Link href={taskHref}>Manage headshot task</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
