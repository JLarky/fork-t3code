/**
 * Serializes audible output for the Say To Me feature so a notification ding
 * never plays on top of a spoken voice note. Say To Me itself queues playback
 * as messages; here the queue is a promise chain that both the speech and the
 * idle chime pass through.
 *
 * Each task is bounded by a timeout so a `speechSynthesis` utterance that never
 * reports `end` (which browsers do drop, notably after `cancel()`) cannot wedge
 * the queue and silence everything that follows.
 */

let tail: Promise<unknown> = Promise.resolve();

/** Host-side playback gate from `<say-to-me-voice-widget>` `playback-change`. */
let voiceWidgetPlaybackActive = false;

export function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function runBounded(play: () => Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      play(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // A failed sound must not stall the rest of the queue.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Queues audible output behind whatever is already playing. `play` should
 * resolve when its sound has finished, not when it starts.
 */
export function enqueueSound(
  play: () => Promise<void>,
  { timeoutMs }: { timeoutMs: number },
): Promise<void> {
  const next = tail.then(
    () => runBounded(play, timeoutMs),
    () => runBounded(play, timeoutMs),
  );
  tail = next;
  return next;
}

/**
 * Marks widget-owned voice playback so the idle completion ding waits, matching
 * the same policy used for `speechSynthesis` speech.
 */
export function setVoiceWidgetPlaybackActive(active: boolean): void {
  voiceWidgetPlaybackActive = active;
}

/** True while the browser is speaking, has speech queued, or the widget is playing. */
export function isSpeechActive(): boolean {
  if (voiceWidgetPlaybackActive) return true;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const speech = window.speechSynthesis;
  return speech.speaking || speech.pending;
}

export function __resetAudioQueueForTests(): void {
  tail = Promise.resolve();
  voiceWidgetPlaybackActive = false;
}
