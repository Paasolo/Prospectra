import { ContentPage } from "@/features/marketing/ContentPage";

type LegalPageProps = {
  variant: "privacy" | "terms";
};

export function LegalPage({ variant }: LegalPageProps) {
  const isPrivacy = variant === "privacy";

  return (
    <ContentPage
      title={isPrivacy ? "Privacy Policy" : "Terms of Service"}
      description={
        isPrivacy
          ? "How Prospectra handles personal and workspace data. This summary will expand with counsel-reviewed policy text before production launch."
          : "The agreement governing use of Prospectra. This summary will expand with counsel-reviewed terms before production launch."
      }
    >
      <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
        {isPrivacy ? (
          <>
            <p>
              Prospectra processes account, workspace, and prospecting data to provide the service. Tenant data is
              isolated by workspace membership and protected with row-level security.
            </p>
            <p>
              We support data export and deletion workflows. Cold outreach features include suppressions and unsubscribe
              handling. Public business emails are not assumed to authorise marketing by default.
            </p>
            <p>
              Applicable frameworks may include Ghana&apos;s Data Protection Act and GDPR/UK GDPR where relevant.
              Contact us for data protection enquiries once production support channels are live.
            </p>
          </>
        ) : (
          <>
            <p>
              By creating an account you agree to use Prospectra lawfully, respect provider acceptable-use policies, and
              not attempt to bypass workspace isolation or credit accounting.
            </p>
            <p>
              Service availability, plan limits, and integration behaviour depend on configured providers. Prospectra
              does not guarantee third-party data completeness.
            </p>
            <p>
              These interim terms are a product placeholder for development. Production deployments require final legal
              review.
            </p>
          </>
        )}
      </div>
    </ContentPage>
  );
}
