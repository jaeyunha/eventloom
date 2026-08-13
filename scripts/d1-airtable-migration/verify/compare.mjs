import { canonicalHash, canonicalize, hashRecordSet } from "./canonical.mjs";

export class ComparisonError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ComparisonError";
    this.code = code;
  }
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ComparisonError("INPUT_INVALID", `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeDomains(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ComparisonError("INPUT_INVALID", `${label} must be an object keyed by domain.`);
  }
  const normalized = {};
  for (const domain of Object.keys(value).sort()) {
    if (!Array.isArray(value[domain])) {
      throw new ComparisonError("INPUT_INVALID", `${label}.${domain} must be an array.`);
    }
    normalized[requiredText(domain, `${label} domain`)] = value[domain];
  }
  return normalized;
}

function normalizeExplanations(explanations = []) {
  if (!Array.isArray(explanations)) {
    throw new ComparisonError("INPUT_INVALID", "Drift explanations must be an array.");
  }
  const result = new Map();
  for (const [index, explanation] of explanations.entries()) {
    if (explanation === null || typeof explanation !== "object" || Array.isArray(explanation)) {
      throw new ComparisonError("INPUT_INVALID", `Drift explanation ${index} must be an object.`);
    }
    const domain = requiredText(explanation.domain, `Drift explanation ${index} domain`);
    const recordId = requiredText(explanation.recordId, `Drift explanation ${index} recordId`);
    const reason = requiredText(explanation.reason, `Drift explanation ${index} reason`);
    const key = `${domain}\0${recordId}`;
    if (result.has(key)) {
      throw new ComparisonError(
        "DUPLICATE_EXPLANATION",
        `Duplicate drift explanation for ${domain}/${recordId}.`,
      );
    }
    result.set(key, { domain, recordId, reason, ticket: explanation.ticket ?? null });
  }
  return result;
}

function indexRecords(records, domain, side, identity) {
  const result = new Map();
  for (const record of records) {
    let id;
    try {
      id = identity(record, domain);
    } catch (error) {
      throw new ComparisonError(
        "IDENTITY_INVALID",
        `${side}.${domain} record identity failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    id = requiredText(id, `${side}.${domain} record identity`);
    if (result.has(id)) {
      throw new ComparisonError(
        "DUPLICATE_IDENTITY",
        `${side}.${domain} contains duplicate ID ${id}.`,
      );
    }
    result.set(id, { record, hash: canonicalHash(record) });
  }
  return result;
}

function mismatchKind(source, target) {
  if (source === undefined) return "target-only";
  if (target === undefined) return "source-only";
  return "content";
}

export function compareDomainRecords({
  domain,
  sourceRecords,
  targetRecords,
  explanations = new Map(),
  identity = (record) => record?.id,
}) {
  requiredText(domain, "Domain");
  if (!Array.isArray(sourceRecords) || !Array.isArray(targetRecords)) {
    throw new ComparisonError(
      "INPUT_INVALID",
      `${domain} source and target records must be arrays.`,
    );
  }
  const source = indexRecords(sourceRecords, domain, "source", identity);
  const target = indexRecords(targetRecords, domain, "target", identity);
  const sourceHash = hashRecordSet(sourceRecords);
  const targetHash = hashRecordSet(targetRecords);
  const recordIds = [...new Set([...source.keys(), ...target.keys()])].sort();
  const mismatches = [];

  for (const recordId of recordIds) {
    const sourceEntry = source.get(recordId);
    const targetEntry = target.get(recordId);
    if (sourceEntry?.hash === targetEntry?.hash) continue;
    const explanation = explanations.get(`${domain}\0${recordId}`) ?? null;
    mismatches.push({
      domain,
      recordId,
      kind: mismatchKind(sourceEntry, targetEntry),
      sourceHash: sourceEntry?.hash ?? null,
      targetHash: targetEntry?.hash ?? null,
      explained: explanation !== null,
      explanation,
    });
  }

  const sourceCount = sourceRecords.length;
  const targetCount = targetRecords.length;
  return {
    domain,
    source: { count: sourceCount, hash: sourceHash },
    target: { count: targetCount, hash: targetHash },
    countMatches: sourceCount === targetCount,
    hashMatches: sourceHash === targetHash,
    status:
      mismatches.length === 0
        ? "match"
        : mismatches.every((mismatch) => mismatch.explained)
          ? "explained-drift"
          : "unexplained-drift",
    mismatches,
  };
}

export function compareSnapshots({ source, target, explanations = [], identity } = {}) {
  const sourceDomains = normalizeDomains(source, "source");
  const targetDomains = normalizeDomains(target, "target");
  const explanationIndex = normalizeExplanations(explanations);
  const domains = [
    ...new Set([...Object.keys(sourceDomains), ...Object.keys(targetDomains)]),
  ].sort();
  const comparisons = domains.map((domain) =>
    compareDomainRecords({
      domain,
      sourceRecords: sourceDomains[domain] ?? [],
      targetRecords: targetDomains[domain] ?? [],
      explanations: explanationIndex,
      identity,
    }),
  );
  const mismatches = comparisons.flatMap((comparison) => comparison.mismatches);
  const usedExplanationKeys = new Set(
    mismatches.map(({ domain, recordId }) => `${domain}\0${recordId}`),
  );
  const unusedExplanations = [...explanationIndex.entries()]
    .filter(([key]) => !usedExplanationKeys.has(key))
    .map(([, explanation]) => explanation)
    .sort((left, right) =>
      `${left.domain}\0${left.recordId}`.localeCompare(`${right.domain}\0${right.recordId}`),
    );
  const unexplainedCount = mismatches.filter((mismatch) => !mismatch.explained).length;
  const report = {
    version: 1,
    status:
      mismatches.length === 0
        ? "match"
        : unexplainedCount === 0
          ? "explained-drift"
          : "unexplained-drift",
    safeForReadCutover: unexplainedCount === 0,
    summary: {
      domainCount: comparisons.length,
      matchingDomains: comparisons.filter(({ status }) => status === "match").length,
      mismatchCount: mismatches.length,
      explainedCount: mismatches.length - unexplainedCount,
      unexplainedCount,
      unusedExplanationCount: unusedExplanations.length,
    },
    domains: comparisons,
    mismatches,
    unusedExplanations,
  };
  return { ...report, reportHash: canonicalHash(report) };
}

export function renderMismatchReport(report) {
  if (report === null || typeof report !== "object") {
    throw new ComparisonError("INPUT_INVALID", "Comparison report must be an object.");
  }
  const lines = [
    `Shadow comparison: ${report.status}`,
    `Domains: ${report.summary.domainCount}; mismatches: ${report.summary.mismatchCount} (${report.summary.unexplainedCount} unexplained)`,
  ];
  for (const domain of report.domains) {
    lines.push(
      `${domain.domain}: ${domain.status}; source=${domain.source.count}/${domain.source.hash}; target=${domain.target.count}/${domain.target.hash}`,
    );
    for (const mismatch of domain.mismatches) {
      lines.push(
        `  - ${mismatch.recordId}: ${mismatch.kind}; ${
          mismatch.explained ? `explained: ${mismatch.explanation.reason}` : "UNEXPLAINED"
        }`,
      );
    }
  }
  if (report.unusedExplanations.length > 0) {
    lines.push(`Unused explanations: ${report.unusedExplanations.length}`);
  }
  lines.push(`Report hash: ${report.reportHash}`);
  return lines.join("\n");
}

export function snapshotFingerprint(snapshot) {
  return canonicalize(normalizeDomains(snapshot, "snapshot"));
}
