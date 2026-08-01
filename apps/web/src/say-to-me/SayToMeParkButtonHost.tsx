import { createElement, useEffect, useRef } from "react";

import {
  assignParkSessionFromEvent,
  importSayToMeParkButtonHmrModule,
  resolveSayToMeParkButtonHmrModuleUrl,
  SAY_TO_ME_PARK_BUTTON_EVENT,
  SAY_TO_ME_PARK_BUTTON_TAG,
  sayToMeParkButtonClassicScriptSrc,
  type ParkSessionContext,
} from "./parkButton";

type SayToMeParkButtonHostProps = ParkSessionContext & {
  readonly sessionId: string;
};

/**
 * Tiny host for STM `<say-to-me-park-button>`.
 * Loads the direct STM Vite module in explicit localhost development, otherwise
 * the fixed same-origin script. Navigation still requires a validated event.
 */
export function SayToMeParkButtonHost({
  sessionId,
  environmentId,
  threadId,
  title,
  project,
  cwd,
  branch,
}: SayToMeParkButtonHostProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const hmrModuleUrl = resolveSayToMeParkButtonHmrModuleUrl();
  const classicScriptSrc = sayToMeParkButtonClassicScriptSrc(hmrModuleUrl);

  useEffect(() => {
    if (hmrModuleUrl === null) return;
    void importSayToMeParkButtonHmrModule(hmrModuleUrl).catch((error: unknown) => {
      console.error("[say-to-me-park-button] Failed to import STM HMR module", error);
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

    node.addEventListener(SAY_TO_ME_PARK_BUTTON_EVENT, onParkSession);
    return () => {
      node.removeEventListener(SAY_TO_ME_PARK_BUTTON_EVENT, onParkSession);
    };
  }, [sessionId, environmentId, threadId, title, project, cwd, branch]);

  return (
    <span
      ref={hostRef}
      data-testid="say-to-me-park-button-host"
      className="inline-flex shrink-0 items-center justify-center"
    >
      {classicScriptSrc ? (
        <script src={classicScriptSrc} async data-testid="say-to-me-park-button-script" />
      ) : null}
      {createElement(SAY_TO_ME_PARK_BUTTON_TAG, {
        "session-id": sessionId,
        "data-testid": "say-to-me-park-button-element",
      })}
    </span>
  );
}
