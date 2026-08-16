import { canonicalHash, canonicalize, hashRecordSet } from "./canonical.mjs";

const REPORT_STATUSES = new Set(["match", "explained-drift", "unexplained-drift"]);
const MISMATCH_KINDS = new Set(["source-only", "target-only", "content"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

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

function plainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, required, optional = []) {
  if (!plainObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validHash(value, nullable = false) {
  return (nullable && value === null) || (typeof value === "string" && HASH_PATTERN.test(value));
}

function validExplanation(value, nullable = false) {
  if (nullable && value === null) return true;
  return (
    exactKeys(value, ["domain", "recordId", "reason", "ticket"]) &&
    typeof value.domain === "string" &&
    value.domain.trim().length > 0 &&
    typeof value.recordId === "string" &&
    value.recordId.trim().length > 0 &&
    typeof value.reason === "string" &&
    value.reason.trim().length > 0 &&
    (value.ticket === null || typeof value.ticket === "string")
  );
}

function validMismatch(value) {
  return (
    exactKeys(value, [
      "domain",
      "recordId",
      "kind",
      "sourceHash",
      "targetHash",
      "explained",
      "explanation",
    ]) &&
    typeof value.domain === "string" &&
    value.domain.trim().length > 0 &&
    typeof value.recordId === "string" &&
    value.recordId.trim().length > 0 &&
    MISMATCH_KINDS.has(value.kind) &&
    validHash(value.sourceHash, true) &&
    validHash(value.targetHash, true) &&
    typeof value.explained === "boolean" &&
    validExplanation(value.explanation, true) &&
    value.explained === (value.explanation !== null)
  );
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

export function compareSnapshots({
  source,
  target,
  explanations = [],
  identity,
  tenantId,
  environment,
} = {}) {
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
    ...(tenantId === undefined ? {} : { tenantId: requiredText(tenantId, "Tenant ID") }),
    ...(environment === undefined
      ? {}
      : { environment: requiredText(environment, "Environment").toLowerCase() }),
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

export function validateVerificationReport(report) {
  const topLevelKeys = [
    "version",
    "status",
    "safeForReadCutover",
    "summary",
    "domains",
    "mismatches",
    "unusedExplanations",
    "reportHash",
  ];
  if (!exactKeys(report, topLevelKeys, ["tenantId", "environment"])) {
    throw new ComparisonError("REPORT_INVALID", "Verification report has an invalid structure.");
  }
  if (
    report.version !== 1 ||
    !REPORT_STATUSES.has(report.status) ||
    typeof report.safeForReadCutover !== "boolean" ||
    !validHash(report.reportHash) ||
    (report.tenantId !== undefined &&
      (typeof report.tenantId !== "string" || report.tenantId.trim().length === 0)) ||
    (report.environment !== undefined &&
      (typeof report.environment !== "string" || report.environment.trim().length === 0))
  ) {
    throw new ComparisonError("REPORT_INVALID", "Verification report metadata is invalid.");
  }
  const summaryKeys = [
    "domainCount",
    "matchingDomains",
    "mismatchCount",
    "explainedCount",
    "unexplainedCount",
    "unusedExplanationCount",
  ];
  if (
    !exactKeys(report.summary, summaryKeys) ||
    !summaryKeys.every((key) => nonNegativeInteger(report.summary[key])) ||
    !Array.isArray(report.domains) ||
    !Array.isArray(report.mismatches) ||
    !Array.isArray(report.unusedExplanations)
  ) {
    throw new ComparisonError("REPORT_INVALID", "Verification report summary is invalid.");
  }
  for (const domain of report.domains) {
    if (
      !exactKeys(domain, [
        "domain",
        "source",
        "target",
        "countMatches",
        "hashMatches",
        "status",
        "mismatches",
      ]) ||
      typeof domain.domain !== "string" ||
      domain.domain.trim().length === 0 ||
      !exactKeys(domain.source, ["count", "hash"]) ||
      !exactKeys(domain.target, ["count", "hash"]) ||
      !nonNegativeInteger(domain.source.count) ||
      !nonNegativeInteger(domain.target.count) ||
      !validHash(domain.source.hash) ||
      !validHash(domain.target.hash) ||
      typeof domain.countMatches !== "boolean" ||
      typeof domain.hashMatches !== "boolean" ||
      !REPORT_STATUSES.has(domain.status) ||
      !Array.isArray(domain.mismatches) ||
      !domain.mismatches.every(validMismatch) ||
      domain.mismatches.some((mismatch) => mismatch.domain !== domain.domain)
    ) {
      throw new ComparisonError("REPORT_INVALID", "Verification report domain data is invalid.");
    }
    const domainUnexplained = domain.mismatches.filter((mismatch) => !mismatch.explained).length;
    const expectedDomainStatus =
      domain.mismatches.length === 0
        ? "match"
        : domainUnexplained === 0
          ? "explained-drift"
          : "unexplained-drift";
    if (
      domain.countMatches !== (domain.source.count === domain.target.count) ||
      domain.hashMatches !== (domain.source.hash === domain.target.hash) ||
      domain.status !== expectedDomainStatus
    ) {
      throw new ComparisonError(
        "REPORT_INVALID",
        "Verification report domain values are inconsistent.",
      );
    }
  }

  if (
    !report.mismatches.every(validMismatch) ||
    !report.unusedExplanations.every(validExplanation)
  ) {
    throw new ComparisonError("REPORT_INVALID", "Verification report mismatch data is invalid.");
  }

  const flattenedMismatches = report.domains.flatMap((domain) => domain.mismatches);
  const unexplainedCount = report.mismatches.filter((mismatch) => !mismatch.explained).length;
  const expectedStatus =
    report.mismatches.length === 0
      ? "match"
      : unexplainedCount === 0
        ? "explained-drift"
        : "unexplained-drift";
  if (
    canonicalize(flattenedMismatches) !== canonicalize(report.mismatches) ||
    report.summary.domainCount !== report.domains.length ||
    report.summary.matchingDomains !==
      report.domains.filter((domain) => domain.status === "match").length ||
    report.summary.mismatchCount !== report.mismatches.length ||
    report.summary.explainedCount !== report.mismatches.length - unexplainedCount ||
    report.summary.unexplainedCount !== unexplainedCount ||
    report.summary.unusedExplanationCount !== report.unusedExplanations.length ||
    report.safeForReadCutover !== (unexplainedCount === 0) ||
    report.status !== expectedStatus
  ) {
    throw new ComparisonError("REPORT_INVALID", "Verification report values are inconsistent.");
  }
  const { reportHash, ...unsignedReport } = report;
  if (canonicalHash(unsignedReport) !== reportHash) {
    throw new ComparisonError("REPORT_HASH_MISMATCH", "Verification report hash is invalid.");
  }
  return report;
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
