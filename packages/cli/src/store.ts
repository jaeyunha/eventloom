import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { chmod, lstat, mkdir, open, readdir, readFile, rename, rm, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const STORE_SCHEMA_VERSION = 1;
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SESSION_COOKIE_NAMES = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);
const POSIX = process.platform !== "win32";

export interface ProfileMetadata {
  name: string;
  origin: string;
  account: {
    id: string;
    email: string;
  };
}

export interface StoredProfile extends ProfileMetadata {
  session: {
    name: "better-auth.session_token" | "__Secure-better-auth.session_token";
    value: string;
  };
}

export interface ActiveContext {
  organizationId: string;
  eventId?: string;
}

export interface StoreConfig {
  schemaVersion: 1;
  activeProfile?: string;
  context?: ActiveContext;
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isPrivateMode(mode: number, expected: number): boolean {
  return !POSIX || (mode & 0o777) === expected;
}

function assertImmediateChild(parent: string, candidate: string): void {
  const resolvedParent = resolve(parent);
  const resolvedCandidate = resolve(candidate);
  if (dirname(resolvedCandidate) !== resolvedParent || basename(resolvedCandidate).length === 0) {
    throw new StoreError("Store path is outside its permitted directory");
  }
}

export function validateProfileName(name: string): string {
  if (!PROFILE_NAME_PATTERN.test(name) || name === "." || name === "..") {
    throw new StoreError(
      "Profile names must contain only letters, numbers, dots, underscores, and hyphens",
    );
  }
  return name;
}

export function canonicalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StoreError("API origin must be a valid URL");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new StoreError("API origin must not contain credentials, a query, or a fragment");
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new StoreError("API origin must use HTTPS except for loopback development");
  }
  return url.origin;
}

function parseProfile(value: unknown): StoredProfile {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["schemaVersion", "name", "origin", "account", "session"])
  ) {
    throw new StoreError("Profile file has an invalid format");
  }
  if (value.schemaVersion !== STORE_SCHEMA_VERSION || !nonEmptyString(value.name)) {
    throw new StoreError("Profile file has an invalid format");
  }
  const name = validateProfileName(value.name);
  if (!nonEmptyString(value.origin) || canonicalizeOrigin(value.origin) !== value.origin) {
    throw new StoreError("Profile file has an invalid format");
  }
  if (!isRecord(value.account) || !hasOnlyKeys(value.account, ["id", "email"])) {
    throw new StoreError("Profile file has an invalid format");
  }
  if (!nonEmptyString(value.account.id) || !validEmail(value.account.email)) {
    throw new StoreError("Profile file has an invalid format");
  }
  if (!isRecord(value.session) || !hasOnlyKeys(value.session, ["name", "value"])) {
    throw new StoreError("Profile file has an invalid format");
  }
  if (
    !SESSION_COOKIE_NAMES.has(String(value.session.name)) ||
    !nonEmptyString(value.session.value)
  ) {
    throw new StoreError("Profile file has an invalid format");
  }
  return {
    name,
    origin: value.origin,
    account: { id: value.account.id, email: value.account.email },
    session: {
      name: value.session.name as StoredProfile["session"]["name"],
      value: value.session.value,
    },
  };
}

function parseConfig(value: unknown): StoreConfig {
  if (!isRecord(value)) throw new StoreError("Config file has an invalid format");
  const allowed = ["schemaVersion", "activeProfile", "context"];
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    value.schemaVersion !== STORE_SCHEMA_VERSION
  ) {
    throw new StoreError("Config file has an invalid format");
  }
  if (
    value.activeProfile !== undefined &&
    (!nonEmptyString(value.activeProfile) || !PROFILE_NAME_PATTERN.test(value.activeProfile))
  ) {
    throw new StoreError("Config file has an invalid format");
  }
  if (value.context === undefined) {
    if (value.activeProfile === undefined) return { schemaVersion: STORE_SCHEMA_VERSION };
    return { schemaVersion: STORE_SCHEMA_VERSION, activeProfile: value.activeProfile };
  }
  const context = value.context;
  if (
    !isRecord(context) ||
    !hasOnlyKeys(
      context,
      ["organizationId", "eventId"].filter((key) => key in context),
    )
  ) {
    throw new StoreError("Config file has an invalid format");
  }
  if (!nonEmptyString(context.organizationId))
    throw new StoreError("Config file has an invalid format");
  if (context.eventId !== undefined && !nonEmptyString(context.eventId)) {
    throw new StoreError("Config file has an invalid format");
  }
  if (value.activeProfile === undefined) throw new StoreError("Config file has an invalid format");
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    activeProfile: value.activeProfile,
    context:
      context.eventId === undefined
        ? { organizationId: context.organizationId }
        : { organizationId: context.organizationId, eventId: context.eventId },
  };
}

