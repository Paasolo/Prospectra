import { ErrorCode } from "@prospectra/shared";
import { getSupabaseClient, getSupabaseInitResult } from "@/integrations/supabase/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type SignUpInput = {
  email: string;
  password: string;
  fullName: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

function requireConfiguredClient() {
  const init = getSupabaseInitResult();
  if (init.status === "unconfigured") {
    throw new AppError(ErrorCode.PROVIDER_UNCONFIGURED, init.reason);
  }
  return init.client;
}

export function passwordResetClientError(message: string): string | null {
  if (/rate|too many|over_email_send_rate_limit/i.test(message)) {
    return "Too many reset attempts. Try again later.";
  }
  if (/not found|no user|user does not|does not exist|invalid email/i.test(message)) {
    return null;
  }
  return "The reset email could not be sent. Try again shortly.";
}

export const authService = {
  getConfigurationState() {
    return getSupabaseInitResult();
  },

  async signUp({ email, password, fullName }: SignUpInput) {
    const client = requireConfiguredClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, error.message, { cause: error });
    }
    logger.info("User sign-up accepted by Supabase Auth", { userId: data.user?.id });
    return data;
  },

  async signIn({ email, password }: SignInInput) {
    const client = requireConfiguredClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, error.message, { cause: error });
    }
    logger.info("User signed in", { userId: data.user?.id });
    return data;
  },

  async signOut() {
    const client = getSupabaseClient();
    const { error } = await client.auth.signOut();
    if (error) {
      throw new AppError(ErrorCode.INTERNAL, error.message, { cause: error });
    }
  },

  async requestPasswordReset(email: string) {
    const client = requireConfiguredClient();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      const visible = passwordResetClientError(error.message);
      if (visible) {
        const code = visible.startsWith("Too many") ? ErrorCode.RATE_LIMITED : ErrorCode.PROVIDER_ERROR;
        throw new AppError(code, visible, { cause: error });
      }
      logger.warn("Password reset did not reveal whether the account exists");
    }
  },

  async updatePassword(password: string) {
    const client = requireConfiguredClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, error.message, { cause: error });
    }
  },

  async signInWithGoogle() {
    const client = requireConfiguredClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/app`,
      },
    });
    if (error) {
      throw new AppError(ErrorCode.PROVIDER_ERROR, error.message, { cause: error });
    }
    return data;
  },
};
