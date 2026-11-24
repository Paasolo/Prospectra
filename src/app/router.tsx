import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthenticatedLayout } from "@/app/layouts/AuthenticatedLayout";
import { MarketingLayout } from "@/app/layouts/MarketingLayout";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { ForgotPasswordPage } from "@/features/authentication/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/authentication/ResetPasswordPage";
import { LoginPage } from "@/features/authentication/LoginPage";
import { RegisterPage } from "@/features/authentication/RegisterPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { WelcomePage } from "@/features/dashboard/WelcomePage";
import { AboutPage } from "@/features/marketing/AboutPage";
import { BlogPage } from "@/features/marketing/BlogPage";
import { ContactPage } from "@/features/marketing/ContactPage";
import { FeaturesPage } from "@/features/marketing/FeaturesPage";
import { HomePage } from "@/features/marketing/HomePage";
import { LegalPage } from "@/features/marketing/LegalPage";
import { PricingPage } from "@/features/marketing/PricingPage";
import { SolutionsPage } from "@/features/marketing/SolutionsPage";
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { DiscoveryPage } from "@/features/discovery/DiscoveryPage";
import { EnrichmentPage } from "@/features/enrichment/EnrichmentPage";
import { IcpEditorPage } from "@/features/icp/IcpEditorPage";
import { IcpPage } from "@/features/icp/IcpPage";
import { ListsPage } from "@/features/lists/ListsPage";
import { ImportProspectsPage } from "@/features/prospects/ImportProspectsPage";
import { ProspectDetailPage } from "@/features/prospects/ProspectDetailPage";
import { ProspectsPage } from "@/features/prospects/ProspectsPage";
import { AssistantPage } from "@/features/assistant/AssistantPage";
import { CampaignBuilderPage } from "@/features/campaigns/CampaignBuilderPage";
import { CampaignsPage } from "@/features/campaigns/CampaignsPage";
import { EmailStudioPage } from "@/features/email/EmailStudioPage";
import { IntegrationsPage } from "@/features/email/IntegrationsPage";
import { InboxPage } from "@/features/inbox/InboxPage";
import { MeetingsPage } from "@/features/meetings/MeetingsPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { PerformancePage, ReportsPage } from "@/features/analytics/AnalyticsPages";
import { BillingPage } from "@/features/billing/BillingPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { AgentPage } from "@/features/agent/AgentPage";
import { AgentRunPage } from "@/features/agent/AgentRunPage";
import { WebsiteAnalysisDetailPage } from "@/features/website-analysis/WebsiteAnalysisDetailPage";
import { WebsiteAnalysisPage } from "@/features/website-analysis/WebsiteAnalysisPage";
import { HealthPage } from "@/features/system/HealthPage";
import { TeamPage } from "@/features/workspaces/TeamPage";
import { WorkspaceProvider } from "@/features/workspaces/WorkspaceProvider";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route index element={<HomePage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="solutions" element={<SolutionsPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="blog" element={<BlogPage />} />
          <Route path="privacy" element={<LegalPage variant="privacy" />} />
          <Route path="terms" element={<LegalPage variant="terms" />} />
        </Route>

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="health" element={<HealthPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="admin" element={<AdminPage />} />
          <Route
            path="app"
            element={
              <WorkspaceProvider>
                <AuthenticatedLayout />
              </WorkspaceProvider>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="welcome" element={<WelcomePage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="agent" element={<AgentPage />} />
            <Route path="agent/:runId" element={<AgentRunPage />} />
            <Route path="discover/companies" element={<DiscoveryPage kind="company" />} />
            <Route path="discover/contacts" element={<DiscoveryPage kind="contact" />} />
            <Route path="prospects" element={<ProspectsPage />} />
            <Route path="prospects/import" element={<ImportProspectsPage />} />
            <Route path="prospects/:prospectId" element={<ProspectDetailPage />} />
            <Route path="lists" element={<ListsPage />} />
            <Route path="icp" element={<IcpPage />} />
            <Route path="icp/new" element={<IcpEditorPage />} />
            <Route path="icp/:icpId" element={<IcpEditorPage />} />
            <Route path="website-analysis" element={<WebsiteAnalysisPage />} />
            <Route path="website-analysis/:analysisId" element={<WebsiteAnalysisDetailPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="enrichment" element={<EnrichmentPage />} />
            <Route path="email-studio" element={<EmailStudioPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="campaigns/new" element={<CampaignBuilderPage />} />
            <Route path="campaigns/:campaignId" element={<CampaignBuilderPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
