import { type CloudflareAiBinding, CloudflareAiProviderError } from "./cloudflare";

export const DEFAULT_OPENAI_RESPONSES_MODEL = "gpt-5.6-terra";
export const DEFAULT_OPENAI_EVALUATION_MODEL = "gpt-5.6-sol";
const DEFAULT_OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const JSON_RESPONSE_FORMAT = { type: "json_object" } as const;

export interface OpenAiResponsesBindingOptions {
  readonly apiKey: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly endpoint?: string;
}

/**
 * Creates a backend-only structural binding for the OpenAI Responses API.
 * The returned binding is consumed by the existing advisory provider factory.
 */
export function createOpenAiResponsesBinding(
  options: OpenAiResponsesBindingOptions,
): CloudflareAiBinding {
  if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
    throw new TypeError("OpenAI API key is required.");
  }

  const apiKey = options.apiKey.trim();
  const endpoint = normalizeEndpoint(options.endpoint);
  const requestFetch =
    options.fetch ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  return {
    async run(model: string, inputs: Record<string, unknown>): Promise<unknown> {
      const prompt = inputs.prompt;
      if (typeof prompt !== "string" || prompt.trim().length === 0) {
        throw invalidResponsesOutput();
      }
      if (typeof model !== "string" || model.trim().length === 0) {
        throw invalidResponsesOutput();
      }
      const reasoning = openAiReasoning(inputs.reasoning);
      const temperature = openAiTemperature(inputs.temperature);
      const responseFormat = openAiResponseFormat(inputs.response_format);

      let response: Response;
      try {
        response = await requestFetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: prompt,
            store: false,
            text: { format: responseFormat },
            ...(reasoning === undefined ? {} : { reasoning }),
            ...(temperature === undefined ? {} : { temperature }),
          }),
        });
      } catch {
        throw requestFailure();
      }

      if (!response.ok) {
        throw requestFailure(response.status);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw invalidResponsesOutput();
      }

      const text = extractOutputText(body);
      return { response: text };
    },
  };
}

function openAiResponseFormat(value: unknown): Record<string, unknown> {
  if (value === undefined) return JSON_RESPONSE_FORMAT;
  if (!isRecord(value)) throw invalidResponsesOutput();
  if (value.type === "json_object") return JSON_RESPONSE_FORMAT;
  if (
    value.type !== "json_schema" ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    value.strict !== true ||
    !isRecord(value.schema)
  ) {
    throw invalidResponsesOutput();
  }
  return {
    type: "json_schema",
    name: value.name,
    strict: true,
    schema: value.schema,
  };
}
function openAiReasoning(value: unknown): { effort: string } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.effort !== "string") {
    throw invalidResponsesOutput();
  }
  if (!["none", "low", "medium", "high", "xhigh", "max"].includes(value.effort)) {
    throw invalidResponsesOutput();
  }
  return { effort: value.effort };
}

function openAiTemperature(value: unknown): 0 | undefined {
  if (value === undefined) return undefined;
  if (value !== 0) throw invalidResponsesOutput();
  return 0;
}

function normalizeEndpoint(value: string | undefined): string {
  if (value === undefined) return DEFAULT_OPENAI_RESPONSES_ENDPOINT;
  const endpoint = value.trim();
  if (endpoint.length === 0 || endpoint.length > 500) {
    throw new TypeError("OpenAI Responses endpoint is invalid.");
  }
  return endpoint;
}

function extractOutputText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.output)) {
    throw invalidResponsesOutput();
  }

  const textParts: string[] = [];
  for (const outputItem of body.output) {
    if (!isRecord(outputItem) || outputItem.type !== "message") continue;
    if (!Array.isArray(outputItem.content)) throw invalidResponsesOutput();

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem) || contentItem.type !== "output_text") continue;
      if (typeof contentItem.text !== "string" || contentItem.text.trim().length === 0) {
        throw invalidResponsesOutput();
      }
      textParts.push(contentItem.text);
    }
  }

  if (textParts.length === 0) throw invalidResponsesOutput();
  return textParts.join("");
}

function requestFailure(status?: number): OpenAiResponsesBindingError {
  return new OpenAiResponsesBindingError({
    ...(status === undefined ? {} : { status }),
    retryable: status === undefined || retryableStatus(status),
  });
}

function invalidResponsesOutput(): CloudflareAiProviderError {
  return new CloudflareAiProviderError(
    "AI_INVALID_OUTPUT",
    "AI provider returned invalid advisory output.",
    { retryable: false },
  );
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

class OpenAiResponsesBindingError extends Error {
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(options: { readonly retryable: boolean; readonly status?: number }) {
    super("AI provider request failed.");
    this.name = "OpenAiResponsesBindingError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
