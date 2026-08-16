import { validateVerificationReport } from "./compare.mjs";

export const CUTOVER_STATES = Object.freeze(["shadow", "read-d1", "write-d1"]);

export class CutoverError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CutoverError";
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CutoverError("INPUT_INVALID", `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function assertState(state, label) {
  if (!CUTOVER_STATES.includes(state)) {
    throw new CutoverError(
      "STATE_INVALID",
      `${label} must be one of ${CUTOVER_STATES.join(", ")}.`,
    );
  }
}

function assertAdapterMethod(adapter, method) {
  if (adapter === null || typeof adapter !== "object" || typeof adapter[method] !== "function") {
    throw new CutoverError("ADAPTER_INVALID", `Injected adapter must implement ${method}().`);
  }
}

export function allowedTransition(from, to) {
  assertState(from, "Current state");
  assertState(to, "Target state");
  return (from === "shadow" && to === "read-d1") || (from === "read-d1" && to === "write-d1");
}

function normalizeMarker(marker, tenantId) {
  if (marker === null || typeof marker !== "object" || Array.isArray(marker)) {
    throw new CutoverError("MARKER_INVALID", "Cutover marker adapter returned an invalid marker.");
  }
  if (marker.tenantId !== tenantId) {
    throw new CutoverError("TENANT_MISMATCH", "Cutover marker belongs to a different tenant.");
  }
  assertState(marker.state, "Marker state");
  if (!Number.isInteger(marker.version) || marker.version < 0) {
    throw new CutoverError(
      "MARKER_INVALID",
      "Cutover marker version must be a non-negative integer.",
    );
  }
  if (
    marker.verificationReportHash !== undefined &&
    (typeof marker.verificationReportHash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(marker.verificationReportHash))
  ) {
    throw new CutoverError(
      "MARKER_INVALID",
      "Cutover marker verification report hash must be a 64-character lowercase hex digest.",
    );
  }
  if (marker.state !== "shadow" && marker.verificationReportHash === undefined) {
    throw new CutoverError(
      "MARKER_INVALID",
      "Cutover marker must retain its verification report hash after read cutover.",
    );
  }
  return marker;
}

export async function transitionTenant({
  tenantId,
  to,
  markerAdapter,
  fenceAdapter,
  verificationReport,
  environment,
  reason,
  now = () => new Date(),
} = {}) {
  tenantId = requiredText(tenantId, "Tenant ID");

  reason = requiredText(reason, "Transition reason");
  assertState(to, "Target state");
  assertAdapterMethod(markerAdapter, "readMarker");
  assertAdapterMethod(markerAdapter, "compareAndSetMarker");

  const current = normalizeMarker(await markerAdapter.readMarker({ tenantId }), tenantId);
  const markerEnvironment =
    current.environment === undefined
      ? undefined
      : requiredText(current.environment, "Marker environment").toLowerCase();
  const requestedEnvironment =
    environment === undefined
      ? undefined
      : requiredText(environment, "Cutover environment").toLowerCase();
  if (
    markerEnvironment !== undefined &&
    requestedEnvironment !== undefined &&
    markerEnvironment !== requestedEnvironment
  ) {
    throw new CutoverError(
      "MARKER_ENVIRONMENT_MISMATCH",
      "Cutover environment cannot relabel an existing marker.",
    );
  }
  const targetEnvironment = markerEnvironment ?? requestedEnvironment;
  if (!allowedTransition(current.state, to)) {
    throw new CutoverError(
      "ILLEGAL_TRANSITION",

      `Illegal cutover transition ${current.state} -> ${to}; transitions are forward-only and single-step.`,
      { from: current.state, to },
    );
  }
  let verifiedReport;
  if (current.state === "shadow") {
    try {
      verifiedReport = validateVerificationReport(verificationReport);
    } catch {
      throw new CutoverError(
        "VERIFICATION_INVALID",
        "shadow -> read-d1 requires a valid versioned comparison report.",
      );
    }
    if (verifiedReport.tenantId !== tenantId) {
      throw new CutoverError(
        "VERIFICATION_TENANT_MISMATCH",
        "Verification report belongs to a different tenant.",
      );
    }
    if (targetEnvironment !== undefined && verifiedReport.environment !== targetEnvironment) {
      throw new CutoverError(
        "VERIFICATION_ENVIRONMENT_MISMATCH",

        "Verification report belongs to a different environment.",
      );
    }
    if (verifiedReport.environment !== undefined && targetEnvironment === undefined) {
      throw new CutoverError(
        "VERIFICATION_ENVIRONMENT_MISMATCH",
        "Verification report environment cannot be bound to the cutover target.",
      );
    }
    if (verifiedReport.safeForReadCutover !== true) {
      throw new CutoverError(
        "VERIFICATION_REQUIRED",
        "shadow -> read-d1 requires a comparison report with no unexplained drift.",
      );
    }
  }

  let fenceToken;
  if (to === "write-d1") {
    assertAdapterMethod(fenceAdapter, "acquireWriteFence");

    assertAdapterMethod(fenceAdapter, "releaseWriteFence");
    fenceToken = await fenceAdapter.acquireWriteFence({
      tenantId,
      expectedState: current.state,
      targetState: to,
    });
    if (fenceToken === undefined || fenceToken === null) {
      throw new CutoverError("FENCE_INVALID", "Write fence adapter returned no fence token.");
    }
  }

  const transitionedAt = now();
  if (!(transitionedAt instanceof Date) || Number.isNaN(transitionedAt.valueOf())) {
    throw new CutoverError("CLOCK_INVALID", "Cutover clock returned an invalid date.");
  }
  const next = {
    tenantId,
    state: to,
    version: current.version + 1,
    transitionedAt: transitionedAt.toISOString(),
    reason,
    ...(targetEnvironment === undefined ? {} : { environment: targetEnvironment }),
    ...(verifiedReport === undefined
      ? current.verificationReportHash === undefined
        ? {}
        : { verificationReportHash: current.verificationReportHash }
      : { verificationReportHash: verifiedReport.reportHash }),
  };

  let stored;

  try {
    stored = normalizeMarker(
      await markerAdapter.compareAndSetMarker({
        tenantId,
        expectedVersion: current.version,
        expectedState: current.state,
        next,
        fenceToken,
      }),
      tenantId,
    );
    if (stored.state !== next.state || stored.version !== next.version) {
      throw new CutoverError(
        "MARKER_INVALID",
        "Stored cutover marker does not match the transition.",
      );
    }
  } catch (error) {
    if (fenceToken !== undefined) {
      try {
        await fenceAdapter.releaseWriteFence({ tenantId, fenceToken, outcome: "aborted" });
      } catch (releaseError) {
        throw new CutoverError(
          "FENCE_RELEASE_FAILED",
          "Marker transition failed and the write fence could not be released.",
          { cause: error, releaseCause: releaseError },
        );
      }
    }
    throw error;
  }

  if (fenceToken !== undefined) {
    try {
      await fenceAdapter.releaseWriteFence({ tenantId, fenceToken, outcome: "committed" });
    } catch (error) {
      throw new CutoverError(
        "FENCE_RELEASE_FAILED",
        "Cutover marker committed but the write fence could not be released.",
        { cause: error, committedMarker: stored },
      );
    }
  }
  return stored;
}

export async function rollbackReadCutover({
  tenantId,
  markerAdapter,
  reason,
  now = () => new Date(),
} = {}) {
  tenantId = requiredText(tenantId, "Tenant ID");
  reason = requiredText(reason, "Rollback reason");
  assertAdapterMethod(markerAdapter, "readMarker");
  assertAdapterMethod(markerAdapter, "compareAndSetMarker");
  const current = normalizeMarker(await markerAdapter.readMarker({ tenantId }), tenantId);
  if (current.state !== "read-d1") {
    throw new CutoverError(
      "ROLLBACK_BOUNDARY",
      `Rollback is allowed only from read-d1; ${current.state} requires a forward repair plan.`,
    );
  }
  const rolledBackAt = now();
  if (!(rolledBackAt instanceof Date) || Number.isNaN(rolledBackAt.valueOf())) {
    throw new CutoverError("CLOCK_INVALID", "Cutover clock returned an invalid date.");
  }
  return normalizeMarker(
    await markerAdapter.compareAndSetMarker({
      tenantId,
      expectedVersion: current.version,
      expectedState: "read-d1",
      next: {
        tenantId,
        state: "shadow",
        version: current.version + 1,
        transitionedAt: rolledBackAt.toISOString(),
        reason,
        rollbackOfVersion: current.version,
      },
    }),
    tenantId,
  );
}
