import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ProspectraLogo } from "@/components/brand/ProspectraLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AuthFormCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthFormCard({ title, description, children, footer }: AuthFormCardProps) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <Link to="/" className="mb-8 self-center">
        <ProspectraLogo />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {children}
          {footer}
        </CardContent>
      </Card>
    </div>
  );
}
