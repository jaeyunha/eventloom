import { z } from "zod";

export const cfpSubmissionSteps = [
  "welcome",
  "account",
  "submission",
  "participant",
  "review",
] as const;
export type CfpSubmissionStep = (typeof cfpSubmissionSteps)[number];

export interface CfpApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
    details?: unknown;
  };
}

export class CfpApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, traceId?: string, details?: unknown) {
    super(message);
    this.name = "CfpApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
  }
}

const participantSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    role: z.enum(["primary", "co_speaker"]),
    biography: z.string(),
    answers: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const secondaryContactSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  })
  .passthrough();

export const cfpSubmissionSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    eventId: z.string(),
    formId: z.string(),
    ownerAccountId: z.string(),
    formVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    status: z.enum(["draft", "submitted", "reopened", "withdrawn"]),
    completedSteps: z.array(z.enum(cfpSubmissionSteps)),
    answers: z.record(z.string(), z.unknown()),
    participants: z.array(participantSchema),
    secondaryContacts: z.array(secondaryContactSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
    submittedAt: z.string().optional(),
    reopenedAt: z.string().optional(),
    withdrawnAt: z.string().optional(),
    finalDecisionAt: z.string().optional(),
  })
  .passthrough();
export type CfpServerSubmission = z.infer<typeof cfpSubmissionSchema>;

const publicEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  timezone: z.string(),
  opensAt: z.string(),
  closesAt: z.string(),
});

const publicFormSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    status: z.literal("published"),
    welcomeContent: z.string(),
    settings: z.object({
      speakerLimit: z.number().int().positive(),
      maxSubmissionsPerAccount: z.number().int().positive(),
      confirmationMessage: z.string(),
      successContent: z.string(),
      redirectUrl: z.string().optional(),
    }),
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
      }),
    ),
    submissionFields: z.array(
      z.object({
        id: z.string(),
        sectionId: z.string(),
        key: z.string(),
        label: z.string(),
        kind: z.string(),
        required: z.boolean(),
        options: z.array(z.string()),
      }),
    ),
    participantFields: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

export const publishedCfpSchema = z.object({
  event: publicEventSchema,
  form: publicFormSchema,
});
export type PublishedCfp = z.infer<typeof publishedCfpSchema>;
export type CfpPublishedForm = PublishedCfp["form"];

const cfpReceiptSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  version: z.number().int().positive(),
  submittedAt: z.string(),
});
export type CfpReceipt = z.infer<typeof cfpReceiptSchema>;

const cfpSubmitResultSchema = z.object({
  submission: cfpSubmissionSchema,
  receipt: cfpReceiptSchema,
  confirmationQueued: z.boolean(),
});
export type CfpSubmitResult = z.infer<typeof cfpSubmitResultSchema>;

const eventSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    version: z.number().int().positive(),
    slug: z.string(),
    name: z.string(),
    timezone: z.string(),
    opensAt: z.string(),
    closesAt: z.string(),
  })
  .passthrough();
const formSchema = z
  .object({
    id: z.string(),
    tenantId: z.string(),
    eventId: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    status: z.enum(["draft", "published", "closed"]),
    welcomeContent: z.string(),
    settings: z.record(z.string(), z.unknown()),
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
      }),
    ),
    submissionFields: z.array(
      z.object({
        id: z.string(),
        sectionId: z.string(),
        key: z.string(),
        label: z.string(),
        kind: z.string(),
        required: z.boolean(),
        options: z.array(z.string()),
      }),
    ),
    participantFields: z.array(z.record(z.string(), z.unknown())),
    rules: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();
export type CfpEventConfiguration = z.infer<typeof eventSchema>;
export type CfpFormConfiguration = z.infer<typeof formSchema>;

