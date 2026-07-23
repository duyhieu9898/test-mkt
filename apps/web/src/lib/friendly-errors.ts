/**
 * Translate technical errors into friendly, non-technical messages.
 *
 * The product targets non-technical founders (mainly in SEA). Raw API
 * errors like "422 Unprocessable Entity" or "tenant mismatch" confuse
 * users. This helper maps known patterns to human-friendly text.
 */
export function friendlyError(
  err: unknown,
  fallback = 'Something went wrong — try again in a moment.',
): string {
  if (typeof err === 'string') return err;

  if (err instanceof Error) {
    const msg = err.message || '';

    if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg) || /network request failed/i.test(msg)) {
      return "We couldn't reach the server. Check your connection and try again.";
    }
    if (msg.toLocaleLowerCase().includes('you do not have enough credits')) {
      return 'You do not have enough credits for this action. Please contact support to add more credits.';
    }
    if (msg.includes('401') || /unauthor/i.test(msg)) {
      return 'Your session expired. Please sign in again.';
    }
    if (msg.includes('403') || /forbidden/i.test(msg) || /tenant mismatch/i.test(msg)) {
      return "You don't have permission for that action.";
    }
    if (msg.includes('404') || /not found/i.test(msg)) {
      return "We couldn't find what you were looking for.";
    }
    if (msg.includes('422') || /validation/i.test(msg) || /required/i.test(msg)) {
      return 'Please fill in all the required fields.';
    }
    if (/429/.test(msg) || /rate limit/i.test(msg) || /too many/i.test(msg)) {
      return 'Too many requests at once. Please wait a moment and try again.';
    }
    if (msg.includes('500') || /internal/i.test(msg) || /queue/i.test(msg)) {
      return "Something went wrong on our side. We've been notified and will fix it.";
    }

    // Already-friendly short messages pass through
    if (msg.length > 0 && msg.length < 120 && !/^[A-Z_]+$/.test(msg)) {
      return msg;
    }
  }

  return fallback;
}
