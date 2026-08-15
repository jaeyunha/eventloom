import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canonicalHash, canonicalize } from "./canonical.mjs";
import { compareSnapshots, renderMismatchReport } from "./compare.mjs";
import { CutoverError, rollbackReadCutover, transitionTenant } from "./cutover.mjs";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

function markerAdapter(initial) {
  let marker = structuredClone(initial);
  const calls = [];
  return {
    calls,
    async readMarker(input) {
      calls.push({ operation: "read", input });
      return structuredClone(marker);
    },
    async compareAndSetMarker(input) {
      calls.push({ operation: "compare-and-set", input: structuredClone(input) });
      assert.equal(input.expectedVersion, marker.version);
      assert.equal(input.expectedState, marker.state);
      marker = structuredClone(input.next);
      return structuredClone(marker);
    },
  };
}

test("canonical hashing is stable across object keys and snapshot record order", async () => {
  assert.equal(canonicalize({ z: -0, a: { y: 2, x: 1 } }), '{"a":{"x":1,"y":2},"z":0}');
  assert.equal(canonicalHash({ b: 2, a: 1 }), canonicalHash({ a: 1, b: 2 }));

  const report = compareSnapshots({
    source: await fixture("zero-drift-source.json"),
    target: await fixture("zero-drift-target.json"),
  });
  assert.equal(report.status, "match");
  assert.equal(report.safeForReadCutover, true);
  assert.deepEqual(report.summary, {
    domainCount: 2,
    matchingDomains: 2,
    mismatchCount: 0,
    explainedCount: 0,
    unexplainedCount: 0,
    unusedExplanationCount: 0,
  });
  for (const domain of report.domains) {
    assert.equal(domain.countMatches, true);
    assert.equal(domain.hashMatches, true);
  }
});

test("explained drift remains visible but is safe for read cutover", async () => {
  const report = compareSnapshots({
    source: await fixture("zero-drift-source.json"),
    target: await fixture("explained-drift-target.json"),
    explanations: await fixture("explanations.json"),
  });
  assert.equal(report.status, "explained-drift");
  assert.equal(report.safeForReadCutover, true);
  assert.equal(report.summary.mismatchCount, 1);
  assert.equal(report.summary.explainedCount, 1);
  assert.equal(report.mismatches[0].kind, "content");
  assert.equal(report.mismatches[0].explanation.ticket, "MIG-42");
  assert.match(renderMismatchReport(report), /evt-1: content; explained/);

  const unexplained = compareSnapshots({
    source: await fixture("zero-drift-source.json"),
    target: await fixture("explained-drift-target.json"),
  });
  assert.equal(unexplained.status, "unexplained-drift");
  assert.equal(unexplained.safeForReadCutover, false);
});

test("cutover advances one state at a time and fences the write-d1 transition", async () => {
  const markers = markerAdapter({
    tenantId: "tenant-1",
    environment: "staging",
    state: "shadow",
    version: 3,
  });
  const report = compareSnapshots({
    source: { events: [] },
    target: { events: [] },
    tenantId: "tenant-1",
    environment: "staging",
  });
  const readMarker = await transitionTenant({
    tenantId: "tenant-1",
    environment: "staging",
    to: "read-d1",
    reason: "shadow checks passed",
    markerAdapter: markers,
    verificationReport: report,
    now: () => new Date("2026-08-13T10:00:00.000Z"),
  });

  assert.equal(readMarker.state, "read-d1");
  assert.equal(readMarker.verificationReportHash, report.reportHash);

  const fenceCalls = [];
  const writeMarker = await transitionTenant({
    tenantId: "tenant-1",
    to: "write-d1",
    reason: "read observation passed",
    markerAdapter: markers,
    fenceAdapter: {
      async acquireWriteFence(input) {
        fenceCalls.push({ operation: "acquire", input });
        return "fence-1";
      },
      async releaseWriteFence(input) {
        fenceCalls.push({ operation: "release", input });
      },
    },
    now: () => new Date("2026-08-13T11:00:00.000Z"),
  });
  assert.equal(writeMarker.state, "write-d1");
  assert.equal(writeMarker.verificationReportHash, report.reportHash);
  assert.equal(markers.calls.at(-1).input.fenceToken, "fence-1");
  assert.deepEqual(
    fenceCalls.map(({ operation }) => operation),
    ["acquire", "release"],
  );
  assert.deepEqual(fenceCalls[1].input, {
    tenantId: "tenant-1",
    fenceToken: "fence-1",
    outcome: "committed",
  });
});

test("read cutover rejects bare, tampered, cross-tenant, and cross-environment reports", async () => {
  const validReport = compareSnapshots({
    source: { events: [] },
    target: { events: [] },
    tenantId: "tenant-1",
    environment: "staging",
  });

  for (const [label, verificationReport, environment, expectedCode] of [
    ["bare", { safeForReadCutover: true }, "staging", "VERIFICATION_INVALID"],
    [
      "tampered",
      { ...validReport, status: "unexplained-drift" },
      "staging",
      "VERIFICATION_INVALID",
    ],
    [
      "cross-tenant",
      compareSnapshots({
        source: { events: [] },
        target: { events: [] },
        tenantId: "tenant-2",
        environment: "staging",
      }),
      "staging",
      "VERIFICATION_TENANT_MISMATCH",
    ],
    ["cross-environment", validReport, "production", "VERIFICATION_ENVIRONMENT_MISMATCH"],
  ]) {
    const markers = markerAdapter({
      tenantId: "tenant-1",
      environment,
      state: "shadow",
      version: 0,
    });
    await assert.rejects(
      transitionTenant({
        tenantId: "tenant-1",
        environment,
        to: "read-d1",
        reason: label,
        markerAdapter: markers,
        verificationReport,
      }),
      (error) => error instanceof CutoverError && error.code === expectedCode,
    );
    assert.deepEqual(
      markers.calls.map(({ operation }) => operation),
      ["read"],
    );
  }
});

