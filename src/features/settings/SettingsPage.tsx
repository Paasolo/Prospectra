import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/shared/Seo";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/errors";
import { authService } from "@/services/auth-service";

const schema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirm: z.string().min(12, "Password must be at least 12 characters"),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

type Values = z.infer<typeof schema>;

export function SettingsPage() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current: "", password: "", confirm: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setInfo(null);
    try {
      if (auth.status !== "authenticated" || !auth.email) {
        setError("This account has no email address, so the current password cannot be confirmed.");
        return;
      }
      await authService.signIn({ email: auth.email, password: values.current });
      await authService.updatePassword(values.password);
      form.reset();
      setInfo("Password updated.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <>
      <Seo title="Settings" />
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Account security for the signed-in user.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {auth.status === "loading" ? <p className="text-sm text-muted-foreground">Restoring session…</p> : null}
          {auth.status === "unconfigured" ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {auth.reason}
            </p>
          ) : null}
          {auth.status === "authenticated" ? (
            <p className="text-sm text-muted-foreground">Signed in as {auth.email || "an account with no email"}.</p>
          ) : null}
          {auth.status === "authenticated" ? (
            <form className="max-w-md space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="settings-current">Current password</Label>
                <Input id="settings-current" type="password" autoComplete="current-password" {...form.register("current")} />
                {form.formState.errors.current ? (
                  <p className="text-sm text-destructive">{form.formState.errors.current.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-password">New password</Label>
                <Input id="settings-password" type="password" autoComplete="new-password" {...form.register("password")} />
                {form.formState.errors.password ? (
                  <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-confirm">Confirm password</Label>
                <Input id="settings-confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
                {form.formState.errors.confirm ? (
                  <p className="text-sm text-destructive">{form.formState.errors.confirm.message}</p>
                ) : null}
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
