import { describe, expect, it } from "vitest";
import {
  createOpenAiResponsesBinding,
  DEFAULT_OPENAI_EVALUATION_MODEL,
  DEFAULT_OPENAI_RESPONSES_MODEL,
} from "./openai";

const SYNTHETIC_PROMPT = 'Return only {"ok":true} JSON.';

function responseBody(text: string): Record<string, unknown> {
  return {
    id: "resp_test",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}

describe("OpenAI Responses advisory binding", () => {
  it("sends backend-authenticated JSON-mode requests and extracts REST output text", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const binding = createOpenAiResponsesBinding({
      apiKey: "test-secret-never-print",
      fetch: async (input, init) => {
        calls.push({ input, init });
        return Response.json(responseBody('{"ok":true}'));
      },
    });

    await expect(
      binding.run("gpt-test", {
        prompt: SYNTHETIC_PROMPT,
        response_format: { type: "json_object" },
        reasoning: { effort: "medium" },
        temperature: 0,
      }),
    ).resolves.toEqual({ response: '{"ok":true}' });

    expect(String(calls[0]?.input)).toBe("https://api.openai.com/v1/responses");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-secret-never-print");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      model: "gpt-test",
      input: SYNTHETIC_PROMPT,
      text: { format: { type: "json_object" } },
      reasoning: { effort: "medium" },
      temperature: 0,
    });
  });

  it("uses GPT-5.6 Sol as the default evaluation model", () => {
    expect(DEFAULT_OPENAI_EVALUATION_MODEL).toBe("gpt-5.6-sol");
  });

  it("maps strict JSON schemas to the Responses text format", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const binding = createOpenAiResponsesBinding({
      apiKey: "test-key",
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json(responseBody('{"ok":true}'));
      },
    });
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    };

    await binding.run("gpt-test", {
      prompt: SYNTHETIC_PROMPT,
      response_format: {
        type: "json_schema",
        name: "synthetic_result",
        strict: true,
        schema,
      },
    });

    expect(requestBody).toMatchObject({
      text: {
        format: {
          type: "json_schema",
          name: "synthetic_result",
          strict: true,
          schema,
        },
      },
    });
  });

  it("joins output_text items and ignores other response items", async () => {
    const binding = createOpenAiResponsesBinding({
      apiKey: "test-key",
      fetch: async () =>
        Response.json({
          output: [
            { type: "reasoning", content: [] },
            {
              type: "message",
              content: [
                { type: "refusal", refusal: "ignored" },
                { type: "output_text", text: '{"ok":' },
                { type: "output_text", text: "true}" },
              ],
            },
          ],
        }),
    });

    await expect(binding.run("gpt-test", { prompt: SYNTHETIC_PROMPT })).resolves.toEqual({
      response: '{"ok":true}',
    });
  });

  it("surfaces sanitized status-only failures", async () => {
    const secret = "test-secret-never-leak";
    const binding = createOpenAiResponsesBinding({
      apiKey: secret,
      fetch: async () => new Response(`provider body contains ${secret}`, { status: 429 }),
    });

    const failure = binding.run("gpt-test", { prompt: SYNTHETIC_PROMPT });
    await expect(failure).rejects.toMatchObject({ status: 429, retryable: true });
    await expect(failure).rejects.not.toThrow(secret);
  });

  it("rejects malformed REST output without exposing response content", async () => {
    const binding = createOpenAiResponsesBinding({
      apiKey: "test-key",
      fetch: async () => Response.json({ output: [{ type: "message", content: [] }] }),
    });

    await expect(binding.run("gpt-test", { prompt: SYNTHETIC_PROMPT })).rejects.toMatchObject({
      code: "AI_INVALID_OUTPUT",
      retryable: false,
    });
  });

  it("sanitizes transport and abort failures", async () => {
    const secret = "transport-secret-never-leak";
    const binding = createOpenAiResponsesBinding({
      apiKey: "test-key",
      fetch: async () => {
        throw new Error(secret);
      },
    });

    const failure = binding.run("gpt-test", { prompt: SYNTHETIC_PROMPT });
    await expect(failure).rejects.toMatchObject({ retryable: true });
    await expect(failure).rejects.not.toThrow(secret);
  });
});

const liveTest = process.env.RUN_OPENAI_LIVE === "1" ? it : it.skip;
liveTest("returns synthetic JSON through the real OpenAI Responses API", async () => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required when RUN_OPENAI_LIVE=1.");
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_RESPONSES_MODEL;
  const binding = createOpenAiResponsesBinding({ apiKey });
  const result = await binding.run(model, { prompt: SYNTHETIC_PROMPT });
  if (
    typeof result !== "object" ||
    result === null ||
    !("response" in result) ||
    typeof result.response !== "string"
  ) {
    throw new Error("OpenAI Responses adapter returned an invalid envelope.");
  }
  expect(JSON.parse(result.response)).toEqual({ ok: true });
});
