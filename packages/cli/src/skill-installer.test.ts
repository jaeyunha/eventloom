import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { cliExitCodes } from "@eventloom/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { runCommand } from "./command";
import { installSkill, type SkillInstallDependencies } from "./skill-installer";

const root = join(import.meta.dirname, "../../..");
const canonical = join(root, "skills/eventloom");
const packageVersion = "0.1.0";
const temporaryPaths: string[] = [];

async function temporary(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryPaths.push(path);
  return path;
}

async function regularFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(relative(rootPath, path).split(sep).join("/"));
    }
  }
  await visit(rootPath);
  return files.sort();
}

function length(value: number): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

async function expectedDigest(destination: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of (await regularFiles(destination)).filter(
    (entry) => entry !== ".eventloom-install.json",
  )) {
    const pathBytes = Buffer.from(path, "utf8");
    const content = await readFile(join(destination, path));
    hash.update(length(pathBytes.length));
    hash.update(pathBytes);
    hash.update(length(content.length));
    hash.update(content);
  }
  return hash.digest("hex");
}

function io() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    value: {
      writeStdout(text: string) {
        stdout.push(text);
      },
      writeStderr(text: string) {
        stderr.push(text);
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Eventloom skill installer", () => {
  it.each([
    ["codex", "global", ".agents/skills/eventloom"],
    ["claude-code", "global", ".claude/skills/eventloom"],
    ["codex", "project", ".agents/skills/eventloom"],
    ["claude-code", "project", ".claude/skills/eventloom"],
  ] as const)(
    "installs %s at exact %s destination with canonical bytes and lock",
    async (agent, scope, suffix) => {
      const home = await temporary("eventloom-skill-home-");
      const cwd = await temporary("eventloom-skill-project-");
      const output = io();
      const exit = await runCommand(
        ["skill", "install", "--agent", agent, `--${scope}`, "--json"],
        output.value,
        { home, cwd, skillAssetsRoot: canonical },
      );

      expect(exit).toBe(cliExitCodes.success);
      expect(output.stderr).toEqual([]);
      const destination = join(scope === "global" ? home : cwd, suffix);
      for (const path of await regularFiles(canonical)) {
        expect(await readFile(join(destination, path))).toEqual(
          await readFile(join(canonical, path)),
        );
      }
      const lock = JSON.parse(await readFile(join(destination, ".eventloom-install.json"), "utf8"));
      expect(lock).toEqual({
        schemaVersion: 1,
        cliVersion: packageVersion,
        skillVersion: packageVersion,
        sha256: await expectedDigest(destination),
      });
      expect(Object.keys(lock)).toEqual(["schemaVersion", "cliVersion", "skillVersion", "sha256"]);
    },
  );

  it("installs all agents globally without touching a project skills lock", async () => {
    const home = await temporary("eventloom-skill-home-");
    const cwd = await temporary("eventloom-skill-project-");
    const lockPath = join(cwd, "skills-lock.json");
    const before = Buffer.from('{"sentinel":"project-owned"}\n');
    await writeFile(lockPath, before);
    const output = io();

    expect(
      await runCommand(["skill", "install", "--agent", "all"], output.value, {
        home,
        cwd,
        skillAssetsRoot: canonical,
      }),
    ).toBe(0);

    expect((await stat(join(home, ".agents/skills/eventloom/SKILL.md"))).isFile()).toBe(true);
    expect((await stat(join(home, ".claude/skills/eventloom/SKILL.md"))).isFile()).toBe(true);
    expect(await readFile(lockPath)).toEqual(before);
  });

  it.each(["edited", "added", "removed"] as const)(
    "refuses a destination with an %s file without force",
    async (change) => {
      const home = await temporary("eventloom-skill-home-");
      const cwd = await temporary("eventloom-skill-project-");
      const options = {
        agent: "codex" as const,
        scope: "global" as const,
        home,
        cwd,
        assetsRoot: canonical,
        cliVersion: packageVersion,
      };
      await installSkill(options);
      const destination = join(home, ".agents/skills/eventloom");
      if (change === "edited") await writeFile(join(destination, "SKILL.md"), "local edit\n");
      if (change === "added") await writeFile(join(destination, "LOCAL.md"), "local file\n");
      if (change === "removed") await rm(join(destination, "references/commands.md"));

      await expect(installSkill(options)).rejects.toThrow("modified");
    },
  );

  it("force replaces the complete modified destination", async () => {
    const home = await temporary("eventloom-skill-home-");
    const cwd = await temporary("eventloom-skill-project-");
    const options = {
      agent: "codex" as const,
      scope: "global" as const,
      home,
      cwd,
      assetsRoot: canonical,
      cliVersion: packageVersion,
    };
    await installSkill(options);
    const destination = join(home, ".agents/skills/eventloom");
    await writeFile(join(destination, "SKILL.md"), "local edit\n");
    await writeFile(join(destination, "LOCAL.md"), "local file\n");

    await installSkill({ ...options, force: true });

    expect(await readFile(join(destination, "SKILL.md"))).toEqual(
      await readFile(join(canonical, "SKILL.md")),
    );
    await expect(stat(join(destination, "LOCAL.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restores the prior tree when forced promotion fails", async () => {
    const home = await temporary("eventloom-skill-home-");
    const cwd = await temporary("eventloom-skill-project-");
    const options = {
      agent: "codex" as const,
      scope: "global" as const,
      home,
      cwd,
      assetsRoot: canonical,
      cliVersion: packageVersion,
    };
    await installSkill(options);
    const destination = join(home, ".agents/skills/eventloom");
    await writeFile(join(destination, "SKILL.md"), "preserve this tree\n");
    await writeFile(join(destination, "LOCAL.md"), "preserve local file\n");
    let injected = false;
    const dependencies: SkillInstallDependencies = {
      async rename(source, target) {
        if (
          !injected &&
          dirname(source) === dirname(destination) &&
          source.includes(".staging-") &&
          target === destination
        ) {
          injected = true;
          throw new Error("injected promotion failure");
        }
        await rename(source, target);
      },
    };

    await expect(installSkill({ ...options, force: true }, dependencies)).rejects.toThrow(
      "injected promotion failure",
    );

    expect(await readFile(join(destination, "SKILL.md"), "utf8")).toBe("preserve this tree\n");
    expect(await readFile(join(destination, "LOCAL.md"), "utf8")).toBe("preserve local file\n");
  });

  it("accepts only the documented installer flags", async () => {
    const home = await temporary("eventloom-skill-home-");
    for (const arguments_ of [
      ["skill", "install"],
      ["skill", "install", "--agent", "other"],
      ["skill", "install", "--agent", "codex", "--global", "--project"],
      ["skill", "install", "--agent", "codex", "--profile", "primary"],
    ]) {
      const output = io();
      expect(
        await runCommand(arguments_, output.value, { home, cwd: home, skillAssetsRoot: canonical }),
      ).toBe(2);
    }
  });
});

describe("canonical Eventloom skill", () => {
  it("documents only current commands and explicit fail-closed safety", async () => {
    const files = await Promise.all(
      (await regularFiles(canonical)).map((path) => readFile(join(canonical, path), "utf8")),
    );
    const text = files.join("\n").toLowerCase();
    for (const command of [
      "auth login",
      "auth logout",
      "auth list",
      "access list",
      "context show",
      "context use",
      "organizer status",
      "reviewer inbox",
      "speaker tasks",
      "skill install",
    ]) {
      expect(text).toContain(command);
    }
    for (const prohibition of [
      "curl",
      "browser automation",
      "session scraping",
      "raw http",
      "public-v1",
      "database",
      "provider tools",
      "switch profiles after denial",
      "credential self-update",
      "future mutation",
    ]) {
      expect(text).toContain(prohibition);
    }
    expect(text).not.toContain("agentskills.io");
    expect(text).not.toContain("briefing");
  });
});
