import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runExportCli } from "./export.mjs";
import {
  AirtableExportError,
  canonicalJson,
  exportAirtableInventory,
  parseExportArguments,
  readExportConfiguration,
} from "./export-lib.mjs";

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "x-airtable-request-id": "req-test" },
  });
}

function fakeAirtable(schema, records, { failSecondSessionPage = false } = {}) {
  const requests = [];
  let sessionPages = 0;
  const fetchImplementation = async (url, init) => {
    const parsed = new URL(url);
    requests.push({ url: parsed, init });
    assert.equal(init.method, "GET");
    assert.equal(init.headers.Authorization, "Bearer secret-token");
    if (parsed.pathname.includes("/meta/bases/")) return response(schema);
    const tableId = decodeURIComponent(parsed.pathname.split("/").at(-1));
    if (tableId === "tblSessions") {
      sessionPages += 1;
      if (parsed.searchParams.get("offset") === null) {
        return response({ records: [records[tableId][0]], offset: "offset-session-2" });
      }
      assert.equal(parsed.searchParams.get("offset"), "offset-session-2");
      if (failSecondSessionPage) throw new Error("simulated network failure");
      return response({ records: [records[tableId][1]] });
    }
    return response({ records: records[tableId] });
  };
  return {
    fetchImplementation,
    requests,
    get sessionPages() {
      return sessionPages;
    },
  };
}

function capture() {
  let value = "";
  return {
    write: (chunk) => {
      value += chunk;
    },
    value: () => value,
  };
}

test("exports deterministic schema, canonical raw records, stable IDs, and derived tenant scope", async () => {
  const schema = await fixture("schema.json");
  const records = await fixture("records.json");
  const firstDirectory = await mkdtemp(join(tmpdir(), "airtable-export-first-"));
  const secondDirectory = await mkdtemp(join(tmpdir(), "airtable-export-second-"));
  const firstOutput = join(firstDirectory, "manifest.json");
  const secondOutput = join(secondDirectory, "manifest.json");
  const firstFake = fakeAirtable(schema, records);
  const secondFake = fakeAirtable(schema, records);

  const first = await exportAirtableInventory({
    accessToken: "secret-token",
    baseId: "appTest",
    outputPath: firstOutput,
    apiOrigin: "https://airtable.test",
    fetchImplementation: firstFake.fetchImplementation,
  });
  await exportAirtableInventory({
    accessToken: "secret-token",
    baseId: "appTest",
    outputPath: secondOutput,
    apiOrigin: "https://airtable.test",
    fetchImplementation: secondFake.fetchImplementation,
  });

  assert.equal(await readFile(firstOutput, "utf8"), await readFile(secondOutput, "utf8"));
  assert.equal(first.manifest.format, "open-sessionboard.airtable-inventory");
  assert.equal(first.manifest.tableCount, 3);
  assert.equal(first.manifest.recordCount, 4);
  assert.deepEqual(
    first.manifest.tables.map((table) => table.name),
    ["Events", "Organizations", "Sessions"],
  );
  const sessions = first.manifest.tables.find((table) => table.name === "Sessions");
  assert.deepEqual(
    sessions.records.map((record) => record.applicationId),
    ["session-a", "session-b"],
  );
  assert.deepEqual(sessions.records[0].scope, {
    organizationId: "org-acme",
    eventId: "event-summit",
  });
  assert.deepEqual(sessions.records[0].raw, records.tblSessions[1]);
  assert.deepEqual(sessions.records[0].fields, records.tblSessions[1].fields);
  assert.match(sessions.schemaSha256, /^[a-f0-9]{64}$/u);
  assert.match(sessions.records[0].rawSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    firstFake.requests.every((request) => request.init.method === "GET"),
    true,
  );
  assert.equal(
    firstFake.requests.some((request) => /secret-token/u.test(request.url.href)),
    false,
  );
});

test("resumes from the exact Airtable offset without rereading completed pages", async () => {
  const schema = await fixture("schema.json");
  const records = await fixture("records.json");
  const directory = await mkdtemp(join(tmpdir(), "airtable-export-resume-"));
  const outputPath = join(directory, "manifest.json");
  const failing = fakeAirtable(schema, records, { failSecondSessionPage: true });
  await assert.rejects(
    exportAirtableInventory({
      accessToken: "secret-token",
      baseId: "appTest",
      outputPath,
      apiOrigin: "https://airtable.test",
      fetchImplementation: failing.fetchImplementation,
    }),
    (error) => error instanceof AirtableExportError && error.code === "AIRTABLE_REQUEST_FAILED",
  );
  const checkpoint = JSON.parse(await readFile(`${outputPath}.checkpoint.json`, "utf8"));
  assert.equal(checkpoint.tables.tblOrganizations.complete, true);
  assert.equal(checkpoint.tables.tblEvents.complete, true);
  assert.equal(checkpoint.tables.tblSessions.nextOffset, "offset-session-2");
  assert.equal(checkpoint.tables.tblSessions.records.length, 1);

  const resumeRequests = [];
  const resumed = await exportAirtableInventory({
    accessToken: "secret-token",
    baseId: "appTest",
    outputPath,
    resume: true,
    apiOrigin: "https://airtable.test",
    fetchImplementation: async (url, init) => {
      const parsed = new URL(url);
      resumeRequests.push(parsed);
      assert.equal(init.method, "GET");
      assert.equal(parsed.searchParams.get("offset"), "offset-session-2");
      return response({ records: [records.tblSessions[1]] });
    },
  });
  assert.equal(resumeRequests.length, 1);
  assert.equal(resumed.manifest.recordCount, 4);
  await assert.rejects(readFile(`${outputPath}.checkpoint.json`, "utf8"), { code: "ENOENT" });
});