export interface CfpAccountAuthentication {
  status: "authenticated" | "verification_required";
}
export interface CfpApi {
  getPublished(input: {
    organizationId: string;
    eventId: string;
    formId?: string;
    signal?: AbortSignal;
  }): Promise<PublishedCfp>;
  authenticateAccount(input: {
    email: string;
    password: string;
    name: string;
    verificationCallbackUrl?: string;
  }): Promise<CfpAccountAuthentication>;
  startGoogleSignIn(input: { callbackURL: string }): Promise<string>;
  loadDraft(input: {
    organizationId: string;
    eventId: string;
    submissionId: string;
    signal?: AbortSignal;
  }): Promise<CfpServerSubmission>;
  getReceipt(input: {
    organizationId: string;
    eventId: string;
    submissionId: string;
    signal?: AbortSignal;
  }): Promise<CfpReceipt>;
  createDraft(input: {
    organizationId: string;
    eventId: string;
    formId: string;
    idempotencyKey?: string;
  }): Promise<CfpServerSubmission>;
  saveDraft(input: {
    organizationId: string;
    eventId: string;
    submissionId: string;
    expectedVersion: number;
    idempotencyKey?: string;
    completedStep?: CfpSubmissionStep;
    answers?: Record<string, unknown>;
    participants?: CfpServerSubmission["participants"];
    secondaryContacts?: CfpServerSubmission["secondaryContacts"];
  }): Promise<CfpServerSubmission>;
  review(input: {
    organizationId: string;
    eventId: string;
    submissionId: string;
    idempotencyKey?: string;
  }): Promise<{
    submissionId: string;
    version: number;
    canSubmit: boolean;
    issues: Array<{ path: string; code: string; message: string }>;
    matchedRuleIds: string[];
    routes: unknown[];
  }>;
  submit(input: {
    organizationId: string;
    eventId: string;
    submissionId: string;
    expectedVersion: number;
    idempotencyKey?: string;
  }): Promise<CfpSubmitResult>;
  getEvent(input: {
    organizationId: string;
    eventId: string;
    signal?: AbortSignal;
  }): Promise<CfpEventConfiguration>;
  getForm(input: {
    organizationId: string;
    eventId: string;
    formId: string;
    signal?: AbortSignal;
  }): Promise<CfpFormConfiguration>;
  saveEvent(input: {
    organizationId: string;
    eventId: string;
    event: CfpEventConfiguration;
    expectedVersion: number | null;
    idempotencyKey?: string;
  }): Promise<CfpEventConfiguration>;
  saveForm(input: {
    organizationId: string;
    eventId: string;
    form: CfpFormConfiguration;
    expectedVersion: number | null;
    idempotencyKey?: string;
  }): Promise<CfpFormConfiguration>;
  createForm(input: {
    organizationId: string;
    eventId: string;
    form: CfpFormConfiguration;
    idempotencyKey?: string;
  }): Promise<CfpFormConfiguration>;
  publishForm(input: {
    organizationId: string;
    eventId: string;
    formId: string;
    expectedVersion: number;
    idempotencyKey?: string;
  }): Promise<CfpFormConfiguration>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function segment(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError("A CFP route identifier is required.");
  return encodeURIComponent(normalized);
}

function makeIdempotencyKey(prefix: string): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("The CFP API requires Web Crypto for idempotent mutations.");
  }
  return `${prefix}-${crypto.randomUUID()}`;
}

async function parseError(response: Response): Promise<CfpApiError> {
  const payload = (await response.json().catch(() => undefined)) as CfpApiErrorBody | undefined;
  return new CfpApiError(
    payload?.error?.code ?? "CFP_REQUEST_FAILED",
    payload?.error?.message ?? "The CFP request could not be completed.",
    response.status,
    payload?.error?.traceId,
    payload?.error?.details,
  );
}
type AuthResponseBody = {
  code?: unknown;
  message?: unknown;
  token?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    traceId?: unknown;
    details?: unknown;
  };
};

type AuthErrorFields = {
  code?: string;
  message?: string;
  traceId?: string;
  details?: unknown;
};

function authErrorFields(body: unknown): AuthErrorFields {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return {};
  const responseBody = body as AuthResponseBody;
  const nested =
    typeof responseBody.error === "object" &&
    responseBody.error !== null &&
    !Array.isArray(responseBody.error)
      ? responseBody.error
      : undefined;
  const code = nested?.code ?? responseBody.code;
  const message = nested?.message ?? responseBody.message;
  return {
    ...(typeof code === "string" && code.trim() ? { code } : {}),
    ...(typeof message === "string" && message.trim() ? { message } : {}),
    ...(typeof nested?.traceId === "string" ? { traceId: nested.traceId } : {}),
    ...(nested?.details === undefined ? {} : { details: nested.details }),
  };
}

function authError(
  response: Response,
  body: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): CfpApiError {
  const fields = authErrorFields(body);
  const messages: Record<string, string> = {
    INVALID_EMAIL: "Enter a valid email address.",
    INVALID_PASSWORD: "Enter a valid password.",
    PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
    PASSWORD_TOO_LONG: "Password must be 128 characters or fewer.",
    INVALID_EMAIL_OR_PASSWORD: "The email or password is incorrect.",
    EMAIL_NOT_VERIFIED: "Check your email to verify your account before signing in.",
  };
  return new CfpApiError(
    fields.code ?? fallbackCode,
    messages[fields.code ?? ""] ?? fields.message ?? fallbackMessage,
    response.status,
    fields.traceId,
    fields.details,
  );
}

