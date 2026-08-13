# Airtable staging write acceptance

Date: 2026-08-13

This acceptance used the locally configured staging Airtable PAT and the isolated
staging base. No token, MAC secret, email credential, or raw provider response is
stored in this artifact.

## Result

| Boundary | Result | Evidence |
|---|---|---|
| Record create | Pass | A unique `Application ID` record was created in `CRM Contacts`. |
| Record update | Pass | The same record was updated to version `2` with organization scope and provenance. |
| Reconciliation read | Pass | Formula-filtered read returned exactly one row with the expected record ID and version. |
| Record cleanup | Pass | Provider delete returned `deleted: true`; a subsequent filtered read returned zero rows. |
| Webhook registration | Pass | Airtable returned HTTP `200`, a provider webhook ID, MAC secret, and expiry. |
| Webhook cursor payload | Pass | Record add/update produced two payload transactions; the next cursor was `3`. |
| Webhook refresh | Pass | Refresh returned a new seven-day expiration timestamp. |
| Webhook cleanup | Pass | Provider deletion returned HTTP `200`; the webhook was absent from the subsequent list. |

## Provider permission evidence

The configured PAT grants:

- `data.records:read`;
- `data.records:write`;
- `schema.bases:read`;
- `schema.bases:write`; and
- `webhook:manage`.

The target Base reports the authenticated user permission level as `create` (Creator).
The live acceptance therefore exercised the same provider permissions required by the
optional organization adapter.

No notification URL was supplied for this provider-only acceptance. Airtable still
generated durable cursor payloads, allowing the cursor-consumption contract to be
verified without exposing a local callback endpoint to the public internet. MAC
issuance and local MAC-verification behavior are covered separately by the deterministic
API tests.

## Cleanup

- Matching staging acceptance records after cleanup: `0`
- Provider webhooks remaining after cleanup: `0`
- Local temporary raw responses: kept outside the repository under `/tmp` only
- Secrets written to evidence: `0`
