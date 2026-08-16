import { createHash } from "node:crypto";

export class CanonicalizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CanonicalizationError";
    this.code = code;
  }
}

function normalize(value, path, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalizationError("NON_JSON_NUMBER", `${path} contains a non-finite number.`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      throw new CanonicalizationError("INVALID_DATE", `${path} contains an invalid date.`);
    }
    return value.toISOString();
  }
  if (typeof value !== "object") {
    throw new CanonicalizationError(
      "NON_JSON_VALUE",
      `${path} contains an unsupported ${typeof value} value.`,
    );
  }
  if (ancestors.has(value)) {
    throw new CanonicalizationError("CYCLIC_VALUE", `${path} contains a cycle.`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalize(entry, `${path}[${index}]`, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalizationError("NON_PLAIN_OBJECT", `${path} is not a plain object.`);
    }
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) {
        throw new CanonicalizationError("UNDEFINED_VALUE", `${path}.${key} is undefined.`);
      }
      result[key] = normalize(value[key], `${path}.${key}`, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalize(value) {
  return JSON.stringify(normalize(value, "$", new Set()));
}

export function canonicalHash(value, algorithm = "sha256") {
  return createHash(algorithm).update(canonicalize(value), "utf8").digest("hex");
}

export function canonicalRecordSet(records) {
  if (!Array.isArray(records)) {
    throw new CanonicalizationError("RECORDS_INVALID", "Canonical record input must be an array.");
  }
  return records.map((record) => canonicalize(record)).sort();
}

export function hashRecordSet(records, algorithm = "sha256") {
  const canonicalRecords = canonicalRecordSet(records);
  const hash = createHash(algorithm);
  for (const record of canonicalRecords) {
    const bytes = Buffer.from(record, "utf8");
    hash.update(String(bytes.length));
    hash.update(":");
    hash.update(bytes);
    hash.update(";");
  }
  return hash.digest("hex");
}
