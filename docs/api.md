# Public API and webhooks

The tenant-scoped public API is mounted at `/api/v1` on the operator's API
Worker. The canonical discovery document is
`<API_URL>/api/v1/openapi.json`.

Browser traffic uses the deployed web app's same-origin `/api/*` proxy. The
proxy forwards to the API Worker without changing the API contract and is not a
second API origin.

The checked-in [`openapi/openapi.yaml`](../openapi/openapi.yaml) describes the mounted routes. The tenant-scoped public-v1 surface exposes discovery, publication-safe catalog reads, and webhook administration.

## Authentication and scopes

Send an organization-scoped API key as a bearer token:

```http
Authorization: Bearer <api-key>
```

Every tenant path contains `/organizations/{organizationId}`. The path organization must equal the API key organization. Browser/user sessions are not accepted, and a path value never grants access to another tenant.

Catalog operations require `events:read`, `sessions:read`, or `speakers:read`. Webhook operations require `webhooks:read` or `webhooks:write`. Use the smallest set required. Keep keys server-side, rotate them after operator changes, and revoke suspected keys. Responses never return API-key material or webhook signing secrets.

## Mounted public-v1 operations

The current public-v1 surface consists of:

```text
GET    /api/v1/openapi.json
GET    /api/v1/organizations/{organizationId}/events
GET    /api/v1/organizations/{organizationId}/events/{eventId}
GET    /api/v1/organizations/{organizationId}/events/{eventId}/sessions
GET    /api/v1/organizations/{organizationId}/events/{eventId}/sessions/{sessionId}
GET    /api/v1/organizations/{organizationId}/events/{eventId}/speakers
GET    /api/v1/organizations/{organizationId}/events/{eventId}/speakers/{speakerId}
GET    /api/v1/organizations/{organizationId}/webhooks
POST   /api/v1/organizations/{organizationId}/webhooks
GET    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PATCH  /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PUT    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
DELETE /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
```

Event reads expose a field allowlist. Session reads expose only accepted sessions and omit history, actor IDs, private resources, and organizer-only state. Speaker reads expose active roster entries and omit email, submission IDs, travel logistics, workflow state, and revoked entries. Collection routes use opaque cursor pagination with `limit` from 1 to 100 (default 25). Detail routes return `404 NOT_FOUND` for both missing and withheld records.

Writes for events, sessions, and speakers remain withheld. Any future writes require a durable per-resource command coordinator shared by every overlapping writer. Runtime discovery, the checked-in OpenAPI document, tests, and this guide must be updated together.

```bash
curl "https://open-sessionboard-api-production.ashleyha0317.workers.dev/api/v1/organizations/{organizationId}/events/{eventId}/sessions?limit=25" \
  -H "Authorization: Bearer <api-key>" \
  -H "Accept: application/json"
```

Public agenda, speaker, JSON, iCal, iframe, and script endpoints under `/api/public/*` and `/embed/*` are separate anonymous published-projection surfaces. They do not grant API-key access to drafts or private program records.

## Errors, tracing, and rate limits

Errors use one stable envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request body is invalid.",
    "traceId": "request-trace-id"
  }
}
```

Send `X-Request-ID` to correlate a request; otherwise the API generates a trace ID. Log the trace ID without secrets or private payloads. Clients should handle:

- `400` invalid path, query, header, or JSON body
- `401` missing authentication
- `403` cross-tenant access, browser principal, or missing scope
- `404` absent or tenant-hidden resource
- `409` state or idempotency conflict
- `412` missing or stale `If-Match`
- `429` rate limited; honor the numeric `Retry-After` header
- `503` unavailable integration or invalid runtime configuration
- `500` safe internal error

## Webhook subscriptions

Webhook administration is a separate mounted surface under `/api/v1/organizations/{organizationId}/webhooks`:

```text
GET    /api/v1/organizations/{organizationId}/webhooks
POST   /api/v1/organizations/{organizationId}/webhooks
GET    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PATCH  /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PUT    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
DELETE /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
```

Webhook routes require `webhooks:read` for GET and `webhooks:write` for POST/PATCH/PUT/DELETE. They currently do **not** accept or enforce `Idempotency-Key` or `If-Match`; updates are partial and both PATCH and PUT call the same adapter. DELETE returns `200` with `{ "data": { "deleted": true } }`. After an ambiguous create/update response, read and reconcile subscription state before retrying.

Endpoints must use HTTPS without embedded credentials. A subscription can be organization-wide or restricted to one event. The full signing secret is never returned; reads expose only its last four characters. Outbound deliveries include `webhook-id`, `webhook-timestamp`, and an HMAC-SHA256 `webhook-signature` over canonical JSON. Verify the signature before parsing or acting and deduplicate by delivery ID.

## Explicit limitations

This contract does not expose catalog writes, forms, submissions, reviews, tasks, files, publications, CRM, sponsors, exhibitors, transcription/media, insights/SbQL, OAuth management, or any other unlisted resource family. Public embeds and feeds are separate published projections and do not grant API-key access or parity with these tenant-scoped routes.
