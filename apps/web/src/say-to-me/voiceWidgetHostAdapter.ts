/**
 * Maps Host Contract v1 widget CustomEvents to host action intents.
 * Does not perform UI/side effects — HostedSayToMeVoiceWidget applies them.
 *
 * open-session / park-session stay parsed for contract completeness but STM S2
 * does not emit them (title uses ui-base-url; park has no shared host helper).
 */

import {
  isSayToMeVoiceWidgetCollapseEvent,
  isSayToMeVoiceWidgetErrorEvent,
  isSayToMeVoiceWidgetInsertUsagePromptEvent,
  isSayToMeVoiceWidgetOpenSessionEvent,
  isSayToMeVoiceWidgetParkSessionEvent,
  isSayToMeVoiceWidgetPermissionIssueEvent,
  isSayToMeVoiceWidgetPlaybackChangeEvent,
} from "./voiceWidget";

export type SayToMeVoiceWidgetHostAction =
  | { readonly type: "collapse-change"; readonly collapsed: boolean }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "insert-usage-prompt"; readonly prompt: string }
  | { readonly type: "open-session" }
  | { readonly type: "park-session" }
  | { readonly type: "permission-issue" }
  | { readonly type: "playback-change"; readonly playingId: string | null };

/** Parse a bubbled widget event into a host action, or null if unrecognized. */
export function parseSayToMeVoiceWidgetHostEvent(
  event: Event,
): SayToMeVoiceWidgetHostAction | null {
  if (isSayToMeVoiceWidgetCollapseEvent(event)) {
    const detail = (event as CustomEvent).detail as { collapsed: boolean };
    return { type: "collapse-change", collapsed: detail.collapsed };
  }
  if (isSayToMeVoiceWidgetErrorEvent(event)) {
    const detail = (event as CustomEvent).detail as { message: string };
    return { type: "error", message: detail.message };
  }
  if (isSayToMeVoiceWidgetInsertUsagePromptEvent(event)) {
    const detail = (event as CustomEvent).detail as { prompt: string };
    return { type: "insert-usage-prompt", prompt: detail.prompt };
  }
  if (isSayToMeVoiceWidgetOpenSessionEvent(event)) {
    return { type: "open-session" };
  }
  if (isSayToMeVoiceWidgetParkSessionEvent(event)) {
    return { type: "park-session" };
  }
  if (isSayToMeVoiceWidgetPermissionIssueEvent(event)) {
    return { type: "permission-issue" };
  }
  if (isSayToMeVoiceWidgetPlaybackChangeEvent(event)) {
    const detail = (event as CustomEvent).detail as { playingId: string | null };
    return { type: "playback-change", playingId: detail.playingId };
  }
  return null;
}
