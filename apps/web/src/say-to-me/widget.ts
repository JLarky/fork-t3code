/** Same-origin proxied URL for the STM widget custom-element script. */
export const SAY_TO_ME_WIDGET_SRC = "/api/say-to-me/embed/widget.js";

const SAY_TO_ME_WIDGET_HMR_PATH = "/server/embed/solid/widget-hmr.ts";

export const SAY_TO_ME_WIDGET_TAG = "say-to-me-widget" as const;
export const SAY_TO_ME_WIDGET_BANNER_API_VERSION = 2 as const;
export const SAY_TO_ME_WIDGET_PARK_SESSION_VERSION = 1 as const;
export const SAY_TO_ME_WIDGET_STORAGE_KEY = "t3code:say-to-me-banner-collapsed:v1" as const;
export const SAY_TO_ME_WIDGET_NOTES_BASE_URL = "/api/voice-notes" as const;
export const SAY_TO_ME_WIDGET_TIMERS_BASE_URL = "/api/say-to-me-timers" as const;
export const SAY_TO_ME_WIDGET_PARK_SESSION_EVENT = "say-to-me-park-session" as const;
export const SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT = "say-to-me-insert-usage-prompt" as const;
export const SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT = "say-to-me-speech-started" as const;
export const SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT = "say-to-me-speech-ended" as const;

const WIDGET_SOURCE = "say-to-me-widget";
const WIDGET_VERSION = SAY_TO_ME_WIDGET_BANNER_API_VERSION;
const PARK_SESSION_VERSION = SAY_TO_ME_WIDGET_PARK_SESSION_VERSION;

declare global {
  interface HTMLElementTagNameMap {
    "say-to-me-widget": HTMLElement;
  }
}

export type SayToMeWidgetEventDetail =
  | {
      readonly source: typeof WIDGET_SOURCE;
      readonly version: typeof PARK_SESSION_VERSION;
      readonly type: "park-session";
      readonly sessionId: string;
    }
  | {
      readonly source: typeof WIDGET_SOURCE;
      readonly version: 2;
      readonly type: "insert-usage-prompt";
      readonly prompt: string;
    }
  | {
      readonly source: typeof WIDGET_SOURCE;
      readonly version: 2;
      readonly type: "speech-started" | "speech-ended";
      readonly noteId: string;
    };

let widgetDefinitionPromise: Promise<CustomElementConstructor> | null = null;

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

/** Direct STM Vite module URL for configured localhost development. */
export function resolveSayToMeWidgetHmrModuleUrl(input?: {
  readonly isDev?: boolean;
  readonly hostname?: string;
  readonly stmOrigin?: string;
}): string | null {
  const isDev = input?.isDev ?? import.meta.env.DEV;
  const hostname =
    input?.hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  const stmOrigin = input?.stmOrigin ?? import.meta.env.VITE_SAY_TO_ME_DEV_ORIGIN;
  if (!isDev || !isLocalHostname(hostname) || !stmOrigin?.trim()) {
    return null;
  }

  try {
    const origin = new URL(stmOrigin);
    if (
      (origin.protocol !== "http:" && origin.protocol !== "https:") ||
      !isLocalHostname(origin.hostname)
    ) {
      return null;
    }
    return new URL(SAY_TO_ME_WIDGET_HMR_PATH, origin.origin).toString();
  } catch {
    return null;
  }
}

export function importSayToMeWidgetHmrModule(
  moduleUrl: string,
  importModule: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url),
): Promise<unknown> {
  return importModule(moduleUrl);
}

/** Load and await the one shared v2 custom-element definition. */
export function ensureSayToMeWidgetDefinition(
  hmrModuleUrl: string | null = resolveSayToMeWidgetHmrModuleUrl(),
): Promise<CustomElementConstructor> {
  if (typeof customElements === "undefined")
    return Promise.reject(new Error("Custom elements are unavailable"));
  const existing = customElements.get(SAY_TO_ME_WIDGET_TAG);
  if (existing) return Promise.resolve(existing);
  if (widgetDefinitionPromise) return widgetDefinitionPromise;
  widgetDefinitionPromise = (async () => {
    if (hmrModuleUrl) {
      await importSayToMeWidgetHmrModule(hmrModuleUrl);
    } else {
      let script = document.querySelector<HTMLScriptElement>(
        'script[data-testid="say-to-me-widget-script"]',
      );
      if (!script) {
        script = document.createElement("script");
        script.src = SAY_TO_ME_WIDGET_SRC;
        script.async = true;
        script.dataset.testid = "say-to-me-widget-script";
        document.head.append(script);
      }
      if (!customElements.get(SAY_TO_ME_WIDGET_TAG)) {
        await new Promise<void>((resolve, reject) => {
          script!.addEventListener("load", () => resolve(), { once: true });
          script!.addEventListener(
            "error",
            () => reject(new Error("STM widget script failed to load")),
            { once: true },
          );
        });
      }
    }
    return customElements.whenDefined(SAY_TO_ME_WIDGET_TAG);
  })();
  widgetDefinitionPromise.catch(() => {
    widgetDefinitionPromise = null;
  });
  return widgetDefinitionPromise;
}

