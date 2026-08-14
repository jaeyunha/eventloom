---
name: eventloom
description: Read Eventloom account access and role-scoped organizer, reviewer, and speaker work through the Eventloom CLI.
user-invocable: true
allowed-tools: Bash(eventloom *)
---

# Eventloom

Eventloom coordinates event operations, reviews, and speaker deliverables. Use only the installed `eventloom` CLI and its current read-only, server-authorized command surface. Profiles represent separate authenticated accounts; roles and capabilities are resolved freshly by Eventloom for each request.

## Workflow

1. Discover profiles with `eventloom auth list --json`.
2. Discover fresh access with `eventloom access list --profile <name> --json`, or use `--all-accounts` for a broad read across stored profiles.
3. Inspect the active selection with `eventloom context show --json`. Select a context only when the user requests it and the fresh access graph permits it.
4. Run the compatible read: `eventloom organizer status`, `eventloom reviewer inbox`, or `eventloom speaker tasks`. Add explicit organization/event selectors when access is ambiguous; use `--all-contexts` only for an intentional broad read within one profile.
5. Treat authentication, authorization, incompatible-context, and workload denial as final. Report the denial and stop.

See [commands](references/commands.md) and [context and safety](references/context-safety.md).

## Hard boundaries

Never bypass the CLI with curl, browser automation, session scraping, raw HTTP, public-v1, database access, or provider tools. Never switch profiles after denial, self-update credentials, or invent a future mutation procedure. Eventloom access is fail-closed: local profile metadata and cached context are hints, never authority.
