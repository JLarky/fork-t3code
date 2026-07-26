/** Browser UI origin for Say To Me preview / dashboard links. */
export const SAY_TO_ME_UI_URL = "https://say.localhost:1311";

export function sayToMeSpaceDashboardUrl(spaceId: string): string {
  return `${SAY_TO_ME_UI_URL}/dashboard/${encodeURIComponent(spaceId)}`;
}

export function sayToMeSessionUrl(sessionId: string): string {
  return `${SAY_TO_ME_UI_URL}/ses/${encodeURIComponent(sessionId)}`;
}
