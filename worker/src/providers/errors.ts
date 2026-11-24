export class ProviderRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderRequestError";
    this.code = code;
  }
}

export function providerErrorFromStatus(status: number, body: string): ProviderRequestError {
  const detail = body.slice(0, 300) || `Provider returned HTTP ${status}.`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError("invalid_credentials", "The provider rejected the API credentials.");
  }
  if (status === 402) {
    return new ProviderRequestError("quota_exceeded", "The provider quota has been exceeded.");
  }
  if (status === 429) {
    return new ProviderRequestError("rate_limited", "The provider rate limit was reached.");
  }
  if (status >= 500) {
    return new ProviderRequestError("PROVIDER_ERROR", detail);
  }
  return new ProviderRequestError("invalid_response", detail);
}

export function providerErrorFromUnknown(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new ProviderRequestError("timeout", "The provider request timed out.");
  }
  return new ProviderRequestError("PROVIDER_ERROR", error instanceof Error ? error.message : "Provider request failed.");
}
