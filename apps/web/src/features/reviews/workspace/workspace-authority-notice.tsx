"use client";

import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import styles from ".././review-workspace.module.css";

export function AuthorityNotice() {
  return (
    <Alert className={styles.authorityNotice} role="note">
      <AlertTitle>Human approval required.</AlertTitle>
      <AlertDescription>
        AI suggestions remain advisory; an authorized human confirms every score and outcome.
      </AlertDescription>
    </Alert>
  );
}
