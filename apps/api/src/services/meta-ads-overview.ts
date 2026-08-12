/** Records must be ordered newest-first. Keeps overview totals independent of pagination. */
export function latestAnalysisStatusByCampaignId(records: Array<{ campaignId: string; status: string }>) {
  const statuses = new Map<string, string>();
  for (const record of records) if (!statuses.has(record.campaignId)) statuses.set(record.campaignId, record.status);
  return statuses;
}

export function countCampaignsNeedingReview(campaignIds: readonly string[], statuses: ReadonlyMap<string, string>) {
  return campaignIds.filter((id) => statuses.get(id) === 'needs_review').length;
}
