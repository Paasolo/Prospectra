import type { CompanySearchCriteria, ContactSearchCriteria, EnrichedField, NormalizedCompany, NormalizedContact } from "@prospectra/shared";
import type { WorkerConfig } from "../config.js";
import { createApolloClient } from "./apollo.js";
import { createEnrichLayerClient } from "./enrichlayer.js";
import { ProviderRequestError } from "./errors.js";

export type DiscoveryClient = {
  providerId: string;
  searchCompanies(
    criteria: CompanySearchCriteria,
    page: number,
    pageSize: number,
    retrievedAt: string,
  ): Promise<{ records: NormalizedCompany[]; partial: boolean }>;
  searchContacts(
    criteria: ContactSearchCriteria,
    page: number,
    pageSize: number,
    retrievedAt: string,
  ): Promise<{ records: NormalizedContact[]; partial: boolean }>;
  enrichPerson(body: Record<string, string | undefined>, retrievedAt: string): Promise<EnrichedField[]>;
};

const DISCOVERY_PROVIDERS = new Set(["enrichlayer", "apollo"]);

export function resolveProviderName(
  selected: string | undefined,
  fallback?: string,
): string | undefined {
  return selected ?? fallback;
}

export function createDiscoveryClientForRole(
  config: WorkerConfig,
  role: "company_discovery" | "contact_discovery" | "enrichment",
): DiscoveryClient {
  if (role === "company_discovery") {
    return createDiscoveryClient(config.companyProvider, config.companyApiKey);
  }
  if (role === "contact_discovery") {
    return createDiscoveryClient(config.contactProvider, config.contactApiKey);
  }
  const enrichmentProvider =
    config.enrichmentProvider ??
    (config.contactProvider && DISCOVERY_PROVIDERS.has(config.contactProvider) ? config.contactProvider : undefined);
  const enrichmentKey =
    config.enrichmentApiKey ??
    (enrichmentProvider && enrichmentProvider === config.contactProvider ? config.contactApiKey : undefined);
  return createDiscoveryClient(enrichmentProvider, enrichmentKey);
}

export function createDiscoveryClient(provider: string | undefined, apiKey: string | undefined): DiscoveryClient {
  if (!provider || !apiKey) {
    throw new ProviderRequestError(
      "unconfigured",
      "Set COMPANY_DATA_PROVIDER / CONTACT_DATA_PROVIDER / ENRICHMENT_PROVIDER and the matching API key.",
    );
  }
  if (provider === "enrichlayer") {
    const client = createEnrichLayerClient(apiKey);
    return {
      providerId: "enrichlayer",
      searchCompanies: client.searchCompanies.bind(client),
      searchContacts: client.searchContacts.bind(client),
      enrichPerson: client.enrichPerson.bind(client),
    };
  }
  if (provider === "apollo") {
    const client = createApolloClient(apiKey);
    return {
      providerId: "apollo",
      searchCompanies: client.searchCompanies.bind(client),
      searchContacts: client.searchContacts.bind(client),
      enrichPerson: client.enrichPerson.bind(client),
    };
  }
  throw new ProviderRequestError(
    "invalid_response",
    `No discovery adapter is installed for ${provider}. Supported adapters: enrichlayer, apollo.`,
  );
}

export function preferredDiscoveryClient(config: WorkerConfig): DiscoveryClient | null {
  const contactReady = config.contactProvider && config.contactApiKey && DISCOVERY_PROVIDERS.has(config.contactProvider);
  const companyReady = config.companyProvider && config.companyApiKey && DISCOVERY_PROVIDERS.has(config.companyProvider);
  if (contactReady) {
    return createDiscoveryClient(config.contactProvider, config.contactApiKey);
  }
  if (companyReady) {
    return createDiscoveryClient(config.companyProvider, config.companyApiKey);
  }
  return null;
}
