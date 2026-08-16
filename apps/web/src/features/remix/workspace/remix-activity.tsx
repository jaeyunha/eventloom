import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkspaceSurface } from "@/components/workspace/workspace-ui";
import type { RemixAuditEntry } from "../api";
import styles from "../remix-workspace.module.css";
import { auditActionLabel, formatTimestamp } from "./remix-workspace-model";

export function RemixActivity({ audit }: Readonly<{ audit: readonly RemixAuditEntry[] }>) {
  return (
    <WorkspaceSurface
      data-section="remix-activity"
      title="Activity & technical details"
      description="Server-recorded generation, rejection, and application history."
    >
      <Collapsible>
        <div className={styles.activityHeader}>
          <span>
            {audit.length} audit {audit.length === 1 ? "entry" : "entries"}
          </span>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              Show activity
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className={styles.activityContent}>
          {audit.length === 0 ? (
            <p className={styles.muted}>Activity appears after a suggestion is generated.</p>
          ) : (
            <Table>
              <TableCaption>Authoritative content remix audit events</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{auditActionLabel(entry.action)}</TableCell>
                    <TableCell>{entry.candidateId}</TableCell>
                    <TableCell>{formatTimestamp(entry.createdAt)}</TableCell>
                    <TableCell>{entry.actorId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CollapsibleContent>
      </Collapsible>
    </WorkspaceSurface>
  );
}
