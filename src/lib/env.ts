import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return value;
};

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  VITE_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  VITE_APP_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  VITE_DEMO_MODE: z
    .preprocess(emptyToUndefined, z.enum(["true", "false"]).optional())
    .transform((value) => value === "true"),
  VITE_WORKER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export type ClientEnv = {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  appUrl: string;
  demoMode: boolean;
  workerUrl: string | undefined;
  isSupabaseConfigured: boolean;
};

export function getClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_APP_URL: import.meta.env.VITE_APP_URL,
    VITE_DEMO_MODE: import.meta.env.VITE_DEMO_MODE,
    VITE_WORKER_URL: import.meta.env.VITE_WORKER_URL,
  });

  if (!parsed.success) {
    throw new Error(`Invalid client environment: ${parsed.error.message}`);
  }

  const supabaseUrl = parsed.data.VITE_SUPABASE_URL;
  const supabaseAnonKey = parsed.data.VITE_SUPABASE_ANON_KEY;

  return {
    supabaseUrl,
    supabaseAnonKey,
    appUrl:
      parsed.data.VITE_APP_URL ??
      (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5173"),
    demoMode: parsed.data.VITE_DEMO_MODE,
    workerUrl: parsed.data.VITE_WORKER_URL,
    isSupabaseConfigured: Boolean(supabaseUrl && supabaseAnonKey),
  };
}
