import { ErrorCode, type ErrorCodeValue } from "@prospectra/shared";
import type { ZodType } from "zod";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import { getClientEnv } from "@/lib/env";

export async function postWorker<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const env = getClientEnv();
  if (!env.workerUrl) {
    throw new AppError(
      ErrorCode.PROVIDER_UNCONFIGURED,
      "The Prospectra worker is not configured. Set VITE_WORKER_URL to the worker origin. The browser does not call external websites directly.",
    );
  }
  const init = getSupabaseInitResult();
  if (init.status === "unconfigured") {
    throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, init.reason);
  }
  const { data } = await init.client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, "Sign in to continue.");
  }

  const response = await fetch(new URL(path, env.workerUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (!response.ok) {
    const code = isErrorCode(payload?.code) ? payload.code : ErrorCode.PROVIDER_ERROR;
    throw new AppError(code, payload?.message ?? "The worker request failed.");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(ErrorCode.AI_OUTPUT_INVALID, "The worker returned an unexpected response.");
  }
  return parsed.data;
}

export async function getWorker<T>(path: string, schema: ZodType<T>): Promise<T> {
  const env = getClientEnv();
  if (!env.workerUrl) {
    throw new AppError(
      ErrorCode.PROVIDER_UNCONFIGURED,
      "The Prospectra worker is not configured. Set VITE_WORKER_URL to the worker origin.",
    );
  }
  const init = getSupabaseInitResult();
  if (init.status === "unconfigured") {
    throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, init.reason);
  }
  const { data } = await init.client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, "Sign in to continue.");
  }
  const response = await fetch(new URL(path, env.workerUrl), {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (!response.ok) {
    const code = isErrorCode(payload?.code) ? payload.code : ErrorCode.PROVIDER_ERROR;
    throw new AppError(code, payload?.message ?? "The worker request failed.");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_FAILED, "The worker returned an unexpected response.");
  }
  return parsed.data;
}

function isErrorCode(value: string | undefined): value is ErrorCodeValue {
  return Boolean(value && Object.values(ErrorCode).includes(value as ErrorCodeValue));
}
