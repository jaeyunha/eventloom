import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename as renamePath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

const LOCK_NAME = ".eventloom-install.json";

export type SkillAgent = "codex" | "claude-code" | "all";
export type SkillInstallScope = "global" | "project";

export interface SkillInstallOptions {
  agent: SkillAgent;
  scope: SkillInstallScope;
  force?: boolean;
  home: string;
  cwd: string;
  assetsRoot: string;
  cliVersion: string;
}

export interface SkillInstallDependencies {
  rename?(source: string, destination: string): Promise<void>;
}

export interface InstalledSkill {
  agent: Exclude<SkillAgent, "all">;
  destination: string;
  sha256: string;
}

interface InstallLock {
  schemaVersion: 1;
  cliVersion: string;
  skillVersion: string;
  sha256: string;
}

function normalizedRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

async function regularFiles(root: string, includeLock: boolean): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Skill tree contains a symbolic link: ${normalizedRelative(root, path)}`);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const relativePath = normalizedRelative(root, path);
        if (includeLock || relativePath !== LOCK_NAME) files.push(relativePath);
      } else {
        throw new Error(
          `Skill tree contains a non-regular file: ${normalizedRelative(root, path)}`,
        );
      }
    }
  }
  await visit(root);
  return files.sort();
}

function encodedLength(value: number): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

export async function skillManifestDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const relativePath of await regularFiles(root, false)) {
    const pathBytes = Buffer.from(relativePath, "utf8");
    const content = await readFile(join(root, relativePath));
    hash.update(encodedLength(pathBytes.length));
    hash.update(pathBytes);
    hash.update(encodedLength(content.length));
    hash.update(content);
  }
  return hash.digest("hex");
}

async function syncPath(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    await syncPath(path);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EISDIR" && code !== "EPERM")
      throw error;
  }
}

async function copyTree(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true, mode: 0o755 });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Bundled skill contains a symbolic link: ${entry.name}`);
    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
      await syncPath(destinationPath);
    } else {
      throw new Error(`Bundled skill contains a non-regular file: ${entry.name}`);
    }
  }
  await syncDirectory(destination);
}

function destinationFor(
  agent: Exclude<SkillAgent, "all">,
  scope: SkillInstallScope,
  home: string,
  cwd: string,
): string {
  const base = scope === "global" ? home : cwd;
  return agent === "codex"
    ? join(base, ".agents", "skills", "eventloom")
    : join(base, ".claude", "skills", "eventloom");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

function validLock(value: unknown): value is InstallLock {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const lock = value as Record<string, unknown>;
  return (
    Object.keys(lock).length === 4 &&
    lock.schemaVersion === 1 &&
    typeof lock.cliVersion === "string" &&
    typeof lock.skillVersion === "string" &&
    typeof lock.sha256 === "string"
  );
}

async function assertDestinationUnmodified(destination: string, cliVersion: string): Promise<void> {
  let lock: unknown;
  try {
    lock = JSON.parse(await readFile(join(destination, LOCK_NAME), "utf8"));
  } catch {
    throw new Error(`Installed Eventloom skill is modified; use --force to replace ${destination}`);
  }
  if (
    !validLock(lock) ||
    lock.cliVersion !== cliVersion ||
    lock.skillVersion !== cliVersion ||
    lock.sha256 !== (await skillManifestDigest(destination))
  ) {
    throw new Error(`Installed Eventloom skill is modified; use --force to replace ${destination}`);
  }
}

async function installOne(
  agent: Exclude<SkillAgent, "all">,
  options: SkillInstallOptions,
  dependencies: SkillInstallDependencies,
): Promise<InstalledSkill> {
  const destination = destinationFor(agent, options.scope, options.home, options.cwd);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true, mode: 0o755 });

  const destinationExists = await pathExists(destination);
  if (destinationExists) {
    const destinationStat = await lstat(destination);
    if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
      if (!options.force)
        throw new Error(
          `Installed Eventloom skill is modified; use --force to replace ${destination}`,
        );
    } else if (!options.force) {
      await assertDestinationUnmodified(destination, options.cliVersion);
    }
  }

  const staging = await mkdtemp(join(parent, `.${basename(destination)}.staging-`));
  const backup = join(parent, `.${basename(destination)}.backup-${randomUUID()}`);
  const rename = dependencies.rename ?? renamePath;
  let backedUp = false;
  try {
    await copyTree(options.assetsRoot, staging);
    const sha256 = await skillManifestDigest(staging);
    const lock: InstallLock = {
      schemaVersion: 1,
      cliVersion: options.cliVersion,
      skillVersion: options.cliVersion,
      sha256,
    };
    const lockPath = join(staging, LOCK_NAME);
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, { mode: 0o644 });
    await syncPath(lockPath);
    await syncDirectory(staging);

    if (destinationExists) {
      await rename(destination, backup);
      backedUp = true;
      await syncDirectory(parent);
    }
    try {
      await rename(staging, destination);
      await syncDirectory(parent);
    } catch (error) {
      if (backedUp) {
        await rename(backup, destination);
        backedUp = false;
        await syncDirectory(parent);
      }
      throw error;
    }
    if (backedUp) {
      await rm(backup, { recursive: true, force: true });
      backedUp = false;
      await syncDirectory(parent);
    }
    return { agent, destination, sha256 };
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (backedUp && !(await pathExists(destination))) await rename(backup, destination);
  }
}

export async function installSkill(
  options: SkillInstallOptions,
  dependencies: SkillInstallDependencies = {},
): Promise<InstalledSkill[]> {
  const sourceStat = await lstat(options.assetsRoot).catch(() => null);
  if (sourceStat === null || !sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error(`Bundled Eventloom skill assets were not found at ${options.assetsRoot}`);
  }
  const agents: Exclude<SkillAgent, "all">[] =
    options.agent === "all" ? ["codex", "claude-code"] : [options.agent];
  const installed: InstalledSkill[] = [];
  for (const agent of agents) installed.push(await installOne(agent, options, dependencies));
  return installed;
}
