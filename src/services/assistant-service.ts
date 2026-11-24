import { assistantOutputSchema, type AssistantContext, type AssistantOutput } from "@prospectra/shared";
import { z } from "zod";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { AppError, getErrorMessage } from "@/lib/errors";
import { ErrorCode } from "@prospectra/shared";
import { getClientEnv } from "@/lib/env";
import type { Json } from "@/types/database";

const responseSchema = z.object({
  deduplicated: z.boolean(),
  messageId: z.string(),
  output: assistantOutputSchema,
  model: z.string().nullable().optional(),
  usage: z.unknown().optional(),
});

export type AssistantResponse = z.infer<typeof responseSchema>;

async function authorizedWorker(path: string, body: unknown, stream: boolean) {
  const env = getClientEnv();
  if (!env.workerUrl) {
    throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, "Set VITE_WORKER_URL before using the assistant.");
  }
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, "Sign in to continue.");
  }
  const response = await fetch(new URL(path, env.workerUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!stream) {
    const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    if (!response.ok) {
      throw new AppError(ErrorCode.PROVIDER_ERROR, payload?.message ?? "The assistant request failed.");
    }
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(ErrorCode.AI_OUTPUT_INVALID, "The assistant returned an unexpected response.");
    }
    return { response: parsed.data, raw: "" };
  }
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new AppError(ErrorCode.PROVIDER_ERROR, payload?.message ?? "The assistant request failed.");
  }
  return { response, raw: "" };
}

export const assistantService = {
  async list(workspaceId: string) {
    const { data, error } = await getSupabaseClient().from("ai_conversations").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message);
    }
    return data ?? [];
  },

  async messages(conversationId: string) {
    const { data, error } = await getSupabaseClient().from("ai_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message);
    }
    return data ?? [];
  },

  async create(workspaceId: string, context: AssistantContext) {
    const { data, error } = await getSupabaseClient()
      .from("ai_conversations")
      .insert({ workspace_id: workspaceId, title: "New conversation", context: context as unknown as Json })
      .select("*")
      .single();
    if (error || !data) {
      throw new AppError(ErrorCode.INTERNAL, error?.message ?? "The conversation could not be created.");
    }
    return data;
  },

  async updateContext(conversationId: string, context: AssistantContext, title?: string) {
    const { error } = await getSupabaseClient()
      .from("ai_conversations")
      .update({ context: context as unknown as Json, ...(title ? { title } : {}) })
      .eq("id", conversationId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message);
    }
  },

  async remove(conversationId: string) {
    const { error } = await getSupabaseClient().from("ai_conversations").delete().eq("id", conversationId);
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message);
    }
  },

  async send(input: { workspaceId: string; conversationId: string; content: string; onDelta?: (text: string) => void }): Promise<AssistantResponse> {
    const stream = Boolean(input.onDelta);
    const result = await authorizedWorker("/v1/assistant/messages", { workspaceId: input.workspaceId, conversationId: input.conversationId, content: input.content, stream }, stream);
    if (!stream) {
      return result.response as AssistantResponse;
    }
    const response = result.response as Response;
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let donePayload: AssistantResponse | null = null;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = part.match(/^event: (.+)$/m)?.[1];
        const data = part.match(/^data: (.+)$/m)?.[1];
        if (!data) {
          continue;
        }
        const parsed = JSON.parse(data) as { text?: string; message?: string };
        if (event === "delta" && parsed.text) {
          input.onDelta?.(parsed.text);
        }
        if (event === "error") {
          throw new AppError(ErrorCode.AI_OUTPUT_INVALID, parsed.message ?? "The assistant response failed validation.");
        }
        if (event === "done") {
          const checked = responseSchema.safeParse(JSON.parse(data));
          if (!checked.success) {
            throw new AppError(ErrorCode.AI_OUTPUT_INVALID, "The assistant returned an unexpected response.");
          }
          donePayload = checked.data;
        }
      }
    }
    if (!donePayload) {
      throw new AppError(ErrorCode.PROVIDER_ERROR, "The assistant stream ended before a validated response.");
    }
    return donePayload;
  },
};

export function outputFromMessage(value: Json | null): AssistantOutput | null {
  const parsed = assistantOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function assistantError(error: unknown): string {
  return getErrorMessage(error);
}
