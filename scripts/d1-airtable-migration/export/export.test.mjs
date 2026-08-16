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
      return response({ records: records[tableId].slice(1) });
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

test("strict mode rejects missing and duplicate Application IDs", async () => {
  const schema = await fixture("schema.json");
  const missingRecords = await fixture("records.json");
  const duplicateRecords = await fixture("records.json");
  const directory = await mkdtemp(join(tmpdir(), "airtable-export-invalid-id-"));
  delete missingRecords.tblSessions[0].fields["Application ID"];
  await assert.rejects(
    exportAirtableInventory({
      accessToken: "secret-token",
      baseId: "appTest",
      outputPath: join(directory, "missing-manifest.json"),
      apiOrigin: "https://airtable.test",
      fetchImplementation: fakeAirtable(schema, missingRecords).fetchImplementation,
    }),
    (error) => error.code === "APPLICATION_ID_INVALID" && !error.message.includes("secret-token"),
  );

  duplicateRecords.tblSessions[1].fields["Application ID"] = "session-b";
  await assert.rejects(
    exportAirtableInventory({
      accessToken: "secret-token",
      baseId: "appTest",
      outputPath: join(directory, "duplicate-manifest.json"),
      apiOrigin: "https://airtable.test",
      fetchImplementation: fakeAirtable(schema, duplicateRecords).fetchImplementation,
    }),
    (error) => error.code === "APPLICATION_ID_DUPLICATE" && !error.message.includes("secret-token"),
  );
});

test("quarantine mode preserves raw invalid records and exports only the valid remainder", async () => {
  const schema = await fixture("schema.json");
  const records = await fixture("records.json");
  records.tblSessions.push(
    {
      id: "recMissing",
      createdTime: "2026-01-05T00:00:00.000Z",
      fields: { Title: "Missing ID", "Organization ID": "org-acme" },
    },
    {
      id: "recInvalid",
      createdTime: "2026-01-06T00:00:00.000Z",
      fields: {
        Title: "Invalid ID",
        "Application ID": " invalid-id ",
        "Organization ID": "org-acme",
      },
    },
  );
  records.tblSessions[1].fields["Application ID"] = "session-b";
  const directory = await mkdtemp(join(tmpdir(), "airtable-export-quarantine-"));
  const outputPath = join(directory, "manifest.json");
  const reportPath = join(directory, "quarantine.json");

  const result = await exportAirtableInventory({
    accessToken: "secret-token",
    baseId: "appTest",
    outputPath,
    quarantineReportPath: reportPath,
    apiOrigin: "https://airtable.test",
    fetchImplementation: fakeAirtable(schema, records).fetchImplementation,
  });

  assert.equal(result.manifest.recordCount, 2);
  assert.equal(result.manifest.quarantineCount, 4);
  const sessions = result.manifest.tables.find((table) => table.name === "Sessions");
  assert.deepEqual(sessions.records, []);
  assert.equal(sessions.quarantineCount, 4);
  assert.deepEqual(
    sessions.quarantine.map((record) => record.reason),
    [
      "DUPLICATE_APPLICATION_ID",
      "DUPLICATE_APPLICATION_ID",
      "INVALID_APPLICATION_ID",
      "MISSING_APPLICATION_ID",
    ],
  );
  assert.deepEqual(
    new Set(sessions.quarantine.map((record) => record.airtableRecordId)),
    new Set(["recSessionA", "recSessionB", "recMissing", "recInvalid"]),
  );
  assert.deepEqual(
    sessions.quarantine.find((record) => record.airtableRecordId === "recMissing").raw,
    records.tblSessions.find((record) => record.id === "recMissing"),
  );
  assert.match(sessions.schemaSha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.quarantineReport.quarantineCount, 4);
  assert.deepEqual(result.quarantineReport.tables[0].reasons, {
    DUPLICATE_APPLICATION_ID: 2,
    INVALID_APPLICATION_ID: 1,
    MISSING_APPLICATION_ID: 1,
  });
  const reportSource = await readFile(reportPath, "utf8");
  assert.equal(reportSource.includes("recMissing"), false);
  assert.equal(reportSource.includes("invalid-id"), false);
  assert.equal(reportSource.includes("Missing ID"), false);
  assert.equal(reportSource.includes("appTest"), false);
  assert.match(result.quarantineReport.baseIdSha256, /^[a-f0-9]{64}$/u);
  assert.equal(result.quarantineReport.schemaSha256, result.manifest.schema.rawSha256);

  const secondDirectory = await mkdtemp(join(tmpdir(), "airtable-export-quarantine-second-"));
  await exportAirtableInventory({
    accessToken: "secret-token",
    baseId: "appTest",
    outputPath: join(secondDirectory, "manifest.json"),
    quarantineReportPath: join(secondDirectory, "quarantine.json"),
    apiOrigin: "https://airtable.test",
    fetchImplementation: fakeAirtable(schema, records).fetchImplementation,
  });
  assert.equal(reportSource, await readFile(join(secondDirectory, "quarantine.json"), "utf8"));
});

