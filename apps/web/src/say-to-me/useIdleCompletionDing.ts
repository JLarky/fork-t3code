import { useEffect, useRef } from "react";
import type { SessionPhase } from "~/types";

import { delay, enqueueSound, isSpeechActive } from "./audioQueue";
import { IDLE_COMPLETION_DING_DURATION_MS, playIdleCompletionDing } from "./sound";

export type IdleCompletionDingInput = {
  /** Identifies the watched thread so switching threads is not heard as going idle. */
  threadKey: string | null;
  /**
   * Session phase, which is what swaps the composer's send button for the stop
   * button: `running` shows stop, `ready` shows send again.
   */
  phase: SessionPhase;
  speechActive?: boolean;
};

/**
 * Decides whether a phase sample should sound the idle chime. Only a running to
 * ready transition on the same thread counts: that is exactly the moment the
 * composer's stop button turns back into the send button.
 *
 * `connecting` and `disconnected` are deliberately excluded, so interrupting a
 * turn, losing the connection, or a session erroring out stay silent.
 */
export function shouldPlayIdleCompletionDing(
  previous: IdleCompletionDingInput | null,
  next: IdleCompletionDingInput,
): boolean {
  if (previous === null) return false;
  if (previous.threadKey !== next.threadKey) return false;
  return previous.phase === "running" && next.phase === "ready";
}

/**
 * Plays the Say To Me idle chime when the watched thread finishes its turn. The
 * chime is queued behind any voice note being spoken so the two never overlap.
 */
export function useIdleCompletionDing({
  threadKey,
  phase,
  speechActive = false,
}: IdleCompletionDingInput): void {
  const previousRef = useRef<IdleCompletionDingInput | null>(null);
  const speechActiveRef = useRef(speechActive);
  speechActiveRef.current = speechActive;

  useEffect(() => {
    const next = { threadKey, phase };
    const previous = previousRef.current;
    previousRef.current = next;
    if (!shouldPlayIdleCompletionDing(previous, next)) return;

    void enqueueSound(
      async () => {
        // Speech started outside the queue (a note already being read aloud)
        // still has to finish before the chime is audible.
        while (speechActiveRef.current || isSpeechActive()) await delay(200);
        await playIdleCompletionDing();
        await delay(IDLE_COMPLETION_DING_DURATION_MS);
      },
      { timeoutMs: 60_000 },
    );
  }, [threadKey, phase]);
}
