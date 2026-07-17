const CAMPAIGN_NAME_MAX_LENGTH = 255;
const CAMPAIGN_NAME_PREFIX = 'AI: ';
const TRUNCATED_SUFFIX = '...';

export function buildCampaignName(goal: string): string {
  const normalizedGoal = goal.replace(/\s+/g, ' ').trim();
  const fullName = `${CAMPAIGN_NAME_PREFIX}${normalizedGoal || 'Untitled campaign'}`;
  if (fullName.length <= CAMPAIGN_NAME_MAX_LENGTH) return fullName;

  const limit = CAMPAIGN_NAME_MAX_LENGTH - TRUNCATED_SUFFIX.length;
  const clipped = fullName.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(' ');
  const safeClip = lastSpace > CAMPAIGN_NAME_PREFIX.length + 20
    ? clipped.slice(0, lastSpace)
    : clipped;
  return `${safeClip.trimEnd()}${TRUNCATED_SUFFIX}`;
}
