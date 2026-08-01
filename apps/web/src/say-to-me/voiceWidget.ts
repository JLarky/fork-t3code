/** Same-origin proxied classic IIFE for non-local / production hosts. */
export const SAY_TO_ME_VOICE_WIDGET_SRC = "/api/say-to-me/embed/voice-widget.js";

/** Direct STM Vite HMR entry for localhost T3 ↔ STM authoring. */
export const SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL =
  "http://localhost:5411/server/embed/solid/voice-widget-hmr.ts";

export const SAY_TO_ME_VOICE_WIDGET_TAG = "say-to-me-voice-widget";
export const SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL = "/api/voice-notes";

/**
 * Collapse preference key — shared with the legacy banner so S1 inherits existing
 * collapsed preferences when replacing that runtime path.
 */
export const SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY = "t3code:say-to-me-banner-collapsed:v1";

/** DOM event names — Host Contract v1 allowed `detail.type` values. */
export const SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT = "say-to-me-collapse-change";
export const SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT = "say-to-me-error";
export const SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT = "say-to-me-insert-usage-prompt";
export const SAY_TO_ME_VOICE_WIDGET_OPEN_SESSION_EVENT = "say-to-me-open-session";
export const SAY_TO_ME_VOICE_WIDGET_PARK_SESSION_EVENT = "say-to-me-park-session";
export const SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT = "say-to-me-permission-issue";
export const SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT = "say-to-me-playback-change";

/**
 * Optional host note when STM is still on S1-only emit set.
 * S2/S3 emit create/usage/playback from the widget itself — leave unset at runtime.
 */
export const SAY_TO_ME_VOICE_WIDGET_S1_LIMITATION =
  "Host ready for S2/S3 events; widget UI arrives when STM S2 is loaded.";

const WIDGET_SOURCE = "say-to-me-widget";
const WIDGET_VERSION = 1;

export type SayToMeVoiceWidgetLoader =
  | {
      readonly mode: "hmr";
      readonly moduleUrl: string;
    }
  | {
      readonly mode: "classic";
      readonly scriptSrc: string;
    };

export type SayToMeVoiceWidgetEventType =
  | "collapse-change"
  | "error"
  | "insert-usage-prompt"
  | "open-session"
  | "park-session"
  | "permission-issue"
  | "playback-change";

declare global {
  interface HTMLElementTagNameMap {
    "say-to-me-voice-widget": HTMLElement;
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "say-to-me-voice-widget": React.DetailedHTMLProps<
          React.HTMLAttributes<HTMLElement>,
          HTMLElement
        > & {
          "session-id"?: string;
          "notes-base-url"?: string;
          "can-autoplay"?: string;
          "storage-key"?: string;
          "ui-base-url"?: string;
          "timers-base-url"?: string;
        };
      }
    }
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Localhost T3 DEV prefers STM's Vite HMR module (may fail without CORS — see
 * `loadSayToMeVoiceWidgetHmrModuleOnce` classic fallback).
 * Everywhere else keeps the fixed same-origin proxied classic script.
 */
export function resolveSayToMeVoiceWidgetLoader(input?: {
  readonly hostname?: string | null;
  readonly isDev?: boolean;
}): SayToMeVoiceWidgetLoader {
  const isDev = input?.isDev ?? Boolean(import.meta.env.DEV);
  const hostname =
    input?.hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");

  if (isDev && isLocalHostname(hostname)) {
    return {
      mode: "hmr",
      moduleUrl: SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL,
    };
  }

  return {
    mode: "classic",
    scriptSrc: SAY_TO_ME_VOICE_WIDGET_SRC,
  };
}

let voiceWidgetHmrModuleImportStarted = false;
let voiceWidgetHmrFellBackToClassic = false;

export type LoadSayToMeVoiceWidgetHmrResult = "hmr" | "classic-fallback";

/**
 * Attempt the direct STM HMR import once. STM Astro intentionally has no
 * cross-origin CORS/HMR headers, so localhost imports often fail — fall back to
 * the fixed same-origin proxied classic script in that case.
 */
export function loadSayToMeVoiceWidgetHmrModuleOnce(
  moduleUrl: string = SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL,
  options?: {
    readonly importModule?: (url: string) => Promise<unknown>;
    readonly onResult?: (result: LoadSayToMeVoiceWidgetHmrResult) => void;
  },
): void {
  if (voiceWidgetHmrModuleImportStarted) {
    options?.onResult?.(voiceWidgetHmrFellBackToClassic ? "classic-fallback" : "hmr");
    return;
  }
  voiceWidgetHmrModuleImportStarted = true;

  const importModule = options?.importModule ?? ((url: string) => import(/* @vite-ignore */ url));

  void importModule(moduleUrl).then(
    () => {
      options?.onResult?.("hmr");
    },
    (error: unknown) => {
      voiceWidgetHmrFellBackToClassic = true;
      console.warn(
        "[say-to-me-voice-widget] HMR import failed; falling back to same-origin classic script",
        error,
      );
      options?.onResult?.("classic-fallback");
    },
  );
}