async function syncIfSupported(path: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!isErrno(error, "EINVAL") && !isErrno(error, "ENOSYS") && !isErrno(error, "EPERM")) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

export class ProfileStore {
  readonly root: string;
  readonly accountsDirectory: string;
  readonly configPath: string;

  constructor(home = homedir()) {
    this.root = resolve(home, ".eventloom");
    this.accountsDirectory = join(this.root, "accounts");
    this.configPath = join(this.root, "config.json");
    assertImmediateChild(resolve(home), this.root);
    assertImmediateChild(this.root, this.accountsDirectory);
    assertImmediateChild(this.root, this.configPath);
  }

  async listProfiles(): Promise<ProfileMetadata[]> {
    await this.ensureDirectories();
    let entries: string[];
    try {
      entries = await readdir(this.accountsDirectory);
    } catch {
      throw new StoreError("Unable to read the profiles directory");
    }
    const profiles: ProfileMetadata[] = [];
    for (const entry of entries.sort((left, right) => left.localeCompare(right))) {
      const path = join(this.accountsDirectory, entry);
      assertImmediateChild(this.accountsDirectory, path);
      const info = await this.requireRegularFile(
        path,
        "Profile directory contains an unsafe entry",
      );
      if (!entry.endsWith(".json")) {
        if (info.isFile()) throw new StoreError("Profile directory contains an unexpected entry");
        continue;
      }
      const name = entry.slice(0, -".json".length);
      validateProfileName(name);
      const profile = await this.readProfile(name);
      profiles.push({ name: profile.name, origin: profile.origin, account: profile.account });
    }
    return profiles.sort((left, right) => left.name.localeCompare(right.name));
  }

  async readProfile(name: string): Promise<StoredProfile> {
    const path = this.profilePath(name);
    await this.ensureDirectories();
    return this.readJsonFile(path, "Profile file is unreadable", parseProfile);
  }

  async saveProfile(profile: StoredProfile): Promise<void> {
    const parsed = parseProfile({ schemaVersion: STORE_SCHEMA_VERSION, ...profile });
    await this.ensureDirectories();
    const path = this.profilePath(parsed.name);
    const existing = await this.readProfileIfPresent(parsed.name);
    if (existing !== undefined && existing.origin !== parsed.origin) {
      throw new StoreError("An existing profile cannot be moved to another API origin");
    }
    await this.atomicWrite(
      path,
      JSON.stringify({ schemaVersion: STORE_SCHEMA_VERSION, ...parsed }, null, 2).concat("\n"),
    );
  }

  async removeProfile(name: string): Promise<void> {
    const path = this.profilePath(name);
    await this.ensureDirectories();
    try {
      await this.requireRegularFile(path, "Profile file is unsafe");
      await unlink(path);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) {
        if (error instanceof StoreError) throw error;
        throw new StoreError("Unable to remove profile");
      }
    }

