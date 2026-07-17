export interface WordPressDeploymentReference {
  externalDeploymentId: string | null;
}

export function resolveWordPressPageId(
  deployment: WordPressDeploymentReference | null | undefined,
): number | null {
  if (!deployment) return null;

  const pageId = Number(deployment.externalDeploymentId);
  if (!deployment.externalDeploymentId || !Number.isInteger(pageId) || pageId <= 0) {
    throw new Error(
      'The saved WordPress Page ID is invalid. Publishing was stopped to avoid creating a duplicate page.',
    );
  }
  return pageId;
}

export function assertWordPressPageIdentity(expectedPageId: number, actualPageId: number): void {
  if (expectedPageId !== actualPageId) {
    throw new Error(
      `WordPress returned Page ID ${actualPageId}, but this landing page is linked to Page ID ${expectedPageId}.`,
    );
  }
}
