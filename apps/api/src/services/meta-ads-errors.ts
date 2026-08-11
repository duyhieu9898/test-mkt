/**
 * Meta Ads Domain Errors & User Sanitization
 */

export class MetaAdsReadOnlyError extends Error {
  constructor(message = 'Facebook Ads connection is read-only in V1') {
    super(message);
    this.name = 'MetaAdsReadOnlyError';
  }
}

/**
 * Maps raw Meta API error objects/messages to actionable, user-friendly error strings.
 * Logs the full raw error to server logs for debugging.
 */
export function toMetaAdsUserError(error: unknown): string {
  console.error('[Meta Ads API Error]', error);

  if (error instanceof MetaAdsReadOnlyError) {
    return error.message;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const lower = rawMessage.toLowerCase();

  if (lower.includes('token') || lower.includes('session') || lower.includes('190') || lower.includes('invalid OAuth access token')) {
    return 'Reconnect Facebook and choose the Ad Account again to resume sync.';
  }
  if (lower.includes('permission') || lower.includes('200') || lower.includes('scope')) {
    return 'Facebook permissions need attention. Please reconnect your account.';
  }
  if (lower.includes('rate') || lower.includes('17') || lower.includes('limit')) {
    return 'Meta API rate limit reached. Please try again in a few minutes.';
  }
  if (lower.includes('account') || lower.includes('not accessible') || lower.includes('100')) {
    return 'The selected Meta Ad Account is no longer accessible.';
  }

  return 'Could not sync Meta Ads data. Please try again later.';
}
