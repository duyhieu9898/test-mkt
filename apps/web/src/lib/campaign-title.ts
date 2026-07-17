interface CampaignTitleSource {
  name: string;
  targeting?: {
    source?: {
      requestedGoal?: unknown;
    };
  } | null;
}

export function campaignDisplayTitle(campaign: CampaignTitleSource): string {
  const requestedGoal = campaign.targeting?.source?.requestedGoal;
  if (typeof requestedGoal === 'string' && requestedGoal.trim()) {
    return `AI: ${requestedGoal.replace(/\s+/g, ' ').trim()}`;
  }
  return campaign.name;
}
