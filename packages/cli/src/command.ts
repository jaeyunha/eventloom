import { dirname, join } from "node:path";
import {
  type AccessContext,
  type AccountAccess,
  type AgentWarning,
  type CliExitCode,
  type CliOutput,
  cliErrorEnvelopeSchema,
  cliExitCodes,
  cliSuccessEnvelopeSchema,
} from "@eventloom/contracts";
import packageMetadata from "../package.json";
import { AuthClient, AuthClientError, type Fetcher } from "./auth";
import { createBriefing, renderBriefingHuman } from "./briefing";
import {
  CredentialInputError,
  type CredentialReader,
  defaultCredentialReader,
} from "./credentials";
import { installSkill, type SkillAgent, type SkillInstallScope } from "./skill-installer";
import {
  type ActiveContext,
  canonicalizeOrigin,
  type ProfileMetadata,
  ProfileStore,
  type StoredProfile,
  StoreError,
  validateProfileName,
} from "./store";

const HELP = `Usage: eventloom <command> [options]

Commands:
  auth login --profile <name> --api-url <origin>
                                  Sign in with email/password from terminal or stdin
  auth logout --profile <name>   Remove a local profile and invalidate its remote session
  auth list                       List stored profiles
  access list [--profile <name> | --all-accounts]
                                  List fresh server-authoritative access contexts
  context show                    Show the active profile and freshly valid context
  context use --profile <name> (--organization <id> [--event <id>] | --event <id>)
                                  Select a freshly authorized active context
  organizer status               Read organizer action items
  reviewer inbox                 Read reviewer assignments
  speaker tasks                  Read speaker tasks
  briefing [--profile <name> | --all-accounts]
                                  Aggregate urgency-sorted work across fresh contexts
  skill install --agent codex|claude-code|all [--global|--project] [--force]
                                  Install the bundled Eventloom skill

Options:
  --json                          Emit the stable JSON envelope
  --profile <name>                Select a local profile
  --api-url <origin>              API origin for auth login only
  --organization <id>             Select an organization context
  --event <id>                    Select an event context
  --all-accounts                  Discover contexts for every stored profile
  --all-contexts                  Read every compatible context for one profile
  --agent <name>                  Install for codex, claude-code, or all
  --global                        Install below HOME (default)
  --project                       Install below the current working directory
  --force                         Replace an existing modified skill directory
  --help                          Show this help
`;

interface ParsedCommand {
  command: string[];
  json: boolean;
  help: boolean;
  profile?: string;
  apiUrl?: string;
  organization?: string;
  event?: string;
  allAccounts: boolean;
  allContexts: boolean;
  agent?: SkillAgent;
  global: boolean;
  project: boolean;
  force: boolean;
}

export interface CommandIo {
  writeStdout(value: string): void;
  writeStderr(value: string): void;
}

export interface RunCommandDependencies {
  home?: string;
  fetcher?: Fetcher;
  credentialReader?: CredentialReader;
  forcedFailure?: Exclude<CliExitCode, 0 | 2>;
  cwd?: string;
  executablePath?: string;
  skillAssetsRoot?: string;
  cliVersion?: string;
  clock?: () => Date;
  briefingConcurrency?: number;
}

type CommandErrorCode =
  | "UNEXPECTED_FAILURE"
  | "USAGE_ERROR"
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_FAILED"
  | "INCOMPATIBLE_CONTEXT"
  | "AGGREGATE_FAILURE";

