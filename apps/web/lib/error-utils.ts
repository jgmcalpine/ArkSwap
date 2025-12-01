/**
 * Parses error objects and returns human-readable error messages.
 * Handles NestJS error formats, JSON strings, and Error objects.
 */
export function getErrorMessage(error: unknown): string {
  // 1. Handle Strings
  if (typeof error === 'string') {
    try {
      // Try parsing stringified JSON errors
      const parsed = JSON.parse(error);
      if (typeof parsed === 'object' && parsed !== null) {
        return getErrorMessage(parsed); // Recurse
      }
    } catch {
      return error;
    }
  }

  // 2. Handle Standard Errors
  if (error instanceof Error) return error.message;

  // 3. Handle Plain Objects (like API JSON responses)
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, any>;

    // Check for NestJS "message" array (ValidationPipe)
    if (Array.isArray(errObj.message)) {
      return errObj.message.join(', ');
    }

    // Check for standard "message" property
    if (typeof errObj.message === 'string') {
      return errObj.message;
    }

    // Check for "error" property (e.g. "Bad Request")
    if (typeof errObj.error === 'string') {
      return errObj.error;
    }
  }

  return 'An unexpected error occurred';
}
