import { createElement, useEffect, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import {
  assignParkSessionFromEvent,
  assignParkSessionUrl,
  resolveParkButtonHostStatus,
  SAY_TO_ME_PARK_BUTTON_EVENT,
  SAY_TO_ME_PARK_BUTTON_TAG,
  type ParkButtonHostStatus,
  type ParkSessionContext,
  type ResolveParkButtonHostStatusDeps,
} from "./parkButton";

type SayToMeParkButtonHostProps = ParkSessionContext & {
  readonly sessionId: string;
  /** Test override for deterministic host markup/status. */
  readonly availability?: ParkButtonHostStatus;
  /** Test override for script/element availability resolution. */
  readonly resolveAvailability?: (
    deps?: ResolveParkButtonHostStatusDeps,
  ) => Promise<Exclude<ParkButtonHostStatus, { reason: "pending" }>>;
};

const LEGACY_PARK_BUTTON_CLASSNAME =
  "h-6 w-6 shrink-0 justify-center px-0 font-mono text-[10px] text-muted-foreground hover:text-foreground short:h-5 short:w-5 short:text-[9px]";

/**
 * Thin host for STM `<say-to-me-park-button>`.
 * Keeps a compact legacy Park control available until/unless the custom element
 * registers; failed script/definition keeps the legacy control and surfaces error state.
 */
export function SayToMeParkButtonHost({
  sessionId,
  environmentId,
  threadId,
  title,
  project,
  cwd,
  branch,
  availability,
  resolveAvailability = resolveParkButtonHostStatus,
}: SayToMeParkButtonHostProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [status, setStatus] = useState<ParkButtonHostStatus>(
    () => availability ?? { mode: "fallback", reason: "pending" },
  );

  const parkContext: ParkSessionContext = {
    environmentId,
    threadId,
    title,
    project,
    cwd,
    branch,
  };

  useEffect(() => {
    if (availability) {
      setStatus(availability);
      return;
    }

    let cancelled = false;
    void resolveAvailability().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [availability, resolveAvailability]);

  useEffect(() => {
    if (status.mode !== "custom-element") return;
    const node = hostRef.current;
    if (!node) return;

    const onParkSession = (event: Event) => {
      assignParkSessionFromEvent(event, sessionId, parkContext);
    };

    node.addEventListener(SAY_TO_ME_PARK_BUTTON_EVENT, onParkSession);
    return () => {
      node.removeEventListener(SAY_TO_ME_PARK_BUTTON_EVENT, onParkSession);
    };
  }, [status.mode, sessionId, environmentId, threadId, title, project, cwd, branch]);

  const embedUnavailable =
    status.mode === "fallback" && status.reason !== "pending" ? status.reason : undefined;

  return (
    <span
      ref={hostRef}
      data-testid="say-to-me-park-button-host"
      data-park-availability={status.mode}
      data-park-reason={status.mode === "fallback" ? status.reason : undefined}
      data-park-error={embedUnavailable}
      className="inline-flex shrink-0 items-center justify-center"
    >
      {status.mode === "custom-element" ? (
        createElement(SAY_TO_ME_PARK_BUTTON_TAG, {
          "session-id": sessionId,
          "data-testid": "say-to-me-park-button-element",
        })
      ) : (
        <Button
          size="xs"
          variant="ghost"
          aria-label="Park session"
          title={embedUnavailable ? "Park session (Say To Me embed unavailable)" : "Park session"}
          data-testid="say-to-me-park-button-fallback"
          className={LEGACY_PARK_BUTTON_CLASSNAME}
          onClick={() => assignParkSessionUrl(parkContext)}
        >
          P
        </Button>
      )}
    </span>
  );
}