function isEmailNotVerifiedError(response: Response, body: unknown): boolean {
  const fields = authErrorFields(body);
  return (
    fields.code === "EMAIL_NOT_VERIFIED" ||
    (response.status === 403 && fields.message?.toLowerCase().includes("verif") === true)
  );
}

function isInvalidCredentialsError(response: Response, body: unknown): boolean {
  const fields = authErrorFields(body);
  return (
    fields.code === "INVALID_EMAIL_OR_PASSWORD" ||
    (response.status === 401 &&
      (fields.message?.toLowerCase().includes("password") === true ||
        fields.message?.toLowerCase().includes("email") === true ||
        fields.message?.toLowerCase().includes("credential") === true))
  );
}

function hasAuthSession(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const token = (body as AuthResponseBody).token;
  return typeof token === "string" && token.trim().length > 0;
}

async function authRequest(
  fetcher: Fetcher,
  authBase: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ response: Response; body: unknown }> {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const response = await fetcher(`${authBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });
  return { response, body: await response.json().catch(() => undefined) };
}

export function createCfpApi(baseUrl: string, fetcher: Fetcher = fetch): CfpApi {
  const apiBase = `${trimTrailingSlash(baseUrl)}/api/cfp`;
  const publicBase = `${trimTrailingSlash(baseUrl)}/api/public/cfp`;
  const authBase = `${trimTrailingSlash(baseUrl)}/api/auth`;

  async function request<T>(url: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      ...init,
      credentials: "include",
      headers,
    });
    if (!response.ok) throw await parseError(response);
    if (response.status === 204) return undefined as T;
    const payload = (await response.json()) as { data?: unknown };
    return schema.parse(payload.data);
  }

  function resourcePath(organizationId: string, eventId: string): string {
    return `/organizations/${segment(organizationId)}/events/${segment(eventId)}`;
  }

  function key(prefix: string, provided?: string): string {
    return provided?.trim() || makeIdempotencyKey(prefix);
  }

  return {
    getPublished(input) {
      const formPath = input.formId === undefined ? "" : `/forms/${segment(input.formId)}`;
      return request(
        `${publicBase}${resourcePath(input.organizationId, input.eventId)}${formPath}`,
        publishedCfpSchema,
        { cache: "no-store", ...(input.signal === undefined ? {} : { signal: input.signal }) },
      );
    },
    authenticateAccount: async (input) => {
      const email = input.email.trim().toLowerCase();
      const signIn = await authRequest(fetcher, authBase, "/sign-in/email", {
        email,
        password: input.password,
      });

      if (signIn.response.ok) {
        if (hasAuthSession(signIn.body)) return { status: "authenticated" };
        throw authError(
          signIn.response,
          signIn.body,
          "AUTH_SESSION_NOT_CREATED",
          "Your sign-in session could not be established.",
        );
      }
      if (isEmailNotVerifiedError(signIn.response, signIn.body)) {
        return { status: "verification_required" };
      }
      if (!isInvalidCredentialsError(signIn.response, signIn.body)) {
        throw authError(
          signIn.response,
          signIn.body,
          "AUTH_SIGN_IN_FAILED",
          "We could not sign you in with that email and password.",
        );
      }

      const signUp = await authRequest(fetcher, authBase, "/sign-up/email", {
        email,
        password: input.password,
        name: input.name.trim(),
        ...(input.verificationCallbackUrl ? { callbackURL: input.verificationCallbackUrl } : {}),
      });
      if (!signUp.response.ok) {
        throw authError(
          signUp.response,
          signUp.body,
          "AUTH_SIGN_UP_FAILED",
          "We could not create your account.",
        );
      }
      if (hasAuthSession(signUp.body)) return { status: "authenticated" };
      return { status: "verification_required" };
    },
    startGoogleSignIn: async (input) => {
      const result = await authRequest(fetcher, authBase, "/sign-in/social", {
        provider: "google",
        callbackURL: input.callbackURL,
      });
      if (!result.response.ok) {
        throw authError(
          result.response,
          result.body,
          "GOOGLE_SIGN_IN_FAILED",
          "We could not start Google sign-in.",
        );
      }
      if (
        typeof result.body !== "object" ||
        result.body === null ||
        Array.isArray(result.body) ||
        !("url" in result.body) ||
        typeof result.body.url !== "string" ||
        !result.body.url.startsWith("https://accounts.google.com/")
      ) {
        throw new CfpApiError(
          "GOOGLE_SIGN_IN_FAILED",
          "Google sign-in did not return a valid authorization URL.",
          502,
        );
      }
      return result.body.url;
    },

    loadDraft(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/submissions/${segment(input.submissionId)}/draft`,
        cfpSubmissionSchema,
        { cache: "no-store", ...(input.signal === undefined ? {} : { signal: input.signal }) },
      );
    },
    getReceipt(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/submissions/${segment(input.submissionId)}/receipt`,
        cfpReceiptSchema,
        { cache: "no-store", ...(input.signal === undefined ? {} : { signal: input.signal }) },
      );
    },

    createDraft(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/forms/${segment(input.formId)}/drafts`,
        cfpSubmissionSchema,
        { method: "POST", headers: { "idempotency-key": key("cfp-draft", input.idempotencyKey) } },
      );
    },

    async saveDraft(input) {
      const idempotencyKey = key("cfp-save", input.idempotencyKey);
      let version = input.expectedVersion;
      let latest: CfpServerSubmission | undefined;
      if (input.answers !== undefined || input.completedStep !== undefined) {
        latest = await request(
          `${apiBase}${resourcePath(input.organizationId, input.eventId)}/submissions/${segment(input.submissionId)}/draft`,
          cfpSubmissionSchema,
          {
            method: "PATCH",
            headers: { "idempotency-key": idempotencyKey },
            body: JSON.stringify({
              expectedVersion: version,
              ...(input.completedStep === undefined ? {} : { completedStep: input.completedStep }),
              ...(input.answers === undefined ? {} : { answers: input.answers }),
            }),
          },
        );
        version = latest.version;
      }
      if (input.participants !== undefined || input.secondaryContacts !== undefined) {
        latest = await request(
          `${apiBase}${resourcePath(input.organizationId, input.eventId)}/submissions/${segment(input.submissionId)}/participants`,
          cfpSubmissionSchema,
          {
            method: "PUT",
            headers: { "idempotency-key": key("cfp-participants", input.idempotencyKey) },
            body: JSON.stringify({
              expectedVersion: version,
              participants: input.participants ?? latest?.participants ?? [],
              ...(input.secondaryContacts === undefined
                ? {}
                : { secondaryContacts: input.secondaryContacts }),
            }),
          },
        );
      }
      if (latest === undefined) {
        latest = await request(
          `${apiBase}${resourcePath(input.organizationId, input.eventId)}/submissions/${segment(input.submissionId)}`,
          cfpSubmissionSchema,
          { cache: "no-store" },
        );
      }
      return latest;
    },

    review(input) {
      const schema = z.object({
        submissionId: z.string(),
        version: z.number().int().positive(),
        canSubmit: z.boolean(),
        issues: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })),
        matchedRuleIds: z.array(z.string()),
        routes: z.array(z.unknown()),
      });
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/submissions/${segment(input.submissionId)}/review`,
        schema,
        { method: "POST", headers: { "idempotency-key": key("cfp-review", input.idempotencyKey) } },
      );
    },

    submit(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/submissions/${segment(input.submissionId)}/submit`,
        cfpSubmitResultSchema,
        {
          method: "POST",
          headers: { "idempotency-key": key("cfp-submit", input.idempotencyKey) },
          body: JSON.stringify({ expectedVersion: input.expectedVersion }),
        },
      );
    },

    getEvent(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/config`,
        eventSchema,
        { cache: "no-store", ...(input.signal === undefined ? {} : { signal: input.signal }) },
      );
    },

    getForm(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/forms/${segment(input.formId)}`,
        formSchema,
        { cache: "no-store", ...(input.signal === undefined ? {} : { signal: input.signal }) },
      );
    },

    saveEvent(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/config`,
        eventSchema,
        {
          method: "PUT",
          headers: { "idempotency-key": key("cfp-event-save", input.idempotencyKey) },
          body: JSON.stringify({ event: input.event, expectedVersion: input.expectedVersion }),
        },
      );
    },

    saveForm(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/forms/${segment(input.form.id)}`,
        formSchema,
        {
          method: "PUT",
          headers: { "idempotency-key": key("cfp-form-save", input.idempotencyKey) },
          body: JSON.stringify({ form: input.form, expectedVersion: input.expectedVersion }),
        },
      );
    },
    createForm(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/forms`,
        formSchema,
        {
          method: "POST",
          headers: { "idempotency-key": key("cfp-form-create", input.idempotencyKey) },
          body: JSON.stringify({ form: input.form }),
        },
      );
    },

    publishForm(input) {
      return request(
        `${apiBase}${resourcePath(input.organizationId, input.eventId)}/forms/${segment(input.formId)}/publish`,
        formSchema,
        {
          method: "POST",
          headers: { "idempotency-key": key("cfp-form-publish", input.idempotencyKey) },
          body: JSON.stringify({ expectedVersion: input.expectedVersion }),
        },
      );
    },
  };
}
