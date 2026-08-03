import { createElement, useEffect, useRef, useState } from "react";

import { SAY_TO_ME_UI_URL } from "./sayToMeUi";
import {
  assignParkSessionFromEvent,
  ensureSayToMeWidgetDefinition,
  parseSayToMeWidgetEvent,
  resolveSayToMeWidgetHmrModuleUrl,
  waitForSayToMeWidgetV2,
  SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT,
  SAY_TO_ME_WIDGET_PARK_SESSION_EVENT,
  SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT,
  SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT,
  SAY_TO_ME_WIDGET_STORAGE_KEY,
  SAY_TO_ME_WIDGET_TAG,
  SAY_TO_ME_WIDGET_TIMERS_BASE_URL,
  SAY_TO_ME_WIDGET_NOTES_BASE_URL,
  type ParkSessionContext,
} from "./widget";

type SayToMeWidgetHostProps = ParkSessionContext & {
  readonly sessionId: string;
  readonly onInsertUsagePrompt?: () => void;
  readonly onSpeechActivityChange?: (active: boolean) => void;
};

const CAPABILITY_TIMEOUT_MS = 5_000;

/** Whole production STM banner host. The React banner remains available only to the dev gallery. */
export function SayToMeWidgetHost({
  sessionId,
  environmentId,
  threadId,
  title,
  project,
  cwd,
  branch,
  onInsertUsagePrompt,
  onSpeechActivityChange,
}: SayToMeWidgetHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [capability, setCapability] = useState<"loading" | "ready" | "unavailable">("loading");
  const hmrModuleUrl = resolveSayToMeWidgetHmrModuleUrl();

  useEffect(() => {
    const node = hostRef.current;
    const widget = node?.querySelector<HTMLElement>(SAY_TO_ME_WIDGET_TAG);
    if (!node || !widget) return;
    let disposed = false;
    const context = { environmentId, threadId, title, project, cwd, branch };

    const onWidgetEvent = (event: Event) => {
      const detail = parseSayToMeWidgetEvent(event, sessionId);
      if (!detail) return;
      if (detail.type === "park-session") {
        assignParkSessionFromEvent(event, sessionId, context);
      } else if (detail.type === "insert-usage-prompt") {
        onInsertUsagePrompt?.();
      } else {
        onSpeechActivityChange?.(detail.type === "speech-started");
      }
    };
    node.addEventListener(SAY_TO_ME_WIDGET_PARK_SESSION_EVENT, onWidgetEvent);
    node.addEventListener(SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT, onWidgetEvent);
    node.addEventListener(SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT, onWidgetEvent);
    node.addEventListener(SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT, onWidgetEvent);

    void ensureSayToMeWidgetDefinition(hmrModuleUrl)
      .then(() => waitForSayToMeWidgetV2(widget, CAPABILITY_TIMEOUT_MS))
      .then((isV2) => {
        if (disposed) return;
        setCapability(isV2 ? "ready" : "unavailable");
        if (!isV2) {
          console.error("[say-to-me-widget] STM v2 widget capability is unavailable");
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setCapability("unavailable");
        console.error("[say-to-me-widget] Failed to load STM v2 widget", error);
      });

    return () => {
      disposed = true;
      node.removeEventListener(SAY_TO_ME_WIDGET_PARK_SESSION_EVENT, onWidgetEvent);
      node.removeEventListener(SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT, onWidgetEvent);
      node.removeEventListener(SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT, onWidgetEvent);
      node.removeEventListener(SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT, onWidgetEvent);
      onSpeechActivityChange?.(false);
    };
  }, [
    branch,
    cwd,
    environmentId,
    hmrModuleUrl,
    onInsertUsagePrompt,
    onSpeechActivityChange,
    project,
    sessionId,
    threadId,
    title,
  ]);

  return (
    <div
      ref={hostRef}
      data-testid="say-to-me-widget-host"
      className="relative block w-full min-w-0 shrink-0"
    >
      {createElement(SAY_TO_ME_WIDGET_TAG, {
        "session-id": sessionId,
        "notes-base-url": SAY_TO_ME_WIDGET_NOTES_BASE_URL,
        "timers-base-url": SAY_TO_ME_WIDGET_TIMERS_BASE_URL,
        "ui-base-url": SAY_TO_ME_UI_URL,
        "storage-key": SAY_TO_ME_WIDGET_STORAGE_KEY,
        "data-testid": "say-to-me-widget-element",
        hidden: capability !== "ready",
      })}
      {capability === "unavailable" ? (
        <div
          role="status"
          data-testid="say-to-me-widget-unavailable"
          className="mx-auto w-full max-w-[48rem] rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          Say To Me is unavailable. Update T3 to use the STM v2 widget.
        </div>
      ) : null}
    </div>
  );
}