test("cutover cannot relabel an existing marker environment", async () => {
  const markers = markerAdapter({
    tenantId: "tenant-1",
    environment: "production",
    state: "shadow",
    version: 0,
  });
  const stagingReport = compareSnapshots({
    source: { events: [] },
    target: { events: [] },
    tenantId: "tenant-1",
    environment: "staging",
  });

  await assert.rejects(
    transitionTenant({
      tenantId: "tenant-1",
      environment: "staging",
      to: "read-d1",
      reason: "wrong environment",
      markerAdapter: markers,
      verificationReport: stagingReport,
    }),
    (error) => error instanceof CutoverError && error.code === "MARKER_ENVIRONMENT_MISMATCH",
  );
  assert.deepEqual(
    markers.calls.map(({ operation }) => operation),
    ["read"],
  );
});

test("write cutover rejects missing or malformed verification provenance", async () => {
  for (const verificationReportHash of [undefined, { tampered: true }, "not-a-hash"]) {
    const markers = markerAdapter({
      tenantId: "tenant-1",
      environment: "staging",
      state: "read-d1",
      version: 1,
      ...(verificationReportHash === undefined ? {} : { verificationReportHash }),
    });
    await assert.rejects(
      transitionTenant({
        tenantId: "tenant-1",
        environment: "staging",
        to: "write-d1",
        reason: "invalid provenance",
        markerAdapter: markers,
        fenceAdapter: {
          async acquireWriteFence() {
            throw new Error("must not acquire");
          },
          async releaseWriteFence() {
            throw new Error("must not release");
          },
        },
      }),
      (error) => error instanceof CutoverError && error.code === "MARKER_INVALID",
    );
    assert.deepEqual(
      markers.calls.map(({ operation }) => operation),
      ["read"],
    );
  }
});

test("illegal transitions fail before marker or fence writes", async () => {
  const markers = markerAdapter({ tenantId: "tenant-1", state: "shadow", version: 0 });

  let fenceCalls = 0;
  await assert.rejects(
    transitionTenant({
      tenantId: "tenant-1",
      to: "write-d1",
      reason: "skip ahead",
      markerAdapter: markers,
      fenceAdapter: {
        async acquireWriteFence() {
          fenceCalls += 1;
          return "unexpected";
        },
        async releaseWriteFence() {},
      },
    }),
    (error) => error instanceof CutoverError && error.code === "ILLEGAL_TRANSITION",
  );
  assert.deepEqual(
    markers.calls.map(({ operation }) => operation),
    ["read"],
  );
  assert.equal(fenceCalls, 0);

  await assert.rejects(
    transitionTenant({
      tenantId: "tenant-1",
      to: "read-d1",
      reason: "unchecked",
      markerAdapter: markers,
      verificationReport: { safeForReadCutover: false },
    }),
    (error) => error instanceof CutoverError && error.code === "VERIFICATION_INVALID",
  );

  assert.deepEqual(
    markers.calls.map(({ operation }) => operation),
    ["read", "read"],
  );
});

test("rollback stops at the write-d1 boundary and releases an aborted fence", async () => {
  const verificationReportHash = "a".repeat(64);
  const committed = markerAdapter({
    tenantId: "tenant-1",
    state: "write-d1",
    version: 8,
    verificationReportHash,
  });
  await assert.rejects(
    rollbackReadCutover({
      tenantId: "tenant-1",
      reason: "unsafe rollback",
      markerAdapter: committed,
    }),
    (error) => error instanceof CutoverError && error.code === "ROLLBACK_BOUNDARY",
  );
  assert.deepEqual(
    committed.calls.map(({ operation }) => operation),
    ["read"],
  );

  const readable = markerAdapter({
    tenantId: "tenant-1",
    state: "read-d1",
    version: 4,
    verificationReportHash,
  });
  const rolledBack = await rollbackReadCutover({
    tenantId: "tenant-1",
    reason: "read validation regressed",
    markerAdapter: readable,
    now: () => new Date("2026-08-13T12:00:00.000Z"),
  });
  assert.equal(rolledBack.state, "shadow");
  assert.equal(rolledBack.rollbackOfVersion, 4);

  const failingMarkers = {
    async readMarker() {
      return { tenantId: "tenant-1", state: "read-d1", version: 2, verificationReportHash };
    },
    async compareAndSetMarker() {
      throw new Error("version conflict");
    },
  };
  const releases = [];
  await assert.rejects(
    transitionTenant({
      tenantId: "tenant-1",
      to: "write-d1",
      reason: "attempt",
      markerAdapter: failingMarkers,
      fenceAdapter: {
        async acquireWriteFence() {
          return "fence-2";
        },
        async releaseWriteFence(input) {
          releases.push(input);
        },
      },
    }),
    /version conflict/,
  );
  assert.deepEqual(releases, [{ tenantId: "tenant-1", fenceToken: "fence-2", outcome: "aborted" }]);
});
