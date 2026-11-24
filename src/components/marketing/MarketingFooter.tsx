import { Link } from "react-router-dom";
import { ProspectraLogo } from "@/components/brand/ProspectraLogo";
import { APP_TAGLINE } from "@prospectra/shared";

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Solutions", href: "/solutions" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-brand-navy text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <ProspectraLogo className="[&_span]:text-white" />
          <p className="max-w-xs text-sm text-white/70">{APP_TAGLINE}</p>
        </div>
        {footerColumns.map((column) => (
          <div key={column.title}>
            <p className="mb-3 text-sm font-semibold">{column.title}</p>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link className="text-sm text-white/70 transition-colors hover:text-white" to={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-white/50 sm:px-6">
          © {new Date().getFullYear()} Prospectra. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
