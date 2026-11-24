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

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string().min(12, "Password must be at least 12 characters"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Values = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
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
      const result = await authService.signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });
      if (result.session) {
        navigate("/onboarding");
        return;
      }
      setInfo("Check your email to verify your account before signing in.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <>
      <Seo title="Register" description="Create your Prospectra account." />
      <AuthFormCard
        title="Create your account"
        description="Start with a free workspace and configure providers when ready."
        footer={
          <p className="text-sm text-muted-foreground">
            Already registered?{" "}
            <Link className="font-medium text-primary hover:underline" to="/login">
              Log in
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
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" autoComplete="name" {...form.register("fullName")} />
            {form.formState.errors.fullName ? (
              <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
            {form.formState.errors.password ? (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword ? (
              <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </AuthFormCard>
    </>
  );
}
