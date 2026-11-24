import { unknownTemplateVariables, unsupportedPersonalClaims } from "@prospectra/shared";

export function TemplateIssues({ subject, body }: { subject: string; body: string }) {
  const unknown = unknownTemplateVariables(`${subject}\n${body}`);
  const claims = unsupportedPersonalClaims(`${subject}\n${body}`, "");
  if (unknown.length === 0 && claims.length === 0) {
    return null;
  }
  return (
    <div role="alert" className="space-y-1 text-sm text-destructive">
      {unknown.length > 0 ? <p>Unknown variables: {unknown.join(", ")}.</p> : null}
      {claims.length > 0 ? <p>Unsupported personal claims must be removed before sending.</p> : null}
    </div>
  );
}
