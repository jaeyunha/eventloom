import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "../remix-workspace.module.css";

export function ScopeStatus({
  message,
  error = false,
}: Readonly<{ message: string; error?: boolean }>) {
  return (
    <main className={styles.statusPage} data-state={error ? "remix-error" : "remix-loading"}>
      <h1>Content remix</h1>
      <Card role={error ? "alert" : "status"} aria-live="polite">
        <CardHeader>
          <CardTitle>{error ? "This workspace cannot open" : "Opening content remix"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}

export function CapabilityUnavailable({ reason }: Readonly<{ reason?: string | null }>) {
  return (
    <main className={styles.statusPage} data-state="remix-unavailable">
      <Card className={styles.unavailableCard}>
        <CardHeader>
          <Badge variant="outline">Unavailable</Badge>
          <CardTitle>Content remix is unavailable</CardTitle>
          <CardDescription>
            {reason ?? "This event does not have an approved content remix capability."}
          </CardDescription>
        </CardHeader>
        <CardContent className={styles.stack}>
          <p>
            This tool creates private rewrite suggestions for session and speaker content. Nothing
            changes until an organizer reviews and applies a suggestion.
          </p>
          <Alert>
            <AlertTitle>No local suggestion was created</AlertTitle>
            <AlertDescription>
              Generation, review, application, and audit history require the authoritative service.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </main>
  );
}
