/** Stable embed path STM serves in every environment (dev Vite shim or esbuild bundle). */
export const SAY_TO_ME_PARK_BUTTON_EMBED_PATH = "/embed/park-button.js";

/** Same-origin authenticated proxy prefix for non-local delivery. */
const SAY_TO_ME_PROXY_BASE = "/api/say-to-me";

export const SAY_TO_ME_PARK_BUTTON_TAG = "say-to-me-park-button";
export const SAY_TO_ME_PARK_BUTTON_EVENT = "say-to-me-park-session";

const PARK_BUTTON_SOURCE = "say-to-me-park-button";
const PARK_BUTTON_VERSION = 1;
const PARK_SESSION_TYPE = "park-session";

declare global {
  interface HTMLElementTagNameMap {
    "say-to-me-park-button": HTMLElement;
  }
}

export type ParkSessionContext = {
  readonly environmentId: string;
  readonly threadId: string;
  readonly title?: string | null | undefined;
  readonly project?: string | null | undefined;
  readonly cwd?: string | null | undefined;
  readonly branch?: string | null | undefined;
};

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * One URL for every environment: the direct STM origin in explicitly configured
 * localhost development (STM's dev server answers the stable path with a Vite
 * module shim, so edits hot-update without a host reload), otherwise the same
 * stable path behind the same-origin authenticated proxy.
 */
export function sayToMeParkButtonModuleUrl(input?: {
  readonly isDev?: boolean;
  readonly hostname?: string;
  readonly stmOrigin?: string;
}): string {
  const isDev = input?.isDev ?? import.meta.env.DEV;
  const hostname =
    input?.hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  const stmOrigin = input?.stmOrigin ?? import.meta.env.VITE_SAY_TO_ME_DEV_ORIGIN;

  if (isDev && isLocalHostname(hostname) && stmOrigin?.trim()) {
    try {
      const origin = new URL(stmOrigin);
      if (
        (origin.protocol === "http:" || origin.protocol === "https:") &&
        isLocalHostname(origin.hostname)
      ) {
        return new URL(SAY_TO_ME_PARK_BUTTON_EMBED_PATH, origin.origin).toString();
      }
    } catch {
      // Invalid configured origin falls through to the proxied path.
    }
  }

  return `${SAY_TO_ME_PROXY_BASE}${SAY_TO_ME_PARK_BUTTON_EMBED_PATH}`;
}

export function importSayToMeParkButtonModule(
  moduleUrl: string,
  importModule: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url),
): Promise<unknown> {
  return importModule(moduleUrl);
}

/** Strict check for the park-session CustomEvent detail payload. */
export function isSayToMeParkSessionDetail(detail: unknown, expectedSessionId?: string): boolean {
  if (detail === null || typeof detail !== "object") {
    return false;
  }
  const record = detail as Record<string, unknown>;
  if (
    record.source !== PARK_BUTTON_SOURCE ||
    record.version !== PARK_BUTTON_VERSION ||
    record.type !== PARK_SESSION_TYPE ||
    typeof record.sessionId !== "string" ||
    record.sessionId.trim().length === 0
  ) {
    return false;
  }
  if (expectedSessionId !== undefined && record.sessionId !== expectedSessionId) {
    return false;
  }
  return true;
}

/** Strict check for the park-session CustomEvent (name + detail). */
export function isSayToMeParkSessionEvent(event: Event, expectedSessionId?: string): boolean {
  if (event.type !== SAY_TO_ME_PARK_BUTTON_EVENT) {
    return false;
  }
  if (!(event instanceof CustomEvent)) {
    return false;
  }
  return isSayToMeParkSessionDetail(event.detail, expectedSessionId);
}

/**
 * Exact legacy `/park` URL from the former VoiceNotesBanner Park button.
 * environmentId/threadId are required; title/project/cwd/branch are optional.
 */
export function buildParkSessionUrl(
  context: ParkSessionContext,
  origin: string = typeof window !== "undefined" ? window.location.origin : "http://localhost",
): URL {
  const url = new URL("/park", origin);
  url.searchParams.set("environmentId", context.environmentId);
  url.searchParams.set("threadId", context.threadId);
  for (const [key, value] of [
    ["title", context.title],
    ["project", context.project],
    ["cwd", context.cwd],
    ["branch", context.branch],
  ] as const) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

/** Navigate with the exact legacy Park assign behavior. */
export function assignParkSessionUrl(context: ParkSessionContext): void {
  window.location.assign(buildParkSessionUrl(context));
}

/**
 * Assign legacy /park only when the event is valid and detail.sessionId matches
 * the mounted host sessionId prop.
 */
export function assignParkSessionFromEvent(
  event: Event,
  expectedSessionId: string,
  context: ParkSessionContext,
): boolean {
  // Blank mounted sessionId must never navigate (STM also disables + sets data-error).
  if (!expectedSessionId.trim()) {
    return false;
  }
  if (!isSayToMeParkSessionEvent(event, expectedSessionId)) {
    return false;
  }
  assignParkSessionUrl(context);
  return true;
}
