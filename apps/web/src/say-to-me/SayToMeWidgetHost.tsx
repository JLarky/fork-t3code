import { createElement, useEffect, useRef } from "react";

import {
  assignParkSessionFromEvent,
  importSayToMeWidgetHmrModule,
  resolveSayToMeWidgetHmrModuleUrl,
  SAY_TO_ME_PARK_SESSION_EVENT,
  SAY_TO_ME_WIDGET_SRC,
  SAY_TO_ME_WIDGET_TAG,
  type ParkSessionContext,
} from "./widget";

type SayToMeWidgetHostProps = ParkSessionContext & {
  readonly sessionId: string;
};

/**
 * Tiny host for STM `<say-to-me-widget>`.
 * Loads the direct STM Vite module in configured localhost development, otherwise
 * the fixed same-origin script. Navigation still requires a validated event.
 */
export function SayToMeWidgetHost({
  sessionId,
  environmentId,
  threadId,
  title,
  project,
  cwd,
  branch,
}: SayToMeWidgetHostProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const hmrModuleUrl = resolveSayToMeWidgetHmrModuleUrl();

  useEffect(() => {
    if (hmrModuleUrl === null) return;
    void importSayToMeWidgetHmrModule(hmrModuleUrl).catch((error: unknown) => {
      console.error("[say-to-me-widget] Failed to import STM HMR module", error);
    });
  }, [hmrModuleUrl]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const onParkSession = (event: Event) => {
      assignParkSessionFromEvent(event, sessionId, {
        environmentId,
        threadId,
        title,
        project,
        cwd,
        branch,
      });
    };

    node.addEventListener(SAY_TO_ME_PARK_SESSION_EVENT, onParkSession);
    return () => {
      node.removeEventListener(SAY_TO_ME_PARK_SESSION_EVENT, onParkSession);
    };
  }, [sessionId, environmentId, threadId, title, project, cwd, branch]);

  return (
    <span
      ref={hostRef}
      data-testid="say-to-me-widget-host"
      className="inline-flex shrink-0 items-center justify-center"
    >
      {hmrModuleUrl === null ? (
        <script src={SAY_TO_ME_WIDGET_SRC} async data-testid="say-to-me-widget-script" />
      ) : null}
      {createElement(SAY_TO_ME_WIDGET_TAG, {
        "session-id": sessionId,
        "data-testid": "say-to-me-widget-element",
      })}
    </span>
  );
}
