# Context and safety

## Resolution

A profile selects an authenticated account and fixed API origin. Fresh Eventloom responses determine organization, event, roles, and capabilities. Saved context is only a convenience and is rejected if access was revoked. Explicit selectors narrow a read; they never create authority.

Broad reads are deliberate:

- `access list --all-accounts` reads access for all stored profiles and labels partial failures.
- Role commands with `--all-contexts` read all compatible contexts for the selected profile.
- Never silently fall back to another context or account.

## Fail closed

On authentication failure, authorization denial, incompatible context, ambiguous selection, stale access, or workload denial: stop and report it. Do not switch profiles after denial. Do not retry through a legacy endpoint or another tool.

The following are forbidden:

- curl, raw HTTP, public-v1, or arbitrary API calls;
- browser automation or browser session scraping;
- database access or provider tools;
- credential self-update, cookie extraction, or origin replacement;
- any future mutation procedure, including review submission, decisions, reminders, sends, agenda publication, edits, or deletes.

Never infer access from profile files, identifiers, role names, prior output, or user claims. Only the current CLI response is authoritative.
