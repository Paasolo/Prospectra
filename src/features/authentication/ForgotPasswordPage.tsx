import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { AuthFormCard } from "@/features/authentication/AuthFormCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/shared/Seo";
import { getErrorMessage } from "@/lib/errors";
import { authService } from "@/services/auth-service";

const schema = z.object({ email: z.string().email("Enter a valid email") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const config = authService.getConfigurationState();

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setInfo(null);
    try {
      if (config.status === "unconfigured") {
        return;
      }
      await authService.requestPasswordReset(values.email);
      setInfo("If an account exists for that email, a reset link has been sent.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <>
      <Seo title="Forgot password" />
      <AuthFormCard
        title="Reset password"
        description="We will email a reset link when Supabase Auth is configured."
        footer={
          <Link className="text-sm text-primary hover:underline" to="/login">
            Back to login
          </Link>
        }
      >
        {config.status === "unconfigured" ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {config.reason}
          </p>
        ) : null}
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </AuthFormCard>
    </>
  );
}
