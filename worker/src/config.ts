export type WorkerConfig = {
  port: number;
  nodeEnv: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  openaiApiKey?: string;
  openaiModel: string;
  allowedOrigins: string[];
  companyProvider?: string;
  companyApiKey?: string;
  contactProvider?: string;
  contactApiKey?: string;
  enrichmentProvider?: string;
  enrichmentApiKey?: string;
  emailVerificationProvider?: string;
  emailVerificationApiKey?: string;
  credentialKey?: string;
  publicUrl?: string;
  appUrl?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  googleCalendarClientId?: string;
  googleCalendarClientSecret?: string;
  microsoftCalendarClientId?: string;
  microsoftCalendarClientSecret?: string;
  resendApiKey?: string;
  webhookSecret?: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  paystackSecretKey?: string;
  paystackWebhookSecret?: string;
};

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const portRaw = env.WORKER_PORT ?? "8787";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid WORKER_PORT: ${portRaw}`);
  }

  const allowedOrigins = (env.WORKER_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    nodeEnv: env.NODE_ENV ?? "development",
    supabaseUrl: optional(env.SUPABASE_URL),
    supabaseAnonKey: optional(env.SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: optional(env.SUPABASE_SERVICE_ROLE_KEY),
    openaiApiKey: optional(env.OPENAI_API_KEY),
    openaiModel: optional(env.OPENAI_MODEL) ?? "gpt-4.1-mini",
    allowedOrigins,
    companyProvider: optional(env.COMPANY_DATA_PROVIDER)?.toLowerCase(),
    companyApiKey: optional(env.COMPANY_DATA_PROVIDER_API_KEY),
    contactProvider: optional(env.CONTACT_DATA_PROVIDER)?.toLowerCase(),
    contactApiKey: optional(env.CONTACT_DATA_PROVIDER_API_KEY),
    enrichmentProvider: optional(env.ENRICHMENT_PROVIDER)?.toLowerCase(),
    enrichmentApiKey: optional(env.ENRICHMENT_PROVIDER_API_KEY),
    emailVerificationProvider: optional(env.EMAIL_VERIFICATION_PROVIDER)?.toLowerCase(),
    emailVerificationApiKey: optional(env.EMAIL_VERIFICATION_PROVIDER_API_KEY),
    credentialKey: optional(env.WORKER_CREDENTIAL_KEY),
    publicUrl: optional(env.WORKER_PUBLIC_URL),
    appUrl: optional(env.APP_URL) ?? optional(env.VITE_APP_URL),
    googleClientId: optional(env.GOOGLE_OAUTH_CLIENT_ID),
    googleClientSecret: optional(env.GOOGLE_OAUTH_CLIENT_SECRET),
    microsoftClientId: optional(env.MICROSOFT_OAUTH_CLIENT_ID),
    microsoftClientSecret: optional(env.MICROSOFT_OAUTH_CLIENT_SECRET),
    googleCalendarClientId: optional(env.GOOGLE_CALENDAR_CLIENT_ID) ?? optional(env.GOOGLE_OAUTH_CLIENT_ID),
    googleCalendarClientSecret: optional(env.GOOGLE_CALENDAR_CLIENT_SECRET) ?? optional(env.GOOGLE_OAUTH_CLIENT_SECRET),
    microsoftCalendarClientId: optional(env.MICROSOFT_CALENDAR_CLIENT_ID) ?? optional(env.MICROSOFT_OAUTH_CLIENT_ID),
    microsoftCalendarClientSecret: optional(env.MICROSOFT_CALENDAR_CLIENT_SECRET) ?? optional(env.MICROSOFT_OAUTH_CLIENT_SECRET),
    resendApiKey: optional(env.EMAIL_PROVIDER_API_KEY),
    webhookSecret: optional(env.WORKER_WEBHOOK_SECRET),
    stripeSecretKey: optional(env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: optional(env.STRIPE_WEBHOOK_SECRET),
    paystackSecretKey: optional(env.PAYSTACK_SECRET_KEY),
    paystackWebhookSecret: optional(env.PAYSTACK_WEBHOOK_SECRET),
  };
}

export type ProviderDescriptor = {
  id: string;
  role: "company_discovery" | "contact_discovery" | "enrichment" | "email_verification";
  state: "configured" | "unconfigured" | "misconfigured";
  detail: string;
};

const DISCOVERY_ADAPTERS = ["enrichlayer", "apollo"] as const;
const EMAIL_VERIFICATION_ADAPTERS = ["hunter"] as const;

function describeAdapter(input: {
  id: string;
  role: ProviderDescriptor["role"];
  selected?: string;
  apiKey?: string;
  supported: readonly string[];
  preferred: string;
}): ProviderDescriptor {
  const available = input.supported.join(", ");
  if (!input.selected && !input.apiKey) {
    return {
      id: input.preferred,
      role: input.role,
      state: "unconfigured",
      detail: `Set ${input.id}=${input.preferred} and the matching API key to enable this provider.`,
    };
  }
  if (input.selected && !input.supported.includes(input.selected)) {
    return {
      id: input.selected,
      role: input.role,
      state: "misconfigured",
      detail: `No adapter is installed for ${input.selected}. Available adapters: ${available}.`,
    };
  }
  if (!input.apiKey || !input.selected) {
    return {
      id: input.preferred,
      role: input.role,
      state: "misconfigured",
      detail: `Set both ${input.id} (one of: ${available}) and its API key.`,
    };
  }
  return {
    id: input.selected,
    role: input.role,
    state: "configured",
    detail: `${input.selected} is configured.`,
  };
}

export function describeProviders(config: WorkerConfig): ProviderDescriptor[] {
  const enrichmentProvider =
    config.enrichmentProvider ??
    (config.contactProvider && DISCOVERY_ADAPTERS.includes(config.contactProvider as (typeof DISCOVERY_ADAPTERS)[number])
      ? config.contactProvider
      : undefined);
  const enrichmentKey =
    config.enrichmentApiKey ??
    (enrichmentProvider && enrichmentProvider === config.contactProvider ? config.contactApiKey : undefined);
  return [
    describeAdapter({
      id: "COMPANY_DATA_PROVIDER",
      role: "company_discovery",
      selected: config.companyProvider,
      apiKey: config.companyApiKey,
      supported: DISCOVERY_ADAPTERS,
      preferred: "enrichlayer",
    }),
    describeAdapter({
      id: "CONTACT_DATA_PROVIDER",
      role: "contact_discovery",
      selected: config.contactProvider,
      apiKey: config.contactApiKey,
      supported: DISCOVERY_ADAPTERS,
      preferred: "enrichlayer",
    }),
    describeAdapter({
      id: "ENRICHMENT_PROVIDER",
      role: "enrichment",
      selected: enrichmentProvider,
      apiKey: enrichmentKey,
      supported: DISCOVERY_ADAPTERS,
      preferred: "enrichlayer",
    }),
    describeAdapter({
      id: "EMAIL_VERIFICATION_PROVIDER",
      role: "email_verification",
      selected: config.emailVerificationProvider,
      apiKey: config.emailVerificationApiKey,
      supported: EMAIL_VERIFICATION_ADAPTERS,
      preferred: "hunter",
    }),
  ];
}
