import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthFormCard } from "@/features/authentication/AuthFormCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/shared/Seo";
import { getErrorMessage } from "@/lib/errors";
import { authService } from "@/services/auth-service";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type Values = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const config = authService.getConfigurationState();

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setInfo(null);
    try {
      if (config.status === "unconfigured") {
        setInfo(config.reason);
        return;
      }
      await authService.signIn(values);
      navigate("/app");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <>
      <Seo title="Log in" description="Sign in to your Prospectra workspace." />
      <AuthFormCard
        title="Welcome back"
        description="Sign in with your email and password."
        footer={
          <p className="text-sm text-muted-foreground">
            Need an account?{" "}
            <Link className="font-medium text-primary hover:underline" to="/register">
              Register
            </Link>
          </p>
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
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link className="text-xs text-primary hover:underline" to="/forgot-password">
                Forgot password?
              </Link>
            </div>
            <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={config.status === "unconfigured"}
          onClick={async () => {
            try {
              await authService.signInWithGoogle();
            } catch (err) {
              setError(getErrorMessage(err));
            }
          }}
        >
          Continue with Google
        </Button>
      </AuthFormCard>
    </>
  );
}
