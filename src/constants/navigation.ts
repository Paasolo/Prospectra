export type NavItem = {
  label: string;
  href: string;
};

export const marketingNav: NavItem[] = [
  { label: "Features", href: "/features" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export const appNavSections = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/app" }],
  },
  {
    title: "Prospecting",
    items: [
      { label: "Outbound Agent", href: "/app/agent" },
      { label: "Discover Companies", href: "/app/discover/companies" },
      { label: "Discover Contacts", href: "/app/discover/contacts" },
      { label: "Prospects", href: "/app/prospects" },
      { label: "Lists", href: "/app/lists" },
      { label: "Ideal Customer Profiles", href: "/app/icp" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Website Analysis", href: "/app/website-analysis" },
      { label: "AI Sales Assistant", href: "/app/assistant" },
      { label: "Enrichment", href: "/app/enrichment" },
    ],
  },
  {
    title: "Engagement",
    items: [
      { label: "Email Studio", href: "/app/email-studio" },
      { label: "Campaigns", href: "/app/campaigns" },
      { label: "Inbox", href: "/app/inbox" },
      { label: "Meetings", href: "/app/meetings" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "/app/reports" },
      { label: "Performance", href: "/app/performance" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Team", href: "/app/team" },
      { label: "Integrations", href: "/app/integrations" },
      { label: "Billing", href: "/app/billing" },
      { label: "Notifications", href: "/app/notifications" },
      { label: "Settings", href: "/app/settings" },
    ],
  },
] as const;
