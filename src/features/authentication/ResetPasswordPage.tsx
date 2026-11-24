import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthFormCard } from "@/features/authentication/AuthFormCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/shared/Seo";
import { clearRecoveryIntent, rememberRecoveryIntent, resetPasswordView } from "@/features/authentication/recovery";
import { useAuth } from "@/hooks/use-auth";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { authService } from "@/services/auth-service";

const schema = z
  .object({
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirm: z.string().min(12, "Password must be at least 12 characters"),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

type Values = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(() => rememberRecoveryIntent(window.location.href, window.sessionStorage));
  const view = resetPasswordView(auth.status, recovery);

  useEffect(() => {
    const init = getSupabaseInitResult();
    if (init.status !== "configured") return;
    const { data } = init.client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await authService.updatePassword(values.password);
      clearRecoveryIntent(window.sessionStorage);
      setRecovery(false);
      navigate("/app");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <>
      <Seo title="Choose a new password" />
      <AuthFormCard
        title="Choose a new password"
        description="Use the link from the reset email. The password is saved only after Supabase Auth accepts it."
        footer={
          <Link className="text-sm text-primary hover:underline" to="/login">
            Back to login
          </Link>
        }
      >
        {view === "loading" ? <p className="text-sm text-muted-foreground">Checking the reset link.</p> : null}
        {view === "unconfigured" && auth.status === "unconfigured" ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {auth.reason}
          </p>
        ) : null}
        {view === "invalid" ? (
          <p className="text-sm text-muted-foreground">This reset link is invalid or has expired.</p>
        ) : null}
        {view === "signed-in" ? (
          <p className="text-sm text-muted-foreground">
            This page accepts a password reset link. Change the password for the current session from{" "}
            <Link className="text-primary hover:underline" to="/app/settings">
              Settings
            </Link>
            .
          </p>
        ) : null}
        {view === "form" ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
              {form.formState.errors.password ? (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
              {form.formState.errors.confirm ? (
                <p className="text-sm text-destructive">{form.formState.errors.confirm.message}</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save password"}
            </Button>
          </form>
        ) : null}
      </AuthFormCard>
    </>
  );
}
