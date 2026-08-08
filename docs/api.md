# Public API and webhooks

The Hono Worker exposes a tenant-scoped REST API under `/api/v1`. Use the checked-in [`openapi/openapi.yaml`](../openapi/openapi.yaml) for detailed request/response semantics and client generation. A configured Worker also serves `/api/v1/openapi.json` to enumerate mounted resource adapters. That runtime discovery document omits the `/api/v1` mount from its path keys, so prepend `/api/v1` when interpreting them and do not use it for client generation.

## Authentication and tenant scope

Present an organization-scoped API key as a bearer token:

```http
Authorization: Bearer <api-key>
```

Every protected route includes `/organizations/{organizationId}`. The path organization must match the key's organization. A browser/user session is not accepted in place of a scoped API key.

The product contract reserves these scopes:

```text
events:read          events:write
forms:read           forms:write
submissions:read     submissions:write
participants:read    participants:write
reviews:read         reviews:write
tasks:read           tasks:write
agenda:read          agenda:write
files:read           files:write
publications:read    publications:write
integrations:read    integrations:write
webhooks:read        webhooks:write
```

A deployment exposes only scopes recognized by its mounted authenticator, key issuer, and resource adapters. Use the live admin key form and adapter configuration as the availability source; do not assume a reserved scope is enabled.

Issue the smallest set needed, keep keys server-side, rotate them on operator changes, and revoke suspected keys. API responses and admin status surfaces must never return key material or provider secrets.

## Resource routes

Enabled resource families use a common shape:

```text
GET   /api/v1/organizations/{organizationId}/{resource}
POST  /api/v1/organizations/{organizationId}/{resource}
GET   /api/v1/organizations/{organizationId}/{resource}/{id}
PATCH /api/v1/organizations/{organizationId}/{resource}/{id}
PUT   /api/v1/organizations/{organizationId}/{resource}/{id}
```

The intended contract covers events, forms/fields, submissions, participants/speakers, review plans/rubrics/reviews, tasks, agenda drafts/revisions/rules, rooms/tracks/tags/formats/statuses, files, embeds, publications, and integration status. Use the runtime document only to discover mounted resource path keys, interpreted relative to `/api/v1`; do not assume that every adapter is enabled.

Stable application IDs appear in routes and responses. Airtable record IDs are internal and are never API identifiers.

## Pagination, sort, and filters

Collections use cursor pagination:

```bash
curl --fail-with-body \
  -H 'Authorization: Bearer <api-key>' \
  'https://<api-host>/api/v1/organizations/<organization-id>/submissions?limit=25&sort=updatedAt&direction=desc&filter.status=accepted'
```

A page response is:

```json
{
  "data": [{ "id": "sub_...", "version": 3 }],
  "page": { "nextCursor": "<opaque-cursor-or-null>", "hasMore": true }
}
```

Treat `nextCursor` as opaque. It is bound to the tenant, resource, sort, direction, and filters. Changing any of those inputs requires starting without a cursor. Limits range from 1 to 100 and default to 25. Supported sort/filter fields are resource-specific.

## Idempotent resource writes

Generic resource `POST`, `PATCH`, and `PUT` operations require an `Idempotency-Key` between 8 and 128 characters:

```bash
curl --fail-with-body \
  -X POST \
  -H 'Authorization: Bearer <api-key>' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: submission-import-0001' \
  --data '{"title":"A durable session"}' \
  'https://<api-host>/api/v1/organizations/<organization-id>/submissions'
```

Retry the exact same mutation with the same key. Within one tenant/resource/action (and item ID for updates), the server returns the original result without running the mutation twice; reusing that scoped key with a different body returns `409 IDEMPOTENCY_CONFLICT`. Keys may be independently scoped across resources and item IDs, but clients should still generate a fresh globally unique key for each intended mutation.

Webhook-subscription administration does not accept `Idempotency-Key`. After an ambiguous network result, read and reconcile subscription state before retrying; never assume a repeated create was deduplicated.

## Optimistic concurrency

`PATCH` and `PUT` require the version last read from the resource:

```bash
curl --fail-with-body \
  -X PATCH \
  -H 'Authorization: Bearer <api-key>' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: submission-update-0001' \
  -H 'If-Match: "3"' \
  --data '{"title":"A durable session, revised"}' \
  'https://<api-host>/api/v1/organizations/<organization-id>/submissions/<submission-id>'
```

A missing or stale version returns `412 PRECONDITION_FAILED`. Read the latest record, reconcile the intended change, and retry with a new idempotency key. Do not blind-retry a stale write.

## Errors and request tracing

Errors have one safe envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request body is invalid.",
    "traceId": "98dd6d63-68ca-44a9-a463-69c720f228fd",
    "details": []
  }
}
```

Send a UUID `X-Request-ID` to correlate a request; otherwise the Worker creates one. The response echoes the accepted/generated ID in `X-Request-ID`. Log the trace ID, not secrets or full private payloads.

Clients must handle:

- `400` invalid path/query/header/body
- `401` missing or invalid authentication
- `403` cross-tenant access, browser principal, or missing scope
- `404` absent or tenant-hidden resource
- `409` state/idempotency conflict
- `412` missing or stale optimistic-concurrency version
- `429` rate limit; honor `Retry-After`
- `503` unavailable integration or invalid runtime configuration
- `500` safe internal error

## Webhook subscriptions

Webhook administration uses dedicated routes and `webhooks:read`/`webhooks:write`:

```text
GET    /api/v1/organizations/{organizationId}/webhooks
POST   /api/v1/organizations/{organizationId}/webhooks
GET    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PATCH  /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
PUT    /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
DELETE /api/v1/organizations/{organizationId}/webhooks/{subscriptionId}
```

Endpoints must be HTTPS and cannot contain embedded credentials. A subscription may be organization-wide or restricted to one event. Supply a signing secret of at least 32 characters or let the repository generate one. The complete secret is never returned; reads expose only its last four characters. Store the full secret in the receiving service's secret manager and rotate it by updating the subscription.

Each outbound request includes:

```text
webhook-id: <delivery-id>
webhook-timestamp: <unix-seconds>
webhook-signature: v1,<base64-hmac>
```

The signed message is:

```text
<webhook-id>.<webhook-timestamp>.<canonical-json-body>
```

where the signature is HMAC-SHA256 with the subscription secret. Canonical JSON sorts every object's keys lexicographically. Verify the signature against the raw/canonical bytes before parsing or acting, compare in constant time, enforce a timestamp replay window, and deduplicate by `webhook-id`. Return any 2xx response only after safely accepting the event. Delivery retries reuse the delivery identity.

Webhook bodies contain the organization ID, event type, occurrence time, optional event/resource coordinates, and event data. Subscribers must still authorize the event against their configured tenant; never trust a body organization without a valid signature.

## Public projections are different

Speaker galleries, agenda embeds, JSON feeds, and iCal feeds expose only an immutable published revision and approved public fields. They do not accept API keys and never expose draft schedules, evaluator notes, email addresses, task status, private files, or unapproved profiles/sessions. Do not use public feeds as a substitute for authenticated API access.
