"use client";

import { type FormEvent, useState } from "react";
import { Button, Input } from "@/components/ui";
import { StatusBadge, WorkspaceState, WorkspaceSurface } from "@/components/workspace";
import styles from "./portal-workspace.module.css";
import type { PortalRosterEnvelope, PortalRosterMember } from "./types";

export interface PortalRosterPanelProps {
  readonly sessionId: string;
  readonly roster: PortalRosterEnvelope | undefined;
  readonly canManage: boolean;
  readonly canInvite: boolean;
  readonly busy: boolean;
  readonly onAdd: (input: { displayName: string; email: string }) => Promise<boolean> | boolean;
  readonly onUpdate: (entry: PortalRosterMember, displayName: string) => Promise<boolean> | boolean;
  readonly onRemove: (entry: PortalRosterMember) => Promise<boolean> | boolean;
}

function roleLabel(role: PortalRosterMember["role"]): string {
  return role === "primary" ? "Primary speaker" : "Co-speaker";
}

export function PortalRosterPanel({
  sessionId,
  roster,
  canManage,
  canInvite,
  busy,
  onAdd,
  onUpdate,
  onRemove,
}: PortalRosterPanelProps) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const members = roster?.members ?? [];

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    const address = email.trim();
    if (!name || !address) {
      setError("Name and email are required.");
      return;
    }
    setError(null);
    if (await onAdd({ displayName: name, email: address })) {
      setDisplayName("");
      setEmail("");
    }
  }

  async function save(entry: PortalRosterMember) {
    const name = editingName.trim();
    if (!name) {
      setError("A co-speaker name is required.");
      return;
    }
    setError(null);
    if (await onUpdate(entry, name)) setEditingId(null);
  }

  async function remove(entry: PortalRosterMember) {
    if (entry.role === "primary" || !entry.capabilities.remove) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remove ${entry.displayName} from this session?`)
    )
      return;
    await onRemove(entry);
  }

  return (
    <WorkspaceSurface
      title="Speakers"
      description="Only the accepted session roster is shown. The primary speaker cannot be removed here."
    >
      <div className={styles.surfaceBody}>
        {members.length === 0 ? (
          <WorkspaceState
            variant="empty"
            title="No co-speakers added"
            description="Authorized speakers will appear after the event team creates the roster."
          />
        ) : (
          <ul className={styles.compactList} aria-label="Co-speaker roster">
            {members.map((entry) => (
              <li key={entry.participantId}>
                <div className={styles.row}>
                  <div>
                    {editingId === entry.participantId ? (
                      <label
                        className={styles.field}
                        htmlFor={`portal-roster-name-${sessionId}-${entry.participantId}`}
                      >
                        <span>Name</span>
                        <Input
                          id={`portal-roster-name-${sessionId}-${entry.participantId}`}
                          aria-label={`Edit ${entry.displayName}`}
                          value={editingName}
                          onChange={(event) => setEditingName(event.currentTarget.value)}
                        />
                      </label>
                    ) : (
                      <>
                        <strong>{entry.displayName}</strong>
                        <p className={styles.muted}>{entry.email ?? "Email unavailable"}</p>
                      </>
                    )}
                  </div>
                  <div className={styles.actions}>
                    <StatusBadge tone={entry.status === "active" ? "success" : "neutral"}>
                      {roleLabel(entry.role)} · {entry.status}
                    </StatusBadge>
                    {canManage && entry.role !== "primary" ? (
                      editingId === entry.participantId ? (
                        <>
                          <Button type="button" disabled={busy} onClick={() => void save(entry)}>
                            Save
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          {entry.capabilities.edit ? (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setEditingId(entry.participantId);
                                setEditingName(entry.displayName);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {entry.capabilities.remove ? (
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={busy || entry.status === "revoked"}
                              onClick={() => void remove(entry)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </>
                      )
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canInvite ? (
          <form className={styles.form} onSubmit={(event) => void add(event)}>
            <strong>Add a co-speaker</strong>
            <div className={styles.fields}>
              <label className={styles.field} htmlFor={`portal-roster-add-name-${sessionId}`}>
                <span>Name</span>
                <Input
                  id={`portal-roster-add-name-${sessionId}`}
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.currentTarget.value)}
                />
              </label>
              <label className={styles.field} htmlFor={`portal-roster-add-email-${sessionId}`}>
                <span>Email</span>
                <Input
                  id={`portal-roster-add-email-${sessionId}`}
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
              </label>
            </div>
            {error ? <p role="alert">{error}</p> : null}
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Add co-speaker"}
              </Button>
            </div>
          </form>
        ) : (
          <p className={styles.muted}>Roster changes are unavailable for this session.</p>
        )}
      </div>
    </WorkspaceSurface>
  );
}
