export type DestinationDecision =
  | { ok: true; url: URL }
  | { ok: false; code: "SSRF_BLOCKED" | "VALIDATION_FAILED"; reason: string };

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "metadata.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".localdomain",
];

const V4_BLOCKS: Array<[number, number]> = [
  [ipv4("0.0.0.0"), 8],
  [ipv4("10.0.0.0"), 8],
  [ipv4("100.64.0.0"), 10],
  [ipv4("127.0.0.0"), 8],
  [ipv4("169.254.0.0"), 16],
  [ipv4("172.16.0.0"), 12],
  [ipv4("192.0.0.0"), 24],
  [ipv4("192.0.2.0"), 24],
  [ipv4("192.168.0.0"), 16],
  [ipv4("198.18.0.0"), 15],
  [ipv4("198.51.100.0"), 24],
  [ipv4("203.0.113.0"), 24],
  [ipv4("224.0.0.0"), 4],
  [ipv4("240.0.0.0"), 4],
];

const ALIBABA_METADATA = ipv4("100.100.100.200");

function ipv4(literal: string): number {
  const parsed = parseCanonicalIPv4(literal);
  if (parsed === null) {
    throw new Error(`Invalid IPv4 literal: ${literal}`);
  }
  return parsed;
}

export function parseCanonicalIPv4(literal: string): number | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(literal);
  if (!match) {
    return null;
  }

  const parts = [match[1], match[2], match[3], match[4]];
  if (parts.some((part) => !part || (part.length > 1 && part.startsWith("0")) || Number(part) > 255)) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  return (((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!) >>> 0;
}

function inPrefix(ip: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

export function isBlockedIPv4(ip: number): boolean {
  if (ip === ALIBABA_METADATA) {
    return true;
  }
  return V4_BLOCKS.some(([base, bits]) => inPrefix(ip, base, bits));
}

function parseIPv6(literal: string): bigint | null {
  let value = literal.trim().toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }
  if (value.includes("%")) {
    return null;
  }

  const lastColon = value.lastIndexOf(":");
  const tail = lastColon >= 0 ? value.slice(lastColon + 1) : value;
  if (tail.includes(".")) {
    const v4 = parseCanonicalIPv4(tail);
    if (v4 === null) {
      return null;
    }
    const hi = (v4 >>> 16).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    value = `${value.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) {
    return null;
  }

  const parseGroups = (part: string): number[] | null => {
    if (!part) {
      return [];
    }
    const groups = part.split(":");
    if (groups.some((group) => group.length === 0 || group.length > 4 || /[^0-9a-f]/.test(group))) {
      return null;
    }
    return groups.map((group) => Number.parseInt(group, 16));
  };

  const head = parseGroups(halves[0] ?? "");
  const tailGroups = halves.length === 2 ? parseGroups(halves[1] ?? "") : [];
  if (!head || !tailGroups) {
    return null;
  }

  const missing = 8 - (head.length + tailGroups.length);
  if (halves.length === 1 && head.length !== 8) {
    return null;
  }
  if (halves.length === 2 && missing < 0) {
    return null;
  }

  const groups =
    halves.length === 2 ? [...head, ...Array<number>(missing).fill(0), ...tailGroups] : head;
  if (groups.length !== 8) {
    return null;
  }

  return groups.reduce((acc, group) => (acc << 16n) + BigInt(group), 0n);
}

function ipv6Prefix(groups: number[]): bigint {
  return groups.reduce((acc, group) => (acc << 16n) + BigInt(group), 0n);
}

function inV6Prefix(ip: bigint, prefix: bigint, bits: number): boolean {
  const shift = 128n - BigInt(bits);
  return ip >> shift === prefix >> shift;
}

export function isBlockedIPv6(ip: bigint): boolean {
  const v4Mapped = ipv6Prefix([0, 0, 0, 0, 0, 0xffff, 0, 0]);
  const nat64 = ipv6Prefix([0x64, 0xff9b, 0, 0, 0, 0, 0, 0]);
  if (inV6Prefix(ip, v4Mapped, 96) || inV6Prefix(ip, nat64, 96)) {
    return isBlockedIPv4(Number(ip & 0xffffffffn));
  }

  const blocks: Array<[bigint, number]> = [
    [0n, 128],
    [1n, 128],
    [ipv6Prefix([0xfc00, 0, 0, 0, 0, 0, 0, 0]), 7],
    [ipv6Prefix([0xfe80, 0, 0, 0, 0, 0, 0, 0]), 10],
    [ipv6Prefix([0xfec0, 0, 0, 0, 0, 0, 0, 0]), 10],
    [ipv6Prefix([0xff00, 0, 0, 0, 0, 0, 0, 0]), 8],
    [ipv6Prefix([0x2001, 0x0db8, 0, 0, 0, 0, 0, 0]), 32],
    [ipv6Prefix([0x0100, 0, 0, 0, 0, 0, 0, 0]), 64],
  ];

  return blocks.some(([prefix, bits]) => inV6Prefix(ip, prefix, bits));
}

export function isBlockedIp(address: string): boolean {
  const v4 = parseCanonicalIPv4(address);
  if (v4 !== null) {
    return isBlockedIPv4(v4);
  }
  const v6 = parseIPv6(address);
  if (v6 === null) {
    return true;
  }
  return isBlockedIPv6(v6);
}

function hostnameBlocked(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) {
    return "The URL has no hostname.";
  }
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return "Local and metadata hostnames are blocked.";
  }
  if (host.includes("metadata") || host.includes("instance-data")) {
    return "Metadata endpoints are blocked.";
  }
  if (/^\d+$/.test(host) || host.startsWith("0x") || host.includes("0x")) {
    return "Numeric and hexadecimal host addresses are blocked.";
  }
  if (!host.includes(":") && !host.includes(".")) {
    return "Single-label hostnames are blocked.";
  }
  if (host.includes(":")) {
    if (isBlockedIp(host)) {
      return "The IP address is not a public destination.";
    }
    return null;
  }
  if (parseCanonicalIPv4(host) !== null && isBlockedIPv4(parseCanonicalIPv4(host)!)) {
    return "The IP address is not a public destination.";
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && parseCanonicalIPv4(host) === null) {
    return "Ambiguous IP addresses are blocked.";
  }
  return null;
}

export function parsePublicHttpUrl(input: string): DestinationDecision {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { ok: false, code: "VALIDATION_FAILED", reason: "Enter a website URL." };
  }
  if (/[\s\\]/.test(trimmed)) {
    return { ok: false, code: "VALIDATION_FAILED", reason: "The URL contains unsupported characters." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: "VALIDATION_FAILED", reason: "Enter a valid HTTP or HTTPS URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, code: "SSRF_BLOCKED", reason: "Only public HTTP and HTTPS websites are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, code: "SSRF_BLOCKED", reason: "URLs with embedded credentials are blocked." };
  }

  const expectedPort = url.protocol === "https:" ? "443" : "80";
  if (url.port && url.port !== expectedPort) {
    return { ok: false, code: "SSRF_BLOCKED", reason: "Only the standard HTTP and HTTPS ports are allowed." };
  }

  const reason = hostnameBlocked(url.hostname);
  if (reason) {
    return { ok: false, code: "SSRF_BLOCKED", reason };
  }

  return { ok: true, url };
}

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const hostname = new URL(candidate).hostname.replace(/\.$/, "").replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

export function hostsEquivalent(left: string, right: string): boolean {
  const normalize = (host: string) => host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return normalize(left) === normalize(right);
}
