const STOPWORDS = new Set([
  "about",
  "and",
  "are",
  "for",
  "from",
  "home",
  "our",
  "the",
  "this",
  "with",
  "your",
  "that",
  "into",
  "their",
  "company",
  "welcome",
]);

export type ExtractedContact = {
  emails: string[];
  phones: string[];
};

export type ExtractedEvidence = {
  companyName: string | null;
  description: string | null;
  products: string[];
  services: string[];
  industry: string | null;
  targetMarkets: string[];
  valueProposition: string | null;
  businessModel: string | null;
  customerSegments: string[];
  contacts: ExtractedContact;
  keywords: string[];
  excerpts: Array<{ url: string; title: string | null; text: string }>;
};

export type ExtractionPage = {
  url: string;
  html: string;
  title?: string | null;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      return decodeEntities(match[1]).trim();
    }
  }
  return null;
}

function pageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
}

function cleanName(title: string | null): string | null {
  if (!title) {
    return null;
  }
  const part = title.split(/\s+[|–—-]\s+/)[0]?.trim() ?? title.trim();
  return part.slice(0, 160) || null;
}

type Section = { heading: string; body: string };

function sectionsFromHtml(html: string): Section[] {
  const pattern = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const matches = [...html.matchAll(pattern)];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? html.length;
    return {
      heading: htmlToText(match[2] ?? ""),
      body: htmlToText(html.slice(start, end)).slice(0, 800),
    };
  });
}

function phrases(body: string): string[] {
  return body
    .split(/[•|\n]|(?<=\.)\s+/)
    .map((part) => part.replace(/^[-*]\s*/, "").replace(/[.\s]+$/, "").trim())
    .filter((part) => part.length >= 3 && part.length <= 180)
    .slice(0, 8);
}

function sectionMatches(heading: string, pattern: RegExp): boolean {
  return pattern.test(heading.trim());
}

function collect(sections: Section[], pattern: RegExp): string[] {
  const values = sections
    .filter((section) => sectionMatches(section.heading, pattern))
    .flatMap((section) => phrases(section.body));
  return [...new Set(values)].slice(0, 12);
}

function explicitLine(html: string, label: string): string | null {
  const match = new RegExp(`${label}\\s*[:\\-]\\s*([^<\\.]{2,80})`, "i").exec(html);
  return match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
}

function emailsFrom(html: string, text: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    found.add(decodeURIComponent(match[1] ?? "").toLowerCase());
  }
  for (const match of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    found.add(match[0].toLowerCase());
  }
  return [...found]
    .filter((email) => {
      const domain = email.split("@")[1] ?? "";
      return (
        domain.includes(".") &&
        !domain.endsWith(".png") &&
        !domain.endsWith(".jpg") &&
        !domain.includes("example.com") &&
        !domain.includes("sentry.io") &&
        !email.startsWith("email@") &&
        !email.startsWith("name@")
      );
    })
    .slice(0, 10);
}

function phonesFrom(html: string): string[] {
  const phones = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((match) =>
    decodeEntities(match[1] ?? "").trim(),
  );
  return [...new Set(phones.filter(Boolean))].slice(0, 8);
}

function keywordsFrom(title: string | null, sections: Section[]): string[] {
  const source = [title ?? "", ...sections.map((section) => section.heading)].join(" ");
  const counts = new Map<string, number>();
  for (const token of source.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
    if (STOPWORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([token]) => token);
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
      continue;
    }
    try {
      const url = new URL(raw, baseUrl);
      url.hash = "";
      if (url.protocol === "http:" || url.protocol === "https:") {
        links.push(url.href);
      }
    } catch {
      continue;
    }
  }
  return [...new Set(links)];
}

export function extractBusinessEvidence(pages: ExtractionPage[]): ExtractedEvidence {
  const sections = pages.flatMap((page) => sectionsFromHtml(page.html));
  const firstHtml = pages[0]?.html ?? "";
  const title = pages[0]?.title ?? pageTitle(firstHtml);
  const description = metaContent(firstHtml, "description") ?? metaContent(firstHtml, "og:description");
  const siteName = metaContent(firstHtml, "og:site_name");
  const emails = [...new Set(pages.flatMap((page) => emailsFrom(page.html, htmlToText(page.html))))].slice(0, 10);
  const phones = [...new Set(pages.flatMap((page) => phonesFrom(page.html)))].slice(0, 8);

  return {
    companyName: siteName ?? cleanName(title),
    description,
    products: collect(sections, /^products?$/i),
    services: collect(sections, /^services?$/i),
    industry: explicitLine(firstHtml, "industry"),
    targetMarkets: collect(sections, /^(markets?|target markets?|who we serve)$/i),
    valueProposition:
      sections.find((section) => /value proposition|why (us|choose)/i.test(section.heading))?.body ?? null,
    businessModel: explicitLine(firstHtml, "business model"),
    customerSegments: collect(sections, /^(customers?|customer segments?|who we help|who we serve)$/i),
    contacts: { emails, phones },
    keywords: keywordsFrom(title, sections),
    excerpts: pages.slice(0, 5).map((page) => ({
      url: page.url,
      title: page.title ?? pageTitle(page.html),
      text: htmlToText(page.html).slice(0, 4000),
    })),
  };
}