/** Whether the once-guard already fell back to the proxied classic script. */
export function didSayToMeVoiceWidgetHmrFallBackToClassic(): boolean {
  return voiceWidgetHmrFellBackToClassic;
}

/** Test-only reset for the once-guard. */
export function __resetSayToMeVoiceWidgetHmrLoaderForTests(): void {
  voiceWidgetHmrModuleImportStarted = false;
  voiceWidgetHmrFellBackToClassic = false;
}

/** Strict Host Contract attribute value for can-autoplay (1 or 0 only). */
export function sayToMeVoiceWidgetCanAutoplayAttr(canAutoplay: boolean): "1" | "0" {
  return canAutoplay ? "1" : "0";
}

function isWidgetBaseDetail(
  detail: unknown,
  type: SayToMeVoiceWidgetEventType,
): detail is Record<string, unknown> {
  if (detail === null || typeof detail !== "object") return false;
  const record = detail as Record<string, unknown>;
  return (
    record.source === WIDGET_SOURCE && record.version === WIDGET_VERSION && record.type === type
  );
}

function isCustomEventNamed(event: Event, type: string): event is CustomEvent {
  return event.type === type && event instanceof CustomEvent;
}

export function isSayToMeVoiceWidgetCollapseDetail(detail: unknown): boolean {
  if (!isWidgetBaseDetail(detail, "collapse-change")) return false;
  return typeof detail.collapsed === "boolean";
}

export function isSayToMeVoiceWidgetCollapseEvent(event: Event): boolean {
  if (!isCustomEventNamed(event, SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT)) return false;
  return isSayToMeVoiceWidgetCollapseDetail(event.detail);
}

export function isSayToMeVoiceWidgetErrorDetail(detail: unknown): boolean {
  if (!isWidgetBaseDetail(detail, "error")) return false;
  return typeof detail.message === "string";
}

export function isSayToMeVoiceWidgetErrorEvent(event: Event): boolean {
  if (!isCustomEventNamed(event, SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT)) return false;
  return isSayToMeVoiceWidgetErrorDetail(event.detail);
}

export function isSayToMeVoiceWidgetInsertUsagePromptDetail(detail: unknown): boolean {
  if (!isWidgetBaseDetail(detail, "insert-usage-prompt")) return false;
  if (typeof detail.prompt !== "string") return false;
  // Optional STM field; when present must be a string.
  if ("sessionId" in detail && typeof detail.sessionId !== "string") return false;
  return true;
}

export function isSayToMeVoiceWidgetInsertUsagePromptEvent(event: Event): boolean {
  if (!isCustomEventNamed(event, SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT)) return false;
  return isSayToMeVoiceWidgetInsertUsagePromptDetail(event.detail);
}

export function isSayToMeVoiceWidgetOpenSessionDetail(detail: unknown): boolean {
  return isWidgetBaseDetail(detail, "open-session");
}

export function isSayToMeVoiceWidgetOpenSessionEvent(event: Event): boolean {
  if (!isCustomEventNamed(event, SAY_TO_ME_VOICE_WIDGET_OPEN_SESSION_EVENT)) return false;
  return isSayToMeVoiceWidgetOpenSessionDetail(event.detail);
}

export function isSayToMeVoiceWidgetParkSessionDetail(detail: unknown): boolean {
  return isWidgetBaseDetail(detail, "park-session");
}

export function isSayToMeVoiceWidgetParkSessionEvent(event: Event): boolean {
  if (!isCustomEventNamed(event, SAY_TO_ME_VOICE_WIDGET_PARK_SESSION_EVENT)) return false;
  return isSayToMeVoiceWidgetParkSessionDetail(event.detail);
}

export function isSayToMeVoiceWidgetPermissionIssueDetail(detail: unknown): boolean {
  return isWidgetBaseDetail(detail, "permission-issue");
}

export function isSayToMeVoiceWidgetPermissionIssueEvent(event: Event): boolean {
  if (!isCustomEventNamed(event, SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT)) return false;
  return isSayToMeVoiceWidgetPermissionIssueDetail(event.detail);
}

export function isSayToMeVoiceWidgetPlaybackChangeDetail(detail: unknown): boolean {
  if (!isWidgetBaseDetail(detail, "playback-change")) return false;
  // STM S2 emits playingId: string | null (not a boolean `playing` flag).
  return detail.playingId === null || typeof detail.playingId === "string";
}

export function isSayToMeVoiceWidgetPlaybackChangeEvent(event: Event): boolean {
  if (!isCustomEventNamed(event, SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT)) return false;
  return isSayToMeVoiceWidgetPlaybackChangeDetail(event.detail);
}