test("validates arguments and configuration without exposing credentials", () => {
  assert.deepEqual(
    parseExportArguments([
      "--dry-run",
      "--table",
      "Events",
      "--resume",
      "--quarantine-report",
      "quarantine.json",
    ]),
    {
      help: false,
      dryRun: true,
      resume: true,
      output: "airtable-inventory.json",
      tables: ["Events"],
      quarantineReport: "quarantine.json",
    },
  );
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

test("custom API origins require HTTPS except for loopback HTTP", async () => {
  const directory = await mkdtemp(join(tmpdir(), "airtable-export-origin-"));
  await assert.rejects(
    exportAirtableInventory({
      accessToken: "secret-token",
      baseId: "appTest",
      outputPath: join(directory, "rejected.json"),
      apiOrigin: "http://airtable.example.test",
      fetchImplementation: async () => {
        throw new Error("unsafe origin must be rejected before fetch");
      },
    }),
    (error) =>
      error instanceof AirtableExportError &&
      error.code === "CONFIGURATION_ERROR" &&
      !error.message.includes("secret-token"),
  );

  const schema = await fixture("schema.json");
  const records = await fixture("records.json");
  const loopback = fakeAirtable(schema, records);
  await exportAirtableInventory({
    accessToken: "secret-token",
    baseId: "appTest",
    outputPath: join(directory, "loopback.json"),
    apiOrigin: "http://127.0.0.1:8787",
    fetchImplementation: loopback.fetchImplementation,
  });
  assert.equal(
    loopback.requests.every(({ url }) => url.origin === "http://127.0.0.1:8787"),
    true,
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
  assert.match(dryStdout.value(), /"invalidApplicationIds": "reject"/u);
  assert.equal(dryStdout.value().includes("secret-token"), false);
  await assert.rejects(readFile(output), { code: "ENOENT" });
});

test("CLI quarantine mode writes the valid fixture remainder and redacted report", async () => {
  const schema = await fixture("schema.json");
  const records = await fixture("records.json");
  delete records.tblSessions[1].fields["Application ID"];
  const directory = await mkdtemp(join(tmpdir(), "airtable-export-cli-quarantine-"));
  const outputPath = join(directory, "manifest.json");
  const reportPath = join(directory, "quarantine.json");
  const stdout = capture();
  const stderr = capture();

  assert.equal(
    await runExportCli({
      arguments: ["--output", outputPath, "--quarantine-report", reportPath],
      environment: { AIRTABLE_ACCESS_TOKEN: "secret-token", AIRTABLE_BASE_ID: "appTest" },
      stdout,
      stderr,
      fetchImplementation: fakeAirtable(schema, records).fetchImplementation,
    }),
    0,
  );
  assert.match(stdout.value(), /Exported 3 records/u);
  assert.match(stdout.value(), /Quarantined 1 records/u);
  assert.equal(stderr.value(), "");
  const manifest = JSON.parse(await readFile(outputPath, "utf8"));
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(manifest.recordCount, 3);
  assert.equal(manifest.quarantineCount, 1);
  assert.equal(report.quarantineCount, 1);
  assert.equal(JSON.stringify(report).includes("recSessionA"), false);
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
