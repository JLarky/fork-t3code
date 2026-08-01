/** Same-origin proxied URL for the STM Park-button custom-element script. */
export const SAY_TO_ME_PARK_BUTTON_SRC = "/api/say-to-me/embed/park-button.js";

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

/** Host availability for the STM park-button custom element. */
export type ParkButtonHostStatus =
  | { readonly mode: "custom-element" }
  | {
      readonly mode: "fallback";
      readonly reason: "pending" | "script-load-failed" | "element-undefined";
    };

export const PARK_BUTTON_ELEMENT_WAIT_MS = 3_000;

export type ResolveParkButtonHostStatusDeps = {
  readonly scriptSrc?: string;
  readonly loadScript?: (src: string) => Promise<void>;
  readonly isElementDefined?: () => boolean;
  readonly whenElementDefined?: () => Promise<unknown>;
  readonly timeoutMs?: number;
};

export function isSayToMeParkButtonElementDefined(
  registry: {
    get(name: string): CustomElementConstructor | undefined;
  } = customElements,
): boolean {
  return registry.get(SAY_TO_ME_PARK_BUTTON_TAG) !== undefined;
}

const PARK_BUTTON_SCRIPT_SRC_ATTR = "data-park-button-src";

/** In-flight loads keyed by script URL — concurrent mounts share one request. */
const parkButtonScriptLoads = new Map<string, Promise<void>>();

export type ParkButtonScriptElement = {
  src: string;
  async: boolean;
  dataset: DOMStringMap | Record<string, string | undefined>;
  setAttribute(name: string, value: string): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  remove(): void;
};

export type ParkButtonScriptDocument = {
  querySelector(selectors: string): ParkButtonScriptElement | null;
  createElement(tagName: "script"): ParkButtonScriptElement;
  head: { appendChild(node: ParkButtonScriptElement): ParkButtonScriptElement };
};

function parkButtonScriptDocument(): ParkButtonScriptDocument {
  if (typeof document === "undefined") {
    throw new Error("document unavailable");
  }
  return document as unknown as ParkButtonScriptDocument;
}

function findParkButtonScript(
  doc: ParkButtonScriptDocument,
  src: string,
): ParkButtonScriptElement | null {
  return (
    doc.querySelector(`script[${PARK_BUTTON_SCRIPT_SRC_ATTR}="${src}"]`) ??
    // COMPAT: older host inserts used src= only and could hang after error.
    doc.querySelector(`script[src="${src}"]`)
  );
}

/**
 * Load the fixed same-origin park-button script.
 * Concurrent callers share one in-flight promise. Failed scripts are marked and
 * removed on the next attempt so remounts retry instead of hanging on a stale tag.
 */
export function loadSayToMeParkButtonScript(
  src: string = SAY_TO_ME_PARK_BUTTON_SRC,
  doc: ParkButtonScriptDocument = parkButtonScriptDocument(),
): Promise<void> {
  const inflight = parkButtonScriptLoads.get(src);
  if (inflight) {
    return inflight;
  }

  const loadPromise = new Promise<void>((resolve, reject) => {
    try {
      const existing = findParkButtonScript(doc, src);
      if (existing?.dataset.loaded === "true") {
        resolve();
        return;
      }

      // Prior failure (or an unmarked stuck tag): drop it and retry with a fresh script.
      if (existing) {
        existing.remove();
      }

      const script = doc.createElement("script");
      script.src = src;
      script.async = true;
      script.setAttribute(PARK_BUTTON_SCRIPT_SRC_ATTR, src);
      script.dataset.testid = "say-to-me-park-button-script";
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          delete script.dataset.failed;
          resolve();
        },
        { once: true },
      );
      script.addEventListener(
        "error",
        () => {
          script.dataset.failed = "true";
          reject(new Error(`Failed to load ${src}`));
        },
        { once: true },
      );
      doc.head.appendChild(script);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

  parkButtonScriptLoads.set(src, loadPromise);
  void loadPromise
    .finally(() => {
      if (parkButtonScriptLoads.get(src) === loadPromise) {
        parkButtonScriptLoads.delete(src);
      }
    })
    // Callers observe `loadPromise` directly; don't surface a second rejection.
    .catch(() => undefined);
  return loadPromise;
}

/** Test-only: clear in-flight script bookkeeping between cases. */
export function resetParkButtonScriptLoadsForTests(): void {
  parkButtonScriptLoads.clear();
}

/**
 * Resolve whether the STM park-button custom element is usable.
 * On script/definition failure, callers keep the legacy Park fallback visible.
 */
export async function resolveParkButtonHostStatus(
  deps: ResolveParkButtonHostStatusDeps = {},
): Promise<Exclude<ParkButtonHostStatus, { reason: "pending" }>> {
  const isElementDefined = deps.isElementDefined ?? (() => isSayToMeParkButtonElementDefined());
  if (isElementDefined()) {
    return { mode: "custom-element" };
  }

  const loadScript = deps.loadScript ?? loadSayToMeParkButtonScript;
  try {
    await loadScript(deps.scriptSrc ?? SAY_TO_ME_PARK_BUTTON_SRC);
  } catch {
    return { mode: "fallback", reason: "script-load-failed" };
  }

  if (isElementDefined()) {
    return { mode: "custom-element" };
  }

  const whenElementDefined =
    deps.whenElementDefined ?? (() => customElements.whenDefined(SAY_TO_ME_PARK_BUTTON_TAG));
  const timeoutMs = deps.timeoutMs ?? PARK_BUTTON_ELEMENT_WAIT_MS;

  try {
    await Promise.race([
      whenElementDefined(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("park-button element timeout")), timeoutMs);
      }),
    ]);
  } catch {
    return { mode: "fallback", reason: "element-undefined" };
  }

  return isElementDefined()
    ? { mode: "custom-element" }
    : { mode: "fallback", reason: "element-undefined" };
}
