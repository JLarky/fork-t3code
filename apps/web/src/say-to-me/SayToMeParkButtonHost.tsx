import { createElement, useEffect, useRef } from "react";

import {
  assignParkSessionFromEvent,
  SAY_TO_ME_PARK_BUTTON_EVENT,
  SAY_TO_ME_PARK_BUTTON_SRC,
  SAY_TO_ME_PARK_BUTTON_TAG,
  type ParkSessionContext,
} from "./parkButton";

type SayToMeParkButtonHostProps = ParkSessionContext & {
  readonly sessionId: string;
};

/**
 * Tiny host for STM `<say-to-me-park-button>`.
 * Loads the fixed same-origin proxied script and runs legacy /park navigation
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
      <script src={SAY_TO_ME_PARK_BUTTON_SRC} async data-testid="say-to-me-park-button-script" />
      {createElement(SAY_TO_ME_PARK_BUTTON_TAG, {
        "session-id": sessionId,
        "data-testid": "say-to-me-park-button-element",
      })}
    </span>
  );
}
