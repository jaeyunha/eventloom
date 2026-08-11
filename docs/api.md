# Public API and webhooks

The tenant-scoped public API is mounted at `/api/v1` on the production API Worker. The **live canonical discovery document** is [`https://open-sessionboard-api-production.ashleyha0317.workers.dev/api/v1/openapi.json`](https://open-sessionboard-api-production.ashleyha0317.workers.dev/api/v1/openapi.json); use that Worker origin for direct API clients (replace it only for a verified deployment).

Browser traffic may use the production web app's same-origin `/api/*` proxy at [`https://open-sessionboard-web-production.ashleyha0317.workers.dev`](https://open-sessionboard-web-production.ashleyha0317.workers.dev). The proxy forwards to the API Worker without changing the API contract and is not a second API origin. A custom `api.sessionboard.namuh.co` hostname is recommended but pending/unconfigured, so it is not canonical.

The checked-in [`openapi/openapi.yaml`](../openapi/openapi.yaml) describes the mounted routes. The tenant-scoped public-v1 surface currently exposes discovery and webhook administration only; generic program-resource routes are intentionally not mounted.

## Authentication and scopes

Send an organization-scoped API key as a bearer token:

```http
Authorization: Bearer <api-key>
```

Every webhook path contains `/organizations/{organizationId}`. The path organization must equal the API key organization. Browser/user sessions are not accepted, and a path value never grants access to another tenant.

Mounted webhook operations require `webhooks:read` or `webhooks:write`. Use the smallest set required. Keep keys server-side, rotate them after operator changes, and revoke suspected keys. Responses never return API-key material or webhook signing secrets.

## Mounted public-v1 operations

The current public-v1 surface consists of:

```text
GET    /api/v1/openapi.json
GET    /api/v1/organizations/{organizationId}/webhooks
POST   /api/v1/organizations/{organizationId}/webhooks
GET    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PATCH  /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PUT    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
DELETE /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
```

Generic `events`, `sessions`, `speakers`, and `agenda` routes are withheld. The previous adapters could expose raw Airtable or draft records, drained unbounded Airtable pages before applying collection limits, and could not provide atomic cross-request optimistic concurrency for writes. Missing program-resource routes return the standard `404 NOT_FOUND` envelope and never fall back to raw tables.

These resource families may be mounted only after they use publication-safe, field-allowlisted projections with bounded keyset reads. Any future writes additionally require a durable per-resource command coordinator shared by every overlapping writer. Runtime discovery, the checked-in OpenAPI document, tests, and this guide must be updated together when that boundary exists.

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

This contract does not expose forms, submissions, reviews, tasks, files, publications, CRM, sponsors, exhibitors, transcription/media, insights/SbQL, OAuth management, or any other unlisted resource family. Public embeds and feeds are separate published projections and do not grant API-key access or parity with these tenant-scoped routes.
