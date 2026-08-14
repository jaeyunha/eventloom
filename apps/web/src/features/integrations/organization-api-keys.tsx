"use client";

import { type ApiScope, apiScopes } from "@eventloom/contracts";
import { type SyntheticEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingGroup, SettingRow } from "@/components/workspace/settings-ui";
import { createIntegrationAdminApi, IntegrationAdminApiError } from "./api";
import type { ApiKeySummary, OneTimeSecret } from "./types";
import styles from "./organization-integrations-workspace.module.css";

interface OrganizationApiKeysProps {
  readonly organizationId: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof IntegrationAdminApiError) return error.message;
  return error instanceof Error ? error.message : "The API key request failed.";
}

function formatDate(value: string | null): string {
  if (value === null) return "No expiration";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

export function OrganizationApiKeys({ organizationId }: OrganizationApiKeysProps) {
  const api = useMemo(() => createIntegrationAdminApi(""), []);
  const [keys, setKeys] = useState<readonly ApiKeySummary[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<ReadonlySet<ApiScope>>(new Set());
  const [created, setCreated] = useState<OneTimeSecret | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void api
      .listApiKeys(organizationId, controller.signal)
      .then((value) => setKeys(value))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, organizationId]);

  function toggleScope(scope: ApiScope): void {
    setSelectedScopes((current) => {
      const next = new Set(current);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function createKey(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || selectedScopes.size === 0) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const expiration = String(data.get("expiresAt") ?? "").trim();

    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const result = await api.createApiKey({
        organizationId,
        label: String(data.get("label") ?? "").trim(),
        scopes: [...selectedScopes],
        expiresAt: expiration.length === 0 ? null : new Date(expiration).toISOString(),
      });
      setCreated(result);
      setKeys(await api.listApiKeys(organizationId));
      setSelectedScopes(new Set());
      form.reset();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(apiKeyId: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeApiKey(organizationId, apiKeyId);
      setKeys((current) =>
        current.map((key) =>
          key.id === apiKeyId ? { ...key, revokedAt: new Date().toISOString() } : key,
        ),
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      {error === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>API key request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {created === null ? null : (
        <Alert>
          <AlertTitle>Copy this key now</AlertTitle>
          <AlertDescription className={styles.secretNotice}>
            <code>{created.secret}</code>
            <span>This secret is shown once and cannot be recovered later.</span>
          </AlertDescription>
        </Alert>
      )}

      <SettingGroup
        title="Create API key"
        description="Keys authorize organization-scoped API access. Event selection is metadata, not an event authorization boundary."
      >
        <form className={styles.keyForm} onSubmit={(event) => void createKey(event)}>
          <Label htmlFor="organization-api-key-label">Label</Label>
          <Input id="organization-api-key-label" name="label" required />
          <Label htmlFor="organization-api-key-expires">Expiration</Label>
          <Input id="organization-api-key-expires" name="expiresAt" type="datetime-local" />
          <fieldset className={styles.scopeGrid}>
            <legend>Scopes</legend>
            {apiScopes.map((scope) => (
              <Label className={styles.scopeOption} key={scope}>
                <Checkbox
                  checked={selectedScopes.has(scope)}
                  onCheckedChange={() => toggleScope(scope)}
                />
                {scope}
              </Label>
            ))}
          </fieldset>
          <Button disabled={busy || selectedScopes.size === 0} type="submit">
            {busy ? "Creating..." : "Create key"}
          </Button>
        </form>
      </SettingGroup>

      <SettingGroup
        title="Active and revoked keys"
        description="Review organization access without exposing stored secrets."
        metadata={loading ? "Loading..." : `${keys.length} keys`}
      >
        <ul className={styles.settingRows}>
          {keys.map((key) => (
            <SettingRow
              key={key.id}
              label={key.label}
              description={`${key.scopes.join(", ")} · ${formatDate(key.expiresAt)}`}
              controls={
                key.revokedAt === null ? (
                  <Button
                    disabled={busy}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => void revokeKey(key.id)}
                  >
                    Revoke
                  </Button>
                ) : (
                  <Badge variant="outline">Revoked</Badge>
                )
              }
            />
          ))}
          {!loading && keys.length === 0 ? (
            <SettingRow
              label="No API keys"
              description="Create a key when an external system needs organization API access."
            />
          ) : null}
        </ul>
      </SettingGroup>
    </div>
  );
}
