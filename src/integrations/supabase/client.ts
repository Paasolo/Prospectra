import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ErrorCode } from "@prospectra/shared";
import { rememberRecoveryIntent } from "@/features/authentication/recovery";
import { AppError } from "@/lib/errors";
import { getClientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | null = null;

export type SupabaseInitResult =
  | { status: "configured"; client: SupabaseClient<Database> }
  | { status: "unconfigured"; reason: string };

export function getSupabaseInitResult(): SupabaseInitResult {
  const env = getClientEnv();

  if (!env.isSupabaseConfigured || !env.supabaseUrl || !env.supabaseAnonKey) {
    return {
      status: "unconfigured",
      reason:
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.",
    };
  }

  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    if (typeof window !== "undefined") {
      rememberRecoveryIntent(window.location.href, window.sessionStorage);
    }
    logger.info("Supabase client initialised");
  }

  return { status: "configured", client };
}

export function getSupabaseClient(): SupabaseClient<Database> {
  const result = getSupabaseInitResult();
  if (result.status === "unconfigured") {
    throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, result.reason);
  }
  return result.client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseInitResult().status === "configured";
}
