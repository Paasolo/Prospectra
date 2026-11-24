export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function clientSafeError(error: unknown): { statusCode: number; code: string; message: string } {
  if (error instanceof HttpError) {
    const hide = error.statusCode >= 500 && error.code === "INTERNAL";
    if (hide) {
      console.error(JSON.stringify({ level: "error", code: error.code, message: error.message }));
    }
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: hide ? "The request could not be completed." : error.message,
    };
  }
  console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : "unknown" }));
  return { statusCode: 500, code: "INTERNAL", message: "The request could not be completed." };
}
