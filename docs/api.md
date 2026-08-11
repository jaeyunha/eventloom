# Public API and webhooks

The tenant-scoped public API is mounted at `/api/v1` on the production API Worker. The **live canonical discovery document** is [`https://open-sessionboard-api-production.ashleyha0317.workers.dev/api/v1/openapi.json`](https://open-sessionboard-api-production.ashleyha0317.workers.dev/api/v1/openapi.json); use that Worker origin for direct API clients (replace it only for a verified deployment).

Browser traffic may use the production web app's same-origin `/api/*` proxy at [`https://open-sessionboard-web-production.ashleyha0317.workers.dev`](https://open-sessionboard-web-production.ashleyha0317.workers.dev). The proxy forwards to the API Worker without changing the API contract and is not a second API origin. A custom `api.sessionboard.namuh.co` hostname is recommended but pending/unconfigured, so it is not canonical.

The checked-in [`openapi/openapi.yaml`](../openapi/openapi.yaml) is the stable client-generation contract; its public-v1 resource paths describe the same four resources and operations, while the checked-in document also includes separately mounted webhook routes and broader internal application paths that are not part of public-v1.

## Authentication and scopes

Send an organization-scoped API key as a bearer token:

```http
Authorization: Bearer <api-key>
```

Every public resource path contains `/organizations/{organizationId}`. The path organization must equal the API key organization. Browser/user sessions are not accepted, and a path value never grants access to another tenant.

Enabled scopes are:

| Surface | Read | Write |
| --- | --- | --- |
| `events` | `events:read` | `events:write` |
| `speakers` | `submissions:read` | — |
| `agenda` | `agenda:read` | — |
| `sessions` | `agenda:read` | `agenda:write` |
| webhooks | `webhooks:read` | `webhooks:write` |

Use the smallest set required. Keep keys server-side, rotate them after operator changes, and revoke suspected keys. Responses never return API-key material or webhook signing secrets.

## Existing resource operations

The currently mounted public-v1 resource families are exactly these four:

```text
GET   /api/v1/organizations/{organizationId}/events
POST  /api/v1/organizations/{organizationId}/events
GET   /api/v1/organizations/{organizationId}/events/{id}
PATCH /api/v1/organizations/{organizationId}/events/{id}

GET   /api/v1/organizations/{organizationId}/speakers
GET   /api/v1/organizations/{organizationId}/speakers/{id}

GET   /api/v1/organizations/{organizationId}/agenda
GET   /api/v1/organizations/{organizationId}/agenda/{id}

GET   /api/v1/organizations/{organizationId}/sessions
POST  /api/v1/organizations/{organizationId}/sessions
GET   /api/v1/organizations/{organizationId}/sessions/{id}
PATCH /api/v1/organizations/{organizationId}/sessions/{id}
```

Resource bodies are JSON records with stable application IDs. The `agenda` resource is a read-only published/projection view; generic agenda writes are intentionally neither mounted nor advertised. `speakers` is read-only because a generic participant write is not a safe public projection. Event and session writes use the generic adapter contract and do not replace the first-party organizer workflows or their richer validation/audit semantics.

No other CRUD families are enabled by this public-v1 surface.

## Pagination, sorting, and filters

Collection GETs use cursor pagination. `limit` is an integer from 1 through 100 (default 25); `cursor` is opaque; `direction` is `asc` or `desc` (default `asc`). A page has this shape:

```json
{
  "data": [{ "id": "...", "version": 3 }],
  "page": { "nextCursor": "c1...", "hasMore": true }
}
```

The cursor is bound to the organization, resource, sort, direction, and filters. Start a new query when any of those values changes. Allowed sort fields are:

| Resource | Allowed sorts (default first) |
| --- | --- |
| `events` | `id`, `name`, `updatedAt` (`id`) |
| `speakers` | `id`, `displayName`, `updatedAt` (`id`) |
| `agenda` | `id`, `updatedAt` (`id`) |
| `sessions` | `id`, `title`, `updatedAt` (`id`) |

Filters may be supplied as a JSON object in `filter`, or as `filter.field=value` / `filter[field]=value`. Only these resource-specific fields are documented and accepted: `events` (`status`, `slug`), `speakers` (`eventId`, `displayName`), `agenda` (`revision`), and `sessions` (`eventId`, `status`). Unsupported filter fields and unrelated query parameters are rejected with `400 VALIDATION_FAILED`; filter values are compared as strings by the adapter.

## Idempotency and concurrency

Public resource `POST` and `PATCH` mutations require an `Idempotency-Key` header containing 8–128 characters. Replaying the same key with the same method, path, and body returns the stored result. Reusing it for a different request returns `409 IDEMPOTENCY_CONFLICT`. Use a fresh key for every intended mutation.

`PATCH` updates require a header-only `If-Match` value containing the positive resource version last read (quoted or unquoted, with an optional weak `W/` prefix); a body `expectedVersion` is not a substitute. A missing, malformed, or stale version returns `412 PRECONDITION_FAILED`; reread and reconcile instead of blindly retrying. `Idempotency-Key` and `If-Match` do not apply to read-only speakers or agenda routes.

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