class CommandError extends Error {
  constructor(
    readonly exitCode: Exclude<CliExitCode, 0>,
    readonly code: CommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

function parseArguments(argv: readonly string[]): ParsedCommand {
  const command: string[] = [];
  let json = false;
  let help = false;
  let profile: string | undefined;
  let apiUrl: string | undefined;
  let organization: string | undefined;
  let event: string | undefined;
  let allAccounts = false;
  let allContexts = false;
  let agent: SkillAgent | undefined;
  let global = false;
  let project = false;
  let force = false;

  const readValue = (index: number, option: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CommandError(cliExitCodes.usageError, "USAGE_ERROR", `${option} requires a value`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === "--json") json = true;
    else if (argument === "--help") help = true;
    else if (argument === "--all-accounts") allAccounts = true;
    else if (argument === "--all-contexts") allContexts = true;
    else if (argument === "--global") global = true;
    else if (argument === "--project") project = true;
    else if (argument === "--force") force = true;
    else if (argument === "--agent") {
      const value = readValue(index, argument);
      if (value !== "codex" && value !== "claude-code" && value !== "all") {
        throw new CommandError(
          cliExitCodes.usageError,
          "USAGE_ERROR",
          "--agent must be codex, claude-code, or all",
        );
      }
      agent = value;
      index += 1;
    } else if (argument === "--profile") {
      profile = readValue(index, argument);
      index += 1;
    } else if (argument === "--api-url") {
      apiUrl = readValue(index, argument);
      index += 1;
    } else if (argument === "--organization") {
      organization = readValue(index, argument);
      index += 1;
    } else if (argument === "--event") {
      event = readValue(index, argument);
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new CommandError(cliExitCodes.usageError, "USAGE_ERROR", `Unknown option: ${argument}`);
    } else command.push(argument);
  }

  return {
    command,
    json,
    help,
    ...(profile === undefined ? {} : { profile }),
    ...(apiUrl === undefined ? {} : { apiUrl }),
    ...(organization === undefined ? {} : { organization }),
    ...(event === undefined ? {} : { event }),
    allAccounts,
    allContexts,
    ...(agent === undefined ? {} : { agent }),
    global,
    project,
    force,
  };
}

function assertAllowedOptions(parsed: ParsedCommand, allowed: ReadonlySet<string>): void {
  const present = [
    ["json", parsed.json],
    ["profile", parsed.profile !== undefined],
    ["apiUrl", parsed.apiUrl !== undefined],
    ["organization", parsed.organization !== undefined],
    ["event", parsed.event !== undefined],
    ["allAccounts", parsed.allAccounts],
    ["allContexts", parsed.allContexts],
    ["agent", parsed.agent !== undefined],
    ["global", parsed.global],
    ["project", parsed.project],
    ["force", parsed.force],
  ] as const;
  for (const [name, used] of present) {
    if (used && !allowed.has(name)) {
      const option =
        name === "apiUrl"
          ? "api-url"
          : name === "allAccounts"
            ? "all-accounts"
            : name === "allContexts"
              ? "all-contexts"
              : name;
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        `Option --${option} is not valid for this command`,
      );
    }
  }
}

function outputText(output: CliOutput): string {
  switch (output.kind) {
    case "profiles":
      if (output.profiles.length === 0) return "No profiles configured.\n";
      return `${output.profiles.map((profile) => `${profile.name}\t${profile.account.email}\t${profile.origin}`).join("\n")}\n`;
    case "access":
      if (output.accounts.length === 0) return "No access contexts found.\n";
      return `${output.accounts
        .flatMap((account) =>
          account.contexts.map((context) => {
            const event = context.scope === "event" ? `\t${context.event.id}` : "";
            return `${account.profile.name}\t${context.organization.id}${event}\t${context.roles.join(",")}`;
          }),
        )
        .join("\n")}\n`;
    case "skillInstall":
      return `${output.installations.map((item) => `${item.agent}\t${item.destination}`).join("\n")}\n`;
    case "organizerStatus":
      return `${output.status.organizations.flatMap((entry) => entry.actionItems.map((item) => `${entry.organization.id}\t${item.id}\t${item.title}`)).join("\n")}\n`;
    case "reviewerInbox":
      return `${output.inbox.assignments.map((item) => `${item.organization.id}\t${item.event.id}\t${item.assignmentId}\t${item.title}`).join("\n")}\n`;
    case "speakerTasks":
      return `${output.tasks.tasks.map((item) => `${item.organization.id}\t${item.event.id}\t${item.taskId}\t${item.title}`).join("\n")}\n`;
    case "briefing":
      return renderBriefingHuman(output.briefing);
    default:
      return "Success.\n";
  }
}

function writeSuccess(
  io: CommandIo,
  json: boolean,
  output: CliOutput,
  warnings: AgentWarning[] = [],
): void {
  if (json) {
    const briefing = output.kind === "briefing" ? output.briefing : undefined;
    const envelope = cliSuccessEnvelopeSchema.parse({
      success: true,
      exitCode: cliExitCodes.success,
      output,
      warnings: briefing?.warnings ?? warnings,
      requestTraceIds: briefing?.requestTraceIds ?? [],
    });
    io.writeStdout(`${JSON.stringify(envelope)}\n`);
    return;
  }
  io.writeStdout(outputText(output));
  for (const warning of warnings) io.writeStderr(`Warning: ${warning.message}\n`);
}

function writeHelp(io: CommandIo, json: boolean): void {
  if (json) {
    writeSuccess(io, true, { kind: "profiles", profiles: [] });
    return;
  }
  io.writeStdout(HELP);
}

function errorCodeForExit(
  exitCode: Exclude<CliExitCode, 0 | 2>,
): Exclude<CommandErrorCode, "USAGE_ERROR"> {
  switch (exitCode) {
    case cliExitCodes.unexpectedFailure:
      return "UNEXPECTED_FAILURE";
    case cliExitCodes.authenticationFailure:
      return "AUTHENTICATION_FAILED";
    case cliExitCodes.authorizationFailure:
      return "AUTHORIZATION_FAILED";
    case cliExitCodes.aggregateFailure:
      return "AGGREGATE_FAILURE";
  }
}

function writeError(io: CommandIo, json: boolean, error: CommandError): void {
  if (json) {
    const envelope = cliErrorEnvelopeSchema.parse({
      success: false,
      exitCode: error.exitCode,
      error: { code: error.code, message: error.message },
      requestTraceIds: [],
    });
    io.writeStderr(`${JSON.stringify(envelope)}\n`);
    return;
  }
  io.writeStderr(`${error.message}\n`);
}

function forcedCommandError(exitCode: Exclude<CliExitCode, 0 | 2>): CommandError {
  return new CommandError(exitCode, errorCodeForExit(exitCode), "Command failed");
}

function accountAccess(profile: ProfileMetadata, contexts: AccessContext[]): AccountAccess {
  return {
    profile: { name: profile.name, origin: profile.origin, account: profile.account },
    contexts: sortContexts(contexts),
  };
}

function sortContexts(contexts: AccessContext[]): AccessContext[] {
  return [...contexts].sort((left, right) => {
    const byOrganization = left.organization.id.localeCompare(right.organization.id);
    if (byOrganization !== 0) return byOrganization;
    if (left.scope !== right.scope) return left.scope === "organization" ? -1 : 1;
    if (left.scope === "organization" || right.scope === "organization") return 0;
    return left.event.id.localeCompare(right.event.id);
  });
}

function selectedContext(
  contexts: AccessContext[],
  requested: ActiveContext,
): AccessContext | undefined {
  return contexts.find(
    (context) =>
      context.organization.id === requested.organizationId &&
      (requested.eventId === undefined
        ? context.scope === "organization"
        : context.scope === "event" && context.event.id === requested.eventId),
  );
}

function resolveContext(
  contexts: AccessContext[],
  organization: string | undefined,
  event: string | undefined,
): ActiveContext {
  const matches = contexts.filter(
    (context) =>
      (organization === undefined || context.organization.id === organization) &&
      (event === undefined
        ? context.scope === "organization"
        : context.scope === "event" && context.event.id === event),
  );
  if (matches.length === 0) {
    throw new CommandError(
      cliExitCodes.authorizationFailure,
      "INCOMPATIBLE_CONTEXT",
      "The requested context is not available",
    );
  }
  if (matches.length > 1) {
    throw new CommandError(
      cliExitCodes.authorizationFailure,
      "INCOMPATIBLE_CONTEXT",
      "The requested event is ambiguous; specify --organization",
    );
  }
  const [context] = matches;
  if (context === undefined)
    throw new CommandError(
      cliExitCodes.authorizationFailure,
      "INCOMPATIBLE_CONTEXT",
      "The requested context is not available",
    );
  return {
    organizationId: context.organization.id,
    ...(context.scope === "event" ? { eventId: context.event.id } : {}),
  };
}

function authError(error: AuthClientError): CommandError {
  if (error.kind === "authentication")
    return new CommandError(
      cliExitCodes.authenticationFailure,
      "AUTHENTICATION_FAILED",
      error.message,
    );
  if (error.kind === "authorization")
    return new CommandError(
      cliExitCodes.authorizationFailure,
      "AUTHORIZATION_FAILED",
      error.message,
    );
  return new CommandError(cliExitCodes.unexpectedFailure, "UNEXPECTED_FAILURE", error.message);
}

function compatibleContexts(
  contexts: AccessContext[],
  capability: AccessContext["capabilities"][number],
  parsed: ParsedCommand,
  savedContext?: ActiveContext,
): AccessContext[] {
  const useSavedContext =
    !parsed.allContexts &&
    parsed.organization === undefined &&
    parsed.event === undefined &&
    savedContext !== undefined;
  const matches = contexts.filter(
    (context) =>
      context.capabilities.includes(capability) &&
      (useSavedContext
        ? context.organization.id === savedContext.organizationId &&
          (savedContext.eventId === undefined
            ? context.scope === "organization"
            : context.scope === "event" && context.event.id === savedContext.eventId)
        : (parsed.organization === undefined || context.organization.id === parsed.organization) &&
          (parsed.event === undefined ||
            (context.scope === "event" && context.event.id === parsed.event))),
  );
  if (matches.length === 0)
    throw new CommandError(
      cliExitCodes.authorizationFailure,
      "INCOMPATIBLE_CONTEXT",
      "The requested context is not available",
    );
  if (!parsed.allContexts && matches.length > 1)
    throw new CommandError(
      cliExitCodes.authorizationFailure,
      "INCOMPATIBLE_CONTEXT",
      "The requested context is ambiguous; specify --organization or --all-contexts",
    );
  return parsed.allContexts ? sortContexts(matches) : [matches[0] as AccessContext];
}

async function existingProfile(
  store: ProfileStore,
  name: string,
): Promise<StoredProfile | undefined> {
  try {
    return await store.readProfile(name);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

function requestedProfiles(
  profiles: ProfileMetadata[],
  config: { activeProfile?: string },
  parsed: ParsedCommand,
): ProfileMetadata[] {
  if (parsed.allAccounts) return profiles;
  const name = parsed.profile ?? config.activeProfile;
  if (name === undefined)
    throw new CommandError(
      cliExitCodes.usageError,
      "USAGE_ERROR",
      "Select a profile with --profile or configure an active profile",
    );
  const profile = profiles.find((candidate) => candidate.name === name);
  if (profile === undefined)
    throw new CommandError(
      cliExitCodes.usageError,
      "USAGE_ERROR",
      `Profile '${name}' is not configured`,
    );
  return [profile];
}

function expiredWarning(profileName: string): AgentWarning {
  return {
    code: "PROFILE_EXPIRED",
    message: `Profile '${profileName}' has an expired or invalid session`,
    profileName,
  };
}

async function loadAccess(
  profile: ProfileMetadata,
  store: ProfileStore,
  fetcher: Fetcher | undefined,
): Promise<AccountAccess> {
  const stored = await store.readProfile(profile.name);
  const access = await new AuthClient(stored.origin, fetcher).authenticatedAccess(stored);
  return accountAccess(profile, access.contexts);
}

async function accessList(
  parsed: ParsedCommand,
  store: ProfileStore,
  fetcher: Fetcher | undefined,
): Promise<{ accounts: AccountAccess[]; warnings: AgentWarning[] }> {
  const profiles = requestedProfiles(await store.listProfiles(), await store.readConfig(), parsed);
  const accounts: AccountAccess[] = [];
  const warnings: AgentWarning[] = [];
  for (const profile of profiles) {
    try {
      accounts.push(await loadAccess(profile, store, fetcher));
    } catch (error) {
      warnings.push(
        error instanceof AuthClientError && error.kind === "authentication"
          ? expiredWarning(profile.name)
          : {
              code: "CONTEXT_FAILED",
              message: `Profile '${profile.name}' could not load access contexts`,
              profileName: profile.name,
            },
      );
    }
  }
  accounts.sort((left, right) => left.profile.name.localeCompare(right.profile.name));
  if (accounts.length === 0) {
    if (!parsed.allAccounts && profiles.length === 1 && warnings[0]?.code === "PROFILE_EXPIRED") {
      throw new CommandError(
        cliExitCodes.authenticationFailure,
        "AUTHENTICATION_FAILED",
        "Profile session is expired or invalid; sign in again",
      );
    }
    throw new CommandError(
      cliExitCodes.aggregateFailure,
      "AGGREGATE_FAILURE",
      "No requested profile could load access contexts",
    );
  }
  return { accounts, warnings };
}

async function command(
  parsed: ParsedCommand,
  store: ProfileStore,
  dependencies: RunCommandDependencies,
): Promise<{ output: CliOutput; warnings?: AgentWarning[] }> {
  const [group, action, ...rest] = parsed.command;
  if (rest.length > 0)
    throw new CommandError(cliExitCodes.usageError, "USAGE_ERROR", "Too many command arguments");

  if (group === "skill" && action === "install") {
    assertAllowedOptions(parsed, new Set(["json", "agent", "global", "project", "force"]));
    if (parsed.agent === undefined) {
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "skill install requires --agent",
      );
    }
    if (parsed.global && parsed.project) {
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "--global and --project cannot be combined",
      );
    }
    const scope: SkillInstallScope = parsed.project ? "project" : "global";
    const home = dependencies.home ?? process.env.HOME;
    if (home === undefined || home.length === 0) {
      throw new CommandError(
        cliExitCodes.unexpectedFailure,
        "UNEXPECTED_FAILURE",
        "HOME is not configured",
      );
    }
    const cwd = dependencies.cwd ?? process.cwd();
    const executablePath = dependencies.executablePath ?? process.execPath;
    const assetsRoot =
      dependencies.skillAssetsRoot ?? join(dirname(executablePath), "assets", "eventloom");
    const installations = await installSkill({
      agent: parsed.agent,
      scope,
      force: parsed.force,
      home,
      cwd,
      assetsRoot,
      cliVersion: dependencies.cliVersion ?? packageMetadata.version,
    });
    return { output: { kind: "skillInstall", installations } };
  }

  if (group === "auth" && action === "list") {
    assertAllowedOptions(parsed, new Set(["json", "profile"]));
    const profiles = await store.listProfiles();
    return {
      output: {
        kind: "profiles",
        profiles:
          parsed.profile === undefined
            ? profiles
            : profiles.filter((profile) => profile.name === parsed.profile),
      },
    };
  }
  if (group === "auth" && action === "login") {
    assertAllowedOptions(parsed, new Set(["json", "profile", "apiUrl"]));
    if (parsed.profile === undefined || parsed.apiUrl === undefined)
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "auth login requires --profile and --api-url",
      );
    let origin: string;
    try {
      validateProfileName(parsed.profile);
      origin = canonicalizeOrigin(parsed.apiUrl);
    } catch (error) {
      if (error instanceof StoreError)
        throw new CommandError(cliExitCodes.usageError, "USAGE_ERROR", error.message);
      throw error;
    }
    const existing = await existingProfile(store, parsed.profile);
    if (existing !== undefined && existing.origin !== origin)
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "An existing profile cannot be moved to another API origin",
      );
    const client = new AuthClient(origin, dependencies.fetcher);
    try {
      const signedIn = await client.signIn(
        dependencies.credentialReader ?? defaultCredentialReader(),
      );
      const stored: StoredProfile = {
        name: parsed.profile,
        origin,
        account: signedIn.identity,
        session: signedIn.session,
      };
      const contexts = await client.accessContexts(stored);
      await store.saveProfile(stored);
      await store.setActiveProfile(stored.name);
      return { output: { kind: "access", accounts: [accountAccess(stored, contexts)] } };
    } catch (error) {
      if (error instanceof AuthClientError) throw authError(error);
      throw error;
    }
  }
  if (group === "auth" && action === "logout") {
    assertAllowedOptions(parsed, new Set(["json", "profile"]));
    if (parsed.profile === undefined)
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "auth logout requires --profile",
      );
    const profile = await store.readProfile(parsed.profile);
    const peers = await Promise.all(
      (await store.listProfiles())
        .filter((peer) => peer.name !== profile.name)
        .map((peer) => store.readProfile(peer.name)),
    );
    const shared = peers.some(
      (peer) =>
        peer.origin === profile.origin &&
        peer.session.name === profile.session.name &&
        peer.session.value === profile.session.value,
    );
    const warnings: AgentWarning[] = [];
    if (!shared) {
      try {
        await new AuthClient(profile.origin, dependencies.fetcher).signOut(profile);
      } catch {
        warnings.push({
          code: "REMOTE_LOGOUT_FAILED",
          message: `Remote session invalidation failed for profile '${profile.name}'`,
          profileName: profile.name,
        });
      }
    }
    await store.removeProfile(profile.name);
    return { output: { kind: "profiles", profiles: await store.listProfiles() }, warnings };
  }
  if (group === "access" && action === "list") {
    assertAllowedOptions(parsed, new Set(["json", "profile", "allAccounts"]));
    if (parsed.allAccounts && parsed.profile !== undefined)
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "--all-accounts cannot be combined with --profile",
      );
    const access = await accessList(parsed, store, dependencies.fetcher);
    return { output: { kind: "access", accounts: access.accounts }, warnings: access.warnings };
  }
  if (group === "briefing" && action === undefined) {
    assertAllowedOptions(
      parsed,
      new Set(["json", "profile", "organization", "event", "allAccounts"]),
    );
    if (parsed.allAccounts && parsed.profile !== undefined)
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "--all-accounts cannot be combined with --profile",
      );
    const config = await store.readConfig();
    const profiles = requestedProfiles(await store.listProfiles(), config, parsed);
    const inputs = await Promise.all(
      profiles.map(async (profile) => ({
        metadata: profile,
        stored: await store.readProfile(profile.name),
      })),
    );
    const savedContext =
      !parsed.allAccounts &&
      parsed.organization === undefined &&
      parsed.event === undefined &&
      profiles[0]?.name === config.activeProfile
        ? config.context
        : undefined;
    if (savedContext !== undefined) {
      const stored = inputs[0]?.stored;
      if (stored === undefined)
        throw new CommandError(
          cliExitCodes.authorizationFailure,
          "INCOMPATIBLE_CONTEXT",
          "The saved context is no longer available",
        );
      let access: Awaited<ReturnType<AuthClient["authenticatedAccess"]>>;
      try {
        access = await new AuthClient(stored.origin, dependencies.fetcher).authenticatedAccess(
          stored,
        );
      } catch (error) {
        if (error instanceof AuthClientError) throw authError(error);
        throw error;
      }
      if (selectedContext(access.contexts, savedContext) === undefined)
        throw new CommandError(
          cliExitCodes.authorizationFailure,
          "INCOMPATIBLE_CONTEXT",
          "The saved context is no longer available",
        );
    }
    const briefing = await createBriefing(
      inputs,
      {
        ...(parsed.organization !== undefined
          ? { organization: parsed.organization }
          : savedContext === undefined
            ? {}
            : { organization: savedContext.organizationId }),
        ...(parsed.event !== undefined
          ? { event: parsed.event }
          : savedContext?.eventId === undefined
            ? {}
            : { event: savedContext.eventId }),
      },
      {
        ...(dependencies.fetcher === undefined ? {} : { fetcher: dependencies.fetcher }),
        ...(dependencies.clock === undefined ? {} : { clock: dependencies.clock }),
        ...(dependencies.briefingConcurrency === undefined
          ? {}
          : { concurrency: dependencies.briefingConcurrency }),
      },
    );
    if (briefing.profiles.succeeded === 0)
      throw new CommandError(
        cliExitCodes.aggregateFailure,
        "AGGREGATE_FAILURE",
        "No requested profile could load briefing work",
      );
    return { output: { kind: "briefing", briefing }, warnings: briefing.warnings };
  }
  if (group === "context" && action === "show") {
    assertAllowedOptions(parsed, new Set(["json"]));
    const config = await store.readConfig();
    if (config.activeProfile === undefined) return { output: { kind: "profiles", profiles: [] } };
    const profile = await store.readProfile(config.activeProfile);
    let access: Awaited<ReturnType<AuthClient["authenticatedAccess"]>>;
    try {
      access = await new AuthClient(profile.origin, dependencies.fetcher).authenticatedAccess(
        profile,
      );
    } catch (error) {
      if (error instanceof AuthClientError) throw authError(error);
      throw error;
    }
    const savedContext = config.context !== undefined ? config.context : undefined;
    if (savedContext !== undefined) {
      const selected = selectedContext(access.contexts, savedContext);
      if (selected === undefined) {
        throw new CommandError(
          cliExitCodes.authorizationFailure,
          "INCOMPATIBLE_CONTEXT",
          "The saved context is no longer available",
        );
      }
      return {
        output: { kind: "access", accounts: [accountAccess(profile, [selected])] },
      };
    }
    return {
      output: { kind: "access", accounts: [accountAccess(profile, access.contexts)] },
    };
  }
  if (
    (group === "organizer" && action === "status") ||
    (group === "reviewer" && action === "inbox") ||
    (group === "speaker" && action === "tasks")
  ) {
    assertAllowedOptions(
      parsed,
      new Set(["json", "profile", "organization", "event", "allContexts"]),
    );
    const config = await store.readConfig();
    const profiles = requestedProfiles(await store.listProfiles(), config, parsed);
    const profile = await store.readProfile((profiles[0] as ProfileMetadata).name);
    const savedContext =
      parsed.organization === undefined &&
      parsed.event === undefined &&
      profile.name === config.activeProfile
        ? config.context
        : undefined;
    const client = new AuthClient(profile.origin, dependencies.fetcher);
    try {
      const access = await client.authenticatedAccess(profile);
      if (group === "organizer") {
        if (parsed.event !== undefined)
          throw new CommandError(
            cliExitCodes.usageError,
            "USAGE_ERROR",
            "organizer status does not accept --event",
          );
        const contexts = compatibleContexts(
          access.contexts,
          "organizer.overview.read",
          parsed,
          savedContext,
        );
        const organizationContexts = [
          ...new Map(contexts.map((context) => [context.organization.id, context])).values(),
        ];
        const statuses = await Promise.all(
          organizationContexts.map((context) => client.organizerStatus(profile, context)),
        );
        return {
          output: {
            kind: "organizerStatus",
            status: { organizations: statuses.flatMap((status) => status.organizations) },
          },
        };
      }
      const capability = group === "reviewer" ? "reviewer.workspace.read" : "speaker.tasks.read";
      const contexts = compatibleContexts(access.contexts, capability, parsed, savedContext).filter(
        (context): context is Extract<AccessContext, { scope: "event" }> =>
          context.scope === "event",
      );
      if (group === "reviewer") {
        const inbox = await client.reviewerInbox(profile, contexts);
        return {
          output: { kind: "reviewerInbox", inbox },
          warnings: inbox.warnings,
        };
      }
      return {
        output: { kind: "speakerTasks", tasks: await client.speakerTasks(profile, contexts) },
      };
    } catch (error) {
      if (error instanceof AuthClientError) throw authError(error);
      throw error;
    }
  }
  if (group === "context" && action === "use") {
    assertAllowedOptions(parsed, new Set(["json", "profile", "organization", "event"]));
    if (
      parsed.profile === undefined ||
      (parsed.organization === undefined && parsed.event === undefined)
    )
      throw new CommandError(
        cliExitCodes.usageError,
        "USAGE_ERROR",
        "context use requires --profile and --organization or --event",
      );
    const profile = await store.readProfile(parsed.profile);
    let access: Awaited<ReturnType<AuthClient["authenticatedAccess"]>>;
    try {
      access = await new AuthClient(profile.origin, dependencies.fetcher).authenticatedAccess(
        profile,
      );
    } catch (error) {
      if (error instanceof AuthClientError) throw authError(error);
      throw error;
    }
    const context = resolveContext(access.contexts, parsed.organization, parsed.event);
    await store.setActiveProfile(profile.name, context);
    const selected = selectedContext(access.contexts, context);
    if (selected === undefined)
      throw new CommandError(
        cliExitCodes.authorizationFailure,
        "INCOMPATIBLE_CONTEXT",
        "The requested context is not available",
      );
    return { output: { kind: "access", accounts: [accountAccess(profile, [selected])] } };
  }
  throw new CommandError(cliExitCodes.usageError, "USAGE_ERROR", `Unknown command: ${group ?? ""}`);
}

