# Current commands

## Authentication and profiles

- `eventloom auth login --profile <name> --api-url <origin>`: interactive or stdin login; credentials never belong in arguments.
- `eventloom auth logout --profile <name>`: remove one local profile and attempt remote session invalidation.
- `eventloom auth list [--profile <name>]`: list stored profiles.

## Access and context

- `eventloom access list [--profile <name> | --all-accounts]`: fetch fresh server-authoritative organization/event roles and capabilities. `--all-accounts` is the supported multi-profile broad read.
- `eventloom context show`: show the active profile and validate any saved context against fresh access.
- `eventloom context use --profile <name> (--organization <id> [--event <id>] | --event <id>)`: save one freshly authorized context. An ambiguous event requires its organization.

## Role reads

- `eventloom organizer status [--profile <name>] [--organization <id>] [--all-contexts]`
- `eventloom reviewer inbox [--profile <name>] [--organization <id>] [--event <id>] [--all-contexts]`
- `eventloom speaker tasks [--profile <name>] [--organization <id>] [--event <id>] [--all-contexts]`

These are read-only. `--all-contexts` is a broad read across every compatible fresh context for one profile. Without it, multiple compatible contexts fail as ambiguous rather than choosing silently.

## Skill installation

- `eventloom skill install --agent codex|claude-code|all [--global|--project] [--force]`

Use `--json` when machine-readable output is needed. Success is exit 0; usage 2; authentication 3; authorization/incompatible context 4; no successful aggregate profile 5; unexpected local/transport/server failure 1.
