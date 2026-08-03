/** Browser UI origin for Say To Me preview / dashboard links. */
export const SAY_TO_ME_UI_URL = "https://say.localhost:1311";

type SayToMeWidgetUiBaseInput = {
  readonly configuredUrl?: string | null;
  readonly hostname?: string;
  readonly origin?: string;
};

function validHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Resolve only an explicitly configured or same-origin Say To Me UI.
 * T3 proxies the widget/API, but it does not proxy the Say To Me UI pages.
 */
export function resolveSayToMeWidgetUiBaseUrl(input: SayToMeWidgetUiBaseInput = {}): string | null {
  const configured = input.configuredUrl ?? import.meta.env.VITE_SAY_TO_ME_UI_URL;
  const configuredUrl = validHttpUrl(configured);
  if (configuredUrl) return configuredUrl;

  const hostname =
    input.hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  if (hostname === "say.localhost" || hostname.endsWith(".say.localhost")) {
    return validHttpUrl(
      input.origin ?? (typeof window === "undefined" ? null : window.location.origin),
    );
  }
  return null;
}

export function sayToMeSpaceDashboardUrl(spaceId: string): string {
  return `${SAY_TO_ME_UI_URL}/dashboard/${encodeURIComponent(spaceId)}`;
}

export function sayToMeSessionUrl(sessionId: string): string {
  return `${SAY_TO_ME_UI_URL}/ses/${encodeURIComponent(sessionId)}`;
}

export function sayToMeAttachmentUrl(attachmentId: number): string {
  return `${SAY_TO_ME_UI_URL}/api/message-attachments/${encodeURIComponent(String(attachmentId))}`;
}
