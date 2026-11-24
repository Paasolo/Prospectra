import type { AuthSessionState } from "@/types/auth";

export const RECOVERY_STORAGE_KEY = "prospectra.password-recovery";

export function recoveryIntentFromUrl(url: string): boolean {
  const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  const params = new URLSearchParams(hash);
  return params.get("type") === "recovery" && Boolean(params.get("access_token"));
}

export function rememberRecoveryIntent(url: string, storage: Pick<Storage, "getItem" | "setItem">): boolean {
  if (recoveryIntentFromUrl(url)) {
    storage.setItem(RECOVERY_STORAGE_KEY, "1");
    return true;
  }
  return storage.getItem(RECOVERY_STORAGE_KEY) === "1";
}

export function clearRecoveryIntent(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(RECOVERY_STORAGE_KEY);
}

export function resetPasswordView(status: AuthSessionState["status"], recovery: boolean) {
  if (status === "loading") return "loading" as const;
  if (status === "unconfigured") return "unconfigured" as const;
  if (status === "unauthenticated") return "invalid" as const;
  return recovery ? ("form" as const) : ("signed-in" as const);
}