    const config = await this.readConfig();
    if (config.activeProfile === name)
      await this.writeConfig({ schemaVersion: STORE_SCHEMA_VERSION });
  }

  async readConfig(): Promise<StoreConfig> {
    await this.ensureDirectories();
    try {
      return await this.readJsonFile(this.configPath, "Config file is unreadable", parseConfig);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return { schemaVersion: STORE_SCHEMA_VERSION };
      throw error;
    }
  }

  async setActiveProfile(name: string, context?: ActiveContext): Promise<void> {
    const profileName = validateProfileName(name);
    await this.readProfile(profileName);
    if (
      context !== undefined &&
      (!nonEmptyString(context.organizationId) ||
        (context.eventId !== undefined && !nonEmptyString(context.eventId)))
    ) {
      throw new StoreError("Context must include an organization and optional event");
    }
    const config: StoreConfig =
      context === undefined
        ? { schemaVersion: STORE_SCHEMA_VERSION, activeProfile: profileName }
        : { schemaVersion: STORE_SCHEMA_VERSION, activeProfile: profileName, context };
    await this.writeConfig(config);
  }

  private profilePath(name: string): string {
    const profileName = validateProfileName(name);
    const path = join(this.accountsDirectory, `${profileName}.json`);
    assertImmediateChild(this.accountsDirectory, path);
    return path;
  }

  private async ensureDirectories(): Promise<void> {
    await this.ensurePrivateDirectory(this.root);
    await this.ensurePrivateDirectory(this.accountsDirectory);
  }

  private async ensurePrivateDirectory(path: string): Promise<void> {
    try {
      const initial = await lstat(path);
      if (initial.isSymbolicLink() || !initial.isDirectory()) {
        throw new StoreError("Store directory is unsafe");
      }
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      try {
        await mkdir(path, { mode: 0o700 });
      } catch (createError) {
        if (!isErrno(createError, "EEXIST"))
          throw new StoreError("Unable to create secure store directory");
      }
    }
    try {
      await chmod(path, 0o700);
      const final = await lstat(path);
      if (final.isSymbolicLink() || !final.isDirectory() || !isPrivateMode(final.mode, 0o700)) {
        throw new StoreError("Store directory is unsafe");
      }
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError("Unable to secure store directory");
    }
  }

  private async requireRegularFile(path: string, message: string): Promise<Stats> {
    assertImmediateChild(dirname(path), path);
    let info: Stats;
    try {
      info = await lstat(path);
    } catch (error) {
      if (isErrno(error, "ENOENT")) throw error;
      throw new StoreError(message);
    }
    if (info.isSymbolicLink() || !info.isFile() || !isPrivateMode(info.mode, 0o600)) {
      throw new StoreError(message);
    }
    return info;
  }

  private async readJsonFile<T>(
    path: string,
    message: string,
    parse: (value: unknown) => T,
  ): Promise<T> {
    await this.requireRegularFile(path, message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch {
      throw new StoreError(message);
    }
    return parse(parsed);
  }

  private async readProfileIfPresent(name: string): Promise<StoredProfile | undefined> {
    try {
      return await this.readProfile(name);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return undefined;
      throw error;
    }
  }

  private async writeConfig(config: StoreConfig): Promise<void> {
    const parsed = parseConfig(config);
    await this.ensureDirectories();
    await this.atomicWrite(this.configPath, JSON.stringify(parsed, null, 2).concat("\n"));
  }

  private async atomicWrite(destination: string, contents: string): Promise<void> {
    assertImmediateChild(dirname(destination), destination);
    const temporary = join(dirname(destination), `.${basename(destination)}.tmp`);
    assertImmediateChild(dirname(destination), temporary);
    let handle: FileHandle | undefined;
    let created = false;
    try {
      try {
        handle = await open(temporary, "wx", 0o600);
        created = true;
      } catch (error) {
        if (isErrno(error, "EEXIST"))
          throw new StoreError("A secure temporary file already exists");
        throw new StoreError("Unable to create secure temporary file");
      }
      await handle.chmod(0o600);
      const temporaryInfo = await handle.stat();
      if (!temporaryInfo.isFile() || !isPrivateMode(temporaryInfo.mode, 0o600)) {
        throw new StoreError("Secure temporary file has unsafe permissions");
      }
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;

      try {
        await this.requireExistingTargetIsRegular(destination);
      } catch (error) {
        if (!isErrno(error, "ENOENT")) throw error;
      }
      await rename(temporary, destination);
      created = false;
      await chmod(destination, 0o600);
      await this.requireRegularFile(destination, "Persisted file is unsafe");
      await syncIfSupported(dirname(destination));
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError("Unable to persist profile data safely");
    } finally {
      await handle?.close();
      if (created) await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async requireExistingTargetIsRegular(path: string): Promise<void> {
    await this.requireRegularFile(path, "Existing persisted file is unsafe");
  }
}
