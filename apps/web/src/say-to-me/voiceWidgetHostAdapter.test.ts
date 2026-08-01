import { describe, expect, it } from "vite-plus/test";

import {
  SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT,
  SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT,
  SAY_TO_ME_VOICE_WIDGET_OPEN_SESSION_EVENT,
  SAY_TO_ME_VOICE_WIDGET_PARK_SESSION_EVENT,
  SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT,
} from "./voiceWidget";
import { parseSayToMeVoiceWidgetHostEvent } from "./voiceWidgetHostAdapter";

const base = {
  source: "say-to-me-widget",
  version: 1,
} as const;

function widgetEvent(type: string, detail: Record<string, unknown>): CustomEvent {
  return new CustomEvent(type, { detail });
}

describe("parseSayToMeVoiceWidgetHostEvent", () => {
  it("maps insert-usage-prompt to the exact event prompt", () => {
    const prompt =
      "you have to reply to my messages with voice (cli `say-to-me usage` to learn how/why) and your session id is t3_abc";
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT, {
          ...base,
          type: "insert-usage-prompt",
          sessionId: "t3_abc",
          prompt,
        }),
      ),
    ).toEqual({ type: "insert-usage-prompt", prompt });
  });

  it("maps open-session, park-session, and permission-issue", () => {
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_OPEN_SESSION_EVENT, {
          ...base,
          type: "open-session",
        }),
      ),
    ).toEqual({ type: "open-session" });
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_PARK_SESSION_EVENT, {
          ...base,
          type: "park-session",
        }),
      ),
    ).toEqual({ type: "park-session" });
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT, {
          ...base,
          type: "permission-issue",
        }),
      ),
    ).toEqual({ type: "permission-issue" });
  });

  it("maps playback-change via playingId and retains collapse/error", () => {
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT, {
          ...base,
          type: "playback-change",
          playingId: "42",
        }),
      ),
    ).toEqual({ type: "playback-change", playingId: "42" });
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT, {
          ...base,
          type: "playback-change",
          playingId: null,
        }),
      ),
    ).toEqual({ type: "playback-change", playingId: null });
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT, {
          ...base,
          type: "collapse-change",
          collapsed: true,
        }),
      ),
    ).toEqual({ type: "collapse-change", collapsed: true });
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT, {
          ...base,
          type: "error",
          message: "boom",
        }),
      ),
    ).toEqual({ type: "error", message: "boom" });
  });

  it("rejects mismatched type/name or missing payload fields", () => {
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT, {
          ...base,
          type: "insert-usage-prompt",
        }),
      ),
    ).toBeNull();
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent(SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT, {
          ...base,
          type: "playback-change",
          playing: true,
        }),
      ),
    ).toBeNull();
    expect(
      parseSayToMeVoiceWidgetHostEvent(
        widgetEvent("say-to-me-open-session", {
          source: "say-to-me-lift",
          version: 1,
          type: "open-session",
        }),
      ),
    ).toBeNull();
  });
});
