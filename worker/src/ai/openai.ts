import { estimateModelCostUsd, type AnalysisUsage } from "@prospectra/shared";
import { z } from "zod";

export class AiOutputError extends Error {
  readonly code = "AI_OUTPUT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

const completionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

export async function createStructuredCompletion<T>(input: {
  apiKey: string;
  model: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  messages: Array<{ role: "system" | "user"; content: string }>;
  parse: (value: unknown) => T;
  fetchImpl?: typeof fetch;
  maxTokens?: number;
  onDelta?: (text: string) => void;
  organization?: string;
}): Promise<{ data: T; model: string; usage: AnalysisUsage }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const organization = input.organization?.trim() || process.env.OPENAI_ORG_ID?.trim();
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
      ...(organization ? { "OpenAI-Organization": organization } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.jsonSchema,
        },
      },
      ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
      ...(input.onDelta ? { stream: true, stream_options: { include_usage: true } } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (input.onDelta) {
    return completeFromStream(response, input);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new AiOutputError("OpenAI returned invalid JSON.");
  }
  const completion = completionSchema.safeParse(payload);
  if (!completion.success) {
    throw new AiOutputError("OpenAI returned an unexpected completion.");
  }
  const message = completion.data.choices[0]?.message;
  if (message?.refusal) {
    throw new AiOutputError("The model declined to produce an analysis.");
  }
  if (!message?.content) {
    throw new AiOutputError("The model returned an empty analysis.");
  }

  let structured: unknown;
  try {
    structured = JSON.parse(message.content) as unknown;
  } catch {
    throw new AiOutputError("The model did not return JSON.");
  }

  let data: T;
  try {
    data = input.parse(structured);
  } catch {
    throw new AiOutputError("The model output failed schema validation.");
  }

  const promptTokens = completion.data.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.data.usage?.completion_tokens ?? 0;
  const model = completion.data.model || input.model;
  return {
    data,
    model,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: completion.data.usage?.total_tokens ?? promptTokens + completionTokens,
      estimatedCostUsd: estimateModelCostUsd(model, promptTokens, completionTokens),
    },
  };
}

async function completeFromStream<T>(
  response: Response,
  input: { model: string; parse: (value: unknown) => T; onDelta?: (text: string) => void },
): Promise<{ data: T; model: string; usage: AnalysisUsage }> {
  if (!response.ok || !response.body) {
    throw new Error(`OpenAI request failed (${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let model = input.model;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") {
        continue;
      }
      let event: {
        model?: string;
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      try {
        event = JSON.parse(data) as typeof event;
      } catch {
        throw new AiOutputError("The model stream was not valid JSON.");
      }
      if (event.model) {
        model = event.model;
      }
      const delta = event.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        content += delta;
        input.onDelta?.(delta);
      }
      if (event.usage) {
        promptTokens = event.usage.prompt_tokens ?? promptTokens;
        completionTokens = event.usage.completion_tokens ?? completionTokens;
        totalTokens = event.usage.total_tokens ?? totalTokens;
      }
    }
  }
  let structured: unknown;
  try {
    structured = JSON.parse(content) as unknown;
  } catch {
    throw new AiOutputError("The model did not return JSON.");
  }
  let parsed: T;
  try {
    parsed = input.parse(structured);
  } catch {
    throw new AiOutputError("The model output failed schema validation.");
  }
  return {
    data: parsed,
    model,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: totalTokens || promptTokens + completionTokens,
      estimatedCostUsd: estimateModelCostUsd(model, promptTokens, completionTokens),
    },
  };
}
