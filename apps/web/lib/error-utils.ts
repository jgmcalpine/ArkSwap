/**
 * Parses error objects and returns human-readable error messages.
 * Handles NestJS error formats, JSON strings, and Error objects.
 */
export function getErrorMessage(error: unknown): string {
  // If error is a string, try to parse it as JSON first
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error);
      return getErrorMessage(parsed);
    } catch {
      // Not valid JSON, return the string as-is
      return error;
    }
  }

  // If error is an Error object, check its message
  if (error instanceof Error) {
    const message = error.message;
    
    // Try to parse the message as JSON (in case API client stringified the response)
    try {
      const parsed = JSON.parse(message);
      return getErrorMessage(parsed);
    } catch {
      // Not valid JSON, use the message directly
      return message || 'An unexpected error occurred.';
    }
  }

  // If error is an object, check for NestJS error format
  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    
    // NestJS error format: check for .message property
    if ('message' in errorObj) {
      const message = errorObj.message;
      
      // If message is an array (class-validator format), join them
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      
      // If message is a string, use it
      if (typeof message === 'string') {
        return message;
      }
    }
    
    // Check for other common error properties
    if ('error' in errorObj && typeof errorObj.error === 'string') {
      return errorObj.error;
    }
  }

  // Fallback
  return 'An unexpected error occurred.';
}

