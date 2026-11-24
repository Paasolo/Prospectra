import { z } from "zod";

export const providerConfigurationStateSchema = z.enum([
  "configured",
  "unconfigured",
  "misconfigured",
  "disabled",
]);

export type ProviderConfigurationState = z.infer<typeof providerConfigurationStateSchema>;

export const jobStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
  "cancelled",
]);

export type JobStatus = z.infer<typeof jobStatusSchema>;

export const healthResponseSchema = z.object({
  service: z.literal("prospectra-worker"),
  status: z.enum(["ok", "degraded", "unhealthy"]),
  version: z.string(),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
