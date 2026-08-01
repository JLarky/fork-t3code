import { createElement, useEffect, useRef } from "react";

import {
  assignParkSessionFromEvent,
  importSayToMeParkButtonModule,
  SAY_TO_ME_PARK_BUTTON_EVENT,
  SAY_TO_ME_PARK_BUTTON_TAG,
  sayToMeParkButtonModuleUrl,
  type ParkSessionContext,
} from "./parkButton";

type SayToMeParkButtonHostProps = ParkSessionContext & {
  readonly sessionId: string;
};

/**
 * Tiny host for STM `<say-to-me-park-button>`.
 * Imports the one stable STM embed URL (direct STM origin in localhost
 * development, same-origin proxy otherwise) and runs legacy /park navigation
 * only after a validated bubbling/composed `say-to-me-park-session` event.
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
  const moduleUrl = sayToMeParkButtonModuleUrl();

  useEffect(() => {
    void importSayToMeParkButtonModule(moduleUrl).catch((error: unknown) => {
      console.error("[say-to-me-park-button] Failed to import STM embed module", error);
    });
  }, [moduleUrl]);

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
      {createElement(SAY_TO_ME_PARK_BUTTON_TAG, {
        "session-id": sessionId,
        "data-testid": "say-to-me-park-button-element",
      })}
    </span>
  );
}