test("rejects missing and duplicate Application IDs", async () => {
  const schema = await fixture("schema.json");
  const records = await fixture("records.json");
  const directory = await mkdtemp(join(tmpdir(), "airtable-export-invalid-id-"));
  records.tblSessions[1].fields["Application ID"] = "session-b";
  await assert.rejects(
    exportAirtableInventory({
      accessToken: "secret-token",
      baseId: "appTest",
      outputPath: join(directory, "manifest.json"),
      apiOrigin: "https://airtable.test",
      fetchImplementation: fakeAirtable(schema, records).fetchImplementation,
    }),
    (error) => error.code === "APPLICATION_ID_DUPLICATE" && !error.message.includes("secret-token"),
  );
});

test("validates arguments and configuration without exposing credentials", () => {
  assert.deepEqual(parseExportArguments(["--dry-run", "--table", "Events", "--resume"]), {
    help: false,
    dryRun: true,
    resume: true,
    output: "airtable-inventory.json",
    tables: ["Events"],
  });
  assert.throws(
    () => parseExportArguments(["--unknown"]),
    (error) => error.code === "ARGUMENT_ERROR",
  );
  assert.deepEqual(
    readExportConfiguration({ AIRTABLE_ACCESS_TOKEN: " token ", AIRTABLE_BASE_ID: " appBase " }),
    {
      accessToken: "token",
      baseId: "appBase",
      tables: undefined,
    },
  );
  assert.throws(
    () => readExportConfiguration({ AIRTABLE_ACCESS_TOKEN: "super-secret" }),
    (error) => error.code === "CONFIGURATION_ERROR" && !error.message.includes("super-secret"),
  );
});

test("CLI help and dry-run make no network or file writes", async () => {
  const stdout = capture();
  const stderr = capture();
  let fetches = 0;
  assert.equal(
    await runExportCli({
      arguments: ["--help"],
      stdout,
      stderr,
      fetchImplementation: async () => {
        fetches += 1;
      },
    }),
    0,
  );
  assert.match(stdout.value(), /Usage:/u);
  assert.equal(fetches, 0);
  assert.equal(stderr.value(), "");

  const dryStdout = capture();
  const directory = await mkdtemp(join(tmpdir(), "airtable-export-dry-"));
  const output = join(directory, "must-not-exist.json");
  assert.equal(
    await runExportCli({
      arguments: ["--dry-run", "--output", output, "--table", "Events"],
      environment: { AIRTABLE_ACCESS_TOKEN: "secret-token", AIRTABLE_BASE_ID: "appTest" },
      stdout: dryStdout,
      stderr,
      fetchImplementation: async () => {
        fetches += 1;
      },
    }),
    0,
  );
  assert.equal(fetches, 0);
  assert.match(dryStdout.value(), /"airtableAccess": "read-only"/u);
  assert.equal(dryStdout.value().includes("secret-token"), false);
  await assert.rejects(readFile(output), { code: "ENOENT" });
});

test("CLI reports bad input and Airtable errors without logging the token or response body", async () => {
  const stdout = capture();
  const stderr = capture();
  assert.equal(
    await runExportCli({
      arguments: ["--bad"],
      environment: { AIRTABLE_ACCESS_TOKEN: "secret-token", AIRTABLE_BASE_ID: "appTest" },
      stdout,
      stderr,
    }),
    1,
  );
  assert.match(stderr.value(), /^ARGUMENT_ERROR:/u);
  assert.equal(stderr.value().includes("secret-token"), false);

  const networkStderr = capture();
  assert.equal(
    await runExportCli({
      arguments: [
        "--output",
        join(await mkdtemp(join(tmpdir(), "airtable-export-cli-error-")), "manifest.json"),
      ],
      environment: { AIRTABLE_ACCESS_TOKEN: "secret-token", AIRTABLE_BASE_ID: "appTest" },
      stdout,
      stderr: networkStderr,
      fetchImplementation: async () =>
        response({ error: { message: "secret-token provider detail" } }, 403),
    }),
    1,
  );
  assert.match(networkStderr.value(), /HTTP 403 \(request req-test\)/u);
  assert.equal(networkStderr.value().includes("secret-token"), false);
  assert.equal(networkStderr.value().includes("provider detail"), false);
});

test("canonical JSON recursively sorts object keys but preserves arrays", async () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, x: 1 }, b: [{ d: 4, c: 3 }] }),
    '{\n  "a": {\n    "x": 1,\n    "y": 2\n  },\n  "b": [\n    {\n      "c": 3,\n      "d": 4\n    }\n  ],\n  "z": 1\n}\n',
  );
});