/** Wait until STM has mounted the v2 banner implementation on an element. */
export function waitForSayToMeWidgetV2(element: HTMLElement, timeoutMs = 5_000): Promise<boolean> {
  if (element.dataset.bannerApiVersion === String(SAY_TO_ME_WIDGET_BANNER_API_VERSION))
    return Promise.resolve(true);
  if (typeof MutationObserver === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const observer = new MutationObserver(() => {
      if (element.dataset.bannerApiVersion === String(SAY_TO_ME_WIDGET_BANNER_API_VERSION)) {
        settled = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(true);
      }
    });
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    observer.observe(element, { attributes: true, attributeFilter: ["data-banner-api-version"] });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strictly parse a v2 STM event, including event name and detail. */
export function parseSayToMeWidgetEvent(
  event: Event,
  expectedSessionId?: string,
): SayToMeWidgetEventDetail | null {
  if (!(event instanceof CustomEvent) || !isRecord(event.detail)) return null;
  const detail = event.detail;
  if (detail.source !== WIDGET_SOURCE) return null;
  if (detail.type === "park-session") {
    if (
      event.type !== SAY_TO_ME_WIDGET_PARK_SESSION_EVENT ||
      detail.version !== PARK_SESSION_VERSION ||
      typeof detail.sessionId !== "string" ||
      !detail.sessionId.trim() ||
      (expectedSessionId !== undefined && detail.sessionId !== expectedSessionId)
    )
      return null;
    return detail as SayToMeWidgetEventDetail;
  }
  if (detail.version !== WIDGET_VERSION) return null;
  if (detail.type === "insert-usage-prompt") {
    return event.type === SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT &&
      typeof detail.prompt === "string"
      ? (detail as SayToMeWidgetEventDetail)
      : null;
  }
  if (detail.type === "speech-started" || detail.type === "speech-ended") {
    const expectedName =
      detail.type === "speech-started"
        ? SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT
        : SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT;
    return event.type === expectedName && typeof detail.noteId === "string" && detail.noteId.trim()
      ? (detail as SayToMeWidgetEventDetail)
      : null;
  }
  return null;
}

export const SAY_TO_ME_PARK_SESSION_EVENT = SAY_TO_ME_WIDGET_PARK_SESSION_EVENT;

/** Strict check for the park-session CustomEvent detail payload. */
export function isSayToMeParkSessionDetail(detail: unknown, expectedSessionId?: string): boolean {
  if (detail === null || typeof detail !== "object") {
    return false;
  }
  const record = detail as Record<string, unknown>;
  if (
    record.source !== WIDGET_SOURCE ||
    record.version !== PARK_SESSION_VERSION ||
    record.type !== "park-session" ||
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
  if (event.type !== SAY_TO_ME_PARK_SESSION_EVENT) {
    return false;
  }
  if (!(event instanceof CustomEvent)) {
    return false;
  }
  return isSayToMeParkSessionDetail(event.detail, expectedSessionId);
}

export type SayToMeWidgetEventHandlers = {
  readonly onInsertUsagePrompt?: (() => void) | undefined;
  readonly onSpeechActivityChange?: ((active: boolean) => void) | undefined;
};

/** Bind the strict widget event contract and return the exact listener cleanup. */
export function bindSayToMeWidgetEvents(
  node: HTMLElement,
  sessionId: string,
  context: ParkSessionContext,
  handlers: SayToMeWidgetEventHandlers,
): () => void {
  const onWidgetEvent = (event: Event) => {
    const detail = parseSayToMeWidgetEvent(event, sessionId);
    if (!detail) return;
    if (detail.type === "park-session") {
      assignParkSessionFromEvent(event, sessionId, context);
    } else if (detail.type === "insert-usage-prompt") {
      handlers.onInsertUsagePrompt?.();
    } else {
      handlers.onSpeechActivityChange?.(detail.type === "speech-started");
    }
  };
  node.addEventListener(SAY_TO_ME_WIDGET_PARK_SESSION_EVENT, onWidgetEvent);
  node.addEventListener(SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT, onWidgetEvent);
  node.addEventListener(SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT, onWidgetEvent);
  node.addEventListener(SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT, onWidgetEvent);
  return () => {
    node.removeEventListener(SAY_TO_ME_WIDGET_PARK_SESSION_EVENT, onWidgetEvent);
    node.removeEventListener(SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT, onWidgetEvent);
    node.removeEventListener(SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT, onWidgetEvent);
    node.removeEventListener(SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT, onWidgetEvent);
  };
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
