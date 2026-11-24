import { ErrorCode, type ErrorCodeValue } from "@prospectra/shared";

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(
    code: ErrorCodeValue,
    message: string,
    options?: { status?: number; details?: unknown; cause?: unknown },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? defaultStatusForCode(code);
    this.details = options?.details;
    this.cause = options?.cause;
  }
}

function defaultStatusForCode(code: ErrorCodeValue): number {
  switch (code) {
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.VALIDATION_FAILED:
      return 400;
    case ErrorCode.PROVIDER_UNCONFIGURED:
      return 503;
    case ErrorCode.CREDIT_INSUFFICIENT:
      return 402;
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.SSRF_BLOCKED:
    case ErrorCode.AI_OUTPUT_INVALID:
      return 400;
    default:
      return 500;
  }
}

export function toAppError(error: unknown, fallbackMessage = "Unexpected error"): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ErrorCode.INTERNAL, error.message || fallbackMessage, { cause: error });
  }

  return new AppError(ErrorCode.INTERNAL, fallbackMessage, { details: error });
}

export function getErrorMessage(error: unknown): string {
  return toAppError(error).message;
}
