"use client";

import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import styles from ".././review-workspace.module.css";

export function OrganizerDetailStatus({
  loading,
  error,
  onRetry,
}: Readonly<{
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}>) {
  if (!loading && error === null) return null;
  return (
    <Alert
      className={styles.authorityNotice}
      role={error === null ? "status" : "alert"}
      variant={error === null ? "default" : "destructive"}
    >
      <AlertTitle>
        {error === null ? "Loading review details" : "Review details need attention"}
      </AlertTitle>
      <AlertDescription>
        {error === null ? "The plan is usable while aggregate scores and decisions load." : error}
      </AlertDescription>
      {error === null ? null : (
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry review details
        </Button>
      )}
    </Alert>
  );
}