export async function runCommand(
  argv: readonly string[],
  io: CommandIo,
  dependencies: RunCommandDependencies = {},
): Promise<CliExitCode> {
  let parsed: ParsedCommand | undefined;
  try {
    parsed = parseArguments(argv);
    if (parsed.help || parsed.command.length === 0) {
      writeHelp(io, parsed.json);
      return cliExitCodes.success;
    }
    if (dependencies.forcedFailure !== undefined)
      throw forcedCommandError(dependencies.forcedFailure);
    const result = await command(parsed, new ProfileStore(dependencies.home), dependencies);
    writeSuccess(io, parsed.json, result.output, result.warnings);
    return cliExitCodes.success;
  } catch (error) {
    const commandError =
      error instanceof CommandError
        ? error
        : error instanceof CredentialInputError
          ? new CommandError(cliExitCodes.usageError, "USAGE_ERROR", error.message)
          : error instanceof StoreError
            ? new CommandError(cliExitCodes.unexpectedFailure, "UNEXPECTED_FAILURE", error.message)
            : new CommandError(
                cliExitCodes.unexpectedFailure,
                "UNEXPECTED_FAILURE",
                "Unexpected local failure",
              );
    writeError(io, parsed?.json ?? argv.includes("--json"), commandError);
    return commandError.exitCode;
  }
}
