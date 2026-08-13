#!/usr/bin/env bun
import { createHash, randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { FetchAirtableTransport } from "../../../apps/api/src/infrastructure/airtable/transport.ts";
import {
  AirtableExportError,
  exportAirtableInventory,
} from "../../../scripts/d1-airtable-migration/export/export-lib.mjs";

const API_ORIGIN = "https://api.airtable.com";
const token = required("AIRTABLE_ACCESS_TOKEN");
const baseId = required("AIRTABLE_BASE_STAGING_ID");
const runSalt = randomBytes(32);
const temporaryExport = resolve(`/tmp/open-sessionboard-airtable-staging-${process.pid}.json`);
const startedAt = new Date().toISOString();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function hash(value) {
  return createHash("sha256").update(runSalt).update("\0").update(String(value)).digest("hex");
}

function hashedKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).sort().map(hash);
}

function responseRequestId(response) {
  const value = response.headers.get("x-airtable-request-id");
  return value ? hash(value) : null;
}

const networkObservations = [];
const guardedFetch = async (input, init = {}) => {
  const method = String(init.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new Error(`READ_ONLY_GUARD_REJECTED_${method}`);
  const url = new URL(String(input));
  if (url.origin !== API_ORIGIN) throw new Error("READ_ONLY_GUARD_REJECTED_ORIGIN");
  const authorization = new Headers(init.headers).get("authorization");
  if (authorization !== `Bearer ${token}`) throw new Error("READ_ONLY_GUARD_REJECTED_AUTH");
  const started = performance.now();
  const response = await fetch(input, init);
  networkObservations.push({
    method,
    pathShape: url.pathname.startsWith("/v0/meta/") ? "meta" : "records",
    status: response.status,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    requestIdSha256: responseRequestId(response),
  });
  return response;
};

async function getJson(path) {
  const response = await guardedFetch(`${API_ORIGIN}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = await response.json();
  return { response, body };
}

function summarizeSchema(body) {
  const tables = Array.isArray(body?.tables) ? body.tables : [];
  return {
    tableCount: tables.length,
    schemaSha256: hash(JSON.stringify(body)),
    tables: tables.map((table) => ({
      idSha256: hash(table.id),
      nameSha256: hash(table.name),
      fieldCount: Array.isArray(table.fields) ? table.fields.length : null,
      viewCount: Array.isArray(table.views) ? table.views.length : null,
      schemaSha256: hash(JSON.stringify(table)),
    })),
  };
}

const report = {
  format: "open-sessionboard.airtable-staging-acceptance",
  version: 1,
  startedAt,
  completedAt: null,
  target: {
    environmentVariable: "AIRTABLE_BASE_STAGING_ID",
    baseIdSha256: hash(baseId),
    distinctFromConfiguredDefault: baseId !== process.env.AIRTABLE_BASE_ID?.trim(),
    distinctFromConfiguredDevelopment: baseId !== process.env.AIRTABLE_BASE_DEV_ID?.trim(),
  },
  safety: {
    allowedHttpMethods: ["GET"],
    mutationRequestsAttempted: 0,
    rawProviderPayloadRetained: false,
    hashNote: "All provider identifiers, names, request IDs, and payload digests use a non-retained per-run salt.",
  },
  checks: {},
  networkObservations,
};

try {
  try {
    const { response, body } = await getJson("/v0/meta/whoami");
    report.checks.identity = {
      outcome: response.ok ? "pass" : "fail",
      httpStatus: response.status,
      requestIdSha256: responseRequestId(response),
      responseKeyHashes: hashedKeys(body),
      identityPayloadSha256: hash(JSON.stringify(body)),
    };
  } catch (error) {
    report.checks.identity = { outcome: "error", errorName: error?.name ?? "Error", errorSha256: hash(error?.message ?? error) };
  }

  let schemaBody;
  try {
    const { response, body } = await getJson(`/v0/meta/bases/${encodeURIComponent(baseId)}/tables`);
    schemaBody = body;
    report.checks.schema = {
      outcome: response.ok ? "pass" : "fail",
      httpStatus: response.status,
      requestIdSha256: responseRequestId(response),
      ...summarizeSchema(body),
    };
  } catch (error) {
    report.checks.schema = { outcome: "error", errorName: error?.name ?? "Error", errorSha256: hash(error?.message ?? error) };
  }

  try {
    const firstTable = schemaBody?.tables?.[0];
    if (!firstTable?.id) throw new Error("NO_TABLE_AVAILABLE_FOR_ADAPTER_READ");
    const adapterObservations = [];
    const adapterFetch = async (input, init) => {
      const response = await guardedFetch(input, init);
      const url = new URL(String(input));
      adapterObservations.push({
        method: String(init?.method ?? "GET").toUpperCase(),
        originMatches: url.origin === API_ORIGIN,
        pathHasEncodedBase: url.pathname.includes(encodeURIComponent(baseId)),
        pathHasEncodedTable: url.pathname.includes(encodeURIComponent(firstTable.id)),
        authorizationPresent: new Headers(init?.headers).has("authorization"),
        accept: new Headers(init?.headers).get("accept"),
        pageSize: url.searchParams.get("pageSize"),
        returnFieldsByFieldId: url.searchParams.get("returnFieldsByFieldId"),
      });
      return response;
    };
    const transport = new FetchAirtableTransport({ token, fetch: adapterFetch });
    const response = await transport.request({
      method: "GET",
      baseId,
      table: firstTable.id,
      query: { pageSize: 1, returnFieldsByFieldId: true },
    });
    report.checks.providerHttpAdapter = {
      outcome: response.status >= 200 && response.status < 300 ? "pass" : "fail",
      httpStatus: response.status,
      responseHeaderNameHashes: Object.keys(response.headers).sort().map(hash),
      responseBodyKeyHashes: hashedKeys(response.body),
      returnedRecordCount: Array.isArray(response.body?.records) ? response.body.records.length : null,
      observations: adapterObservations,
    };
  } catch (error) {
    report.checks.providerHttpAdapter = { outcome: "error", errorName: error?.name ?? "Error", errorSha256: hash(error?.message ?? error) };
  }

  try {
    const result = await exportAirtableInventory({
      accessToken: token,
      baseId,
      outputPath: temporaryExport,
      fetchImplementation: guardedFetch,
    });
    report.checks.export = {
      outcome: "pass",
      tableCount: result.manifest.tableCount,
      recordCount: result.manifest.recordCount,
      manifestSha256: hash(JSON.stringify(result.manifest)),
      tables: result.manifest.tables.map((table) => ({
        idSha256: hash(table.id),
        nameSha256: hash(table.name),
        schemaSha256: hash(table.schemaSha256),
        recordCount: table.recordCount,
        recordDigestSetSha256: hash(table.records.map((record) => record.rawSha256).sort().join("\n")),
      })),
    };
  } catch (error) {
    report.checks.export = {
      outcome: "error",
      errorName: error?.name ?? "Error",
      errorCode: error instanceof AirtableExportError ? error.code : "UNEXPECTED_ERROR",
      errorSha256: hash(error?.message ?? error),
    };
  }
} finally {
  await rm(temporaryExport, { force: true });
  await rm(`${temporaryExport}.checkpoint.json`, { force: true });
  report.completedAt = new Date().toISOString();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
