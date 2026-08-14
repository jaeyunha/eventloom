import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalizeOrigin,
  ProfileStore,
  type StoredProfile,
  StoreError,
  validateProfileName,
} from "./store";

const temporaryHomes: string[] = [];

async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "eventloom-cli-test-"));
  temporaryHomes.push(home);
  return home;
}

function profile(name = "primary"): StoredProfile {
  return {
    name,
    origin: "https://eventloom.example",
    account: { id: "account-1", email: "agent@example.com" },
    session: { name: "better-auth.session_token", value: "top-secret-session-cookie" },
  };
}

async function expectStoreError(action: () => Promise<unknown>): Promise<void> {
  await expect(action()).rejects.toBeInstanceOf(StoreError);
}

afterEach(async () => {
  await Promise.all(
    temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

describe("ProfileStore", () => {
  it("creates, lists, selects, and removes deterministic profiles", async () => {
    const store = new ProfileStore(await temporaryHome());
    await store.saveProfile(profile("zulu"));
    await store.saveProfile(profile("alpha"));
    await store.setActiveProfile("zulu", { organizationId: "org-1", eventId: "event-1" });

    expect((await store.listProfiles()).map((entry) => entry.name)).toEqual(["alpha", "zulu"]);
    expect(await store.readConfig()).toEqual({
      schemaVersion: 1,
      activeProfile: "zulu",
      context: { organizationId: "org-1", eventId: "event-1" },
    });

    await store.removeProfile("zulu");
    expect(await store.readConfig()).toEqual({ schemaVersion: 1 });
    expect((await store.listProfiles()).map((entry) => entry.name)).toEqual(["alpha"]);
  });

  it("enforces required POSIX modes for store paths", async () => {
    const home = await temporaryHome();
    const store = new ProfileStore(home);
    await store.saveProfile(profile());
    await store.setActiveProfile("primary");

    const root = join(home, ".eventloom");
    const accounts = join(root, "accounts");
    const config = join(root, "config.json");
    const account = join(accounts, "primary.json");
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(accounts)).mode & 0o777).toBe(0o700);
    expect((await stat(config)).mode & 0o777).toBe(0o600);
    expect((await stat(account)).mode & 0o777).toBe(0o600);
  });

  it("rejects profile traversal and invalid profile names", async () => {
    for (const name of [".", "..", "../../target", "", "a/child", "-first", "a".repeat(65)]) {
      expect(() => validateProfileName(name)).toThrow(StoreError);
    }
    expect(validateProfileName("a.valid_profile-1")).toBe("a.valid_profile-1");

    const store = new ProfileStore(await temporaryHome());
    await expectStoreError(() => store.saveProfile(profile("../../target")));
    await expectStoreError(() => store.removeProfile("."));
  });

  it("rejects symlinked store root, accounts directory, config, and account paths", async () => {
    const home = await temporaryHome();
    const root = join(home, ".eventloom");
    const target = join(home, "target");
    await mkdir(target, { mode: 0o700 });
    await symlink(target, root);
    await expectStoreError(() => new ProfileStore(home).listProfiles());

    const secondHome = await temporaryHome();
    const secondRoot = join(secondHome, ".eventloom");
    await mkdir(secondRoot, { mode: 0o700 });
    await symlink(target, join(secondRoot, "accounts"));
    await expectStoreError(() => new ProfileStore(secondHome).listProfiles());

    const thirdHome = await temporaryHome();
    const thirdRoot = join(thirdHome, ".eventloom");
    await mkdir(join(thirdRoot, "accounts"), { recursive: true, mode: 0o700 });
    await symlink(join(target, "config.json"), join(thirdRoot, "config.json"));
    await expectStoreError(() => new ProfileStore(thirdHome).readConfig());
    await symlink(join(target, "account.json"), join(thirdRoot, "accounts", "primary.json"));
    await expectStoreError(() => new ProfileStore(thirdHome).readProfile("primary"));
  });

  it("rejects non-regular root, accounts, config, account, and temporary paths", async () => {
    const home = await temporaryHome();
    await writeFile(join(home, ".eventloom"), "not a directory");
    await expectStoreError(() => new ProfileStore(home).listProfiles());

    const secondHome = await temporaryHome();
    const root = join(secondHome, ".eventloom");
    await mkdir(root, { mode: 0o700 });
    await writeFile(join(root, "accounts"), "not a directory");
    await expectStoreError(() => new ProfileStore(secondHome).listProfiles());

    const thirdHome = await temporaryHome();
    const thirdRoot = join(thirdHome, ".eventloom");
    await mkdir(join(thirdRoot, "accounts"), { recursive: true, mode: 0o700 });
    await mkdir(join(thirdRoot, "config.json"));
    await expectStoreError(() => new ProfileStore(thirdHome).readConfig());
    await mkdir(join(thirdRoot, "accounts", "primary.json"));
    await expectStoreError(() => new ProfileStore(thirdHome).readProfile("primary"));

    const fourthHome = await temporaryHome();
    const fourthStore = new ProfileStore(fourthHome);
    await mkdir(join(fourthHome, ".eventloom", "accounts"), { recursive: true, mode: 0o700 });
    await writeFile(join(fourthHome, ".eventloom", "accounts", ".primary.json.tmp"), "collision");
    await expectStoreError(() => fourthStore.saveProfile(profile()));
  });

  it("does not replace a persisted profile when serialization fails before the atomic rename", async () => {
    const store = new ProfileStore(await temporaryHome());
    await store.saveProfile(profile());
    const before = await store.readProfile("primary");

    await expectStoreError(() =>
      store.saveProfile({
        ...profile(),
        account: { id: "account-2", email: "not-an-email" },
      }),
    );

    expect(await store.readProfile("primary")).toEqual(before);
  });

  it("reports malformed JSON without leaking cookie values", async () => {
    const home = await temporaryHome();
    const root = join(home, ".eventloom");
    await mkdir(join(root, "accounts"), { recursive: true, mode: 0o700 });
    await writeFile(
      join(root, "accounts", "primary.json"),
      '{"session":"top-secret-session-cookie"',
      {
        mode: 0o600,
      },
    );

    await expectStoreError(() => new ProfileStore(home).readProfile("primary"));
    await expectStoreError(() => new ProfileStore(home).listProfiles());
    try {
      await new ProfileStore(home).readProfile("primary");
    } catch (error) {
      expect(String(error)).not.toContain("top-secret-session-cookie");
    }
  });

  it("rejects insecure persisted permissions instead of accepting them", async () => {
    const home = await temporaryHome();
    const store = new ProfileStore(home);
    await store.saveProfile(profile());
    const accountPath = join(home, ".eventloom", "accounts", "primary.json");
    await chmod(accountPath, 0o644);
    await expectStoreError(() => store.readProfile("primary"));
  });

  it("stores only the intended profile fields", async () => {
    const home = await temporaryHome();
    const store = new ProfileStore(home);
    await store.saveProfile(profile());
    const serialized = await readFile(join(home, ".eventloom", "accounts", "primary.json"), "utf8");
    expect(JSON.parse(serialized)).toEqual({ schemaVersion: 1, ...profile() });
    expect(serialized).not.toContain("Set-Cookie");
    expect(serialized).not.toContain("Path=");
  });

  it("canonicalizes origins and makes a stored profile origin immutable", async () => {
    expect(canonicalizeOrigin("https://EVENTLOOM.example:443/")).toBe("https://eventloom.example");
    expect(canonicalizeOrigin("http://localhost:3000/path")).toBe("http://localhost:3000");
    expect(() => canonicalizeOrigin("https://user:pass@example.com")).toThrow(StoreError);
    expect(() => canonicalizeOrigin("https://example.com/path?secret=1")).toThrow(StoreError);

    const store = new ProfileStore(await temporaryHome());
    await store.saveProfile(profile());
    await expectStoreError(() =>
      store.saveProfile({ ...profile(), origin: "https://other.example" }),
    );
    expect((await store.readProfile("primary")).origin).toBe("https://eventloom.example");
  });

  it("uses exclusive same-directory temporary writes", async () => {
    const home = await temporaryHome();
    const store = new ProfileStore(home);
    await mkdir(join(home, ".eventloom", "accounts"), { recursive: true, mode: 0o700 });
    const temporary = join(home, ".eventloom", "accounts", ".primary.json.tmp");
    await writeFile(temporary, "already here", { mode: 0o600, flag: "wx" });

    await expectStoreError(() => store.saveProfile(profile()));
    expect(await lstat(temporary)).toMatchObject({ isFile: expect.any(Function) });
  });
});
