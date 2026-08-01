import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  __resetSayToMeVoiceWidgetHmrLoaderForTests,
  didSayToMeVoiceWidgetHmrFallBackToClassic,
  isSayToMeVoiceWidgetCollapseDetail,
  isSayToMeVoiceWidgetCollapseEvent,
  isSayToMeVoiceWidgetErrorDetail,
  isSayToMeVoiceWidgetErrorEvent,
  isSayToMeVoiceWidgetInsertUsagePromptDetail,
  isSayToMeVoiceWidgetInsertUsagePromptEvent,
  isSayToMeVoiceWidgetOpenSessionDetail,
  isSayToMeVoiceWidgetOpenSessionEvent,
  isSayToMeVoiceWidgetParkSessionDetail,
  isSayToMeVoiceWidgetParkSessionEvent,
  isSayToMeVoiceWidgetPermissionIssueDetail,
  isSayToMeVoiceWidgetPermissionIssueEvent,
  isSayToMeVoiceWidgetPlaybackChangeDetail,
  isSayToMeVoiceWidgetPlaybackChangeEvent,
  loadSayToMeVoiceWidgetHmrModuleOnce,
  resolveSayToMeVoiceWidgetLoader,
  SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY,
  SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT,
  SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL,
  SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT,
  SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL,
  SAY_TO_ME_VOICE_WIDGET_OPEN_SESSION_EVENT,
  SAY_TO_ME_VOICE_WIDGET_PARK_SESSION_EVENT,
  SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT,
  SAY_TO_ME_VOICE_WIDGET_S1_LIMITATION,
  SAY_TO_ME_VOICE_WIDGET_SRC,
  SAY_TO_ME_VOICE_WIDGET_TAG,
  sayToMeVoiceWidgetCanAutoplayAttr,
  sayToMeVoiceWidgetContextAttrs,
  sayToMeVoiceWidgetHostPanelClass,
  sayToMeVoiceWidgetHostSectionClass,
} from "./voiceWidget";

const base = {
  source: "say-to-me-widget",
  version: 1,
} as const;

afterEach(() => {
  __resetSayToMeVoiceWidgetHmrLoaderForTests();
});

describe("Say To Me liftSolid voice widget loader", () => {
  it("keeps the proxied classic script path for non-local hosts", () => {
    expect(SAY_TO_ME_VOICE_WIDGET_SRC).toBe("/api/say-to-me/embed/voice-widget.js");
    expect(SAY_TO_ME_VOICE_WIDGET_SRC).not.toContain("5411");
    expect(SAY_TO_ME_VOICE_WIDGET_TAG).toBe("say-to-me-voice-widget");
    expect(SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL).toBe("/api/voice-notes");
    expect(SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY).toBe(
      "t3code:say-to-me-banner-collapsed:v1",
    );
    expect(SAY_TO_ME_VOICE_WIDGET_S1_LIMITATION).toMatch(/S2\/S3/i);
    expect(sayToMeVoiceWidgetCanAutoplayAttr(true)).toBe("1");
    expect(sayToMeVoiceWidgetCanAutoplayAttr(false)).toBe("0");
  });

  it("keeps collapsed floating mounts shrink-to-fit like the legacy banner", () => {
    for (const className of [
      sayToMeVoiceWidgetHostSectionClass(true),
      sayToMeVoiceWidgetHostPanelClass(true),
    ]) {
      expect(className).toContain("w-max");
      expect(className.split(" ").filter((token) => token.startsWith("w-["))).toEqual([]);
    }
    expect(sayToMeVoiceWidgetHostSectionClass(true)).toContain("absolute top-2 right-[10px]");
  });

  it("builds S-theme context attrs without blanks", () => {
    expect(
      sayToMeVoiceWidgetContextAttrs({
        sessionTitle: " Thread ",
        projectName: "",
        workingDirectory: "/tmp/x",
        branchName: null,
      }),
    ).toEqual({
      "session-title": "Thread",
      "working-directory": "/tmp/x",
    });
  });

  it("selects the direct STM HMR module on localhost/dev", () => {
    expect(resolveSayToMeVoiceWidgetLoader({ hostname: "localhost", isDev: true })).toEqual({
      mode: "hmr",
      moduleUrl: SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL,
    });
    expect(resolveSayToMeVoiceWidgetLoader({ hostname: "127.0.0.1", isDev: true })).toEqual({
      mode: "hmr",
      moduleUrl: SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL,
    });
    expect(SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL).toBe(
      "http://localhost:5411/server/embed/solid/voice-widget-hmr.ts",
    );
  });

  it("falls back to the proxied classic script outside localhost/dev", () => {
    expect(resolveSayToMeVoiceWidgetLoader({ hostname: "localhost", isDev: false })).toEqual({
      mode: "classic",
      scriptSrc: SAY_TO_ME_VOICE_WIDGET_SRC,
    });
    expect(
      resolveSayToMeVoiceWidgetLoader({
        hostname: "lima-default.tail052173.ts.net",
        isDev: true,
      }),
    ).toEqual({
      mode: "classic",
      scriptSrc: SAY_TO_ME_VOICE_WIDGET_SRC,
    });
  });

  it("falls back to same-origin classic script when localhost HMR import fails", async () => {
    const results: string[] = [];
    const importModule = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    loadSayToMeVoiceWidgetHmrModuleOnce(SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL, {
      importModule,
      onResult: (result) => {
        results.push(result);
      },
    });

    await vi.waitFor(() => {
      expect(results).toEqual(["classic-fallback"]);
    });
    expect(importModule).toHaveBeenCalledWith(SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL);
    expect(didSayToMeVoiceWidgetHmrFallBackToClassic()).toBe(true);
    expect(SAY_TO_ME_VOICE_WIDGET_SRC).toBe("/api/say-to-me/embed/voice-widget.js");
  });

  it("keeps HMR mode when the direct localhost import succeeds", async () => {
    const results: string[] = [];
    const importModule = vi.fn(async () => ({ ok: true }));

    loadSayToMeVoiceWidgetHmrModuleOnce(SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL, {
      importModule,
      onResult: (result) => {
        results.push(result);
      },
    });

    await vi.waitFor(() => {
      expect(results).toEqual(["hmr"]);
    });
    expect(didSayToMeVoiceWidgetHmrFallBackToClassic()).toBe(false);
  });

  it("accepts Host Contract v1 event envelopes including S2/S3 action types", () => {
    expect(
      isSayToMeVoiceWidgetCollapseDetail({
        ...base,
        type: "collapse-change",
        collapsed: true,
      }),
    ).toBe(true);
    expect(
      isSayToMeVoiceWidgetCollapseEvent(
        new CustomEvent(SAY_TO_ME_VOICE_WIDGET_COLLAPSE_EVENT, {
          detail: { ...base, type: "collapse-change", collapsed: false },
        }),
      ),
    ).toBe(true);
    expect(
      isSayToMeVoiceWidgetErrorDetail({
        ...base,
        type: "error",
        message: "boom",
      }),
    ).toBe(true);
    expect(
      isSayToMeVoiceWidgetErrorEvent(
        new CustomEvent(SAY_TO_ME_VOICE_WIDGET_ERROR_EVENT, {
          detail: { ...base, type: "error", message: "boom" },
        }),
      ),
    ).toBe(true);

    expect(
      isSayToMeVoiceWidgetInsertUsagePromptDetail({
        ...base,
        type: "insert-usage-prompt",
        prompt: "exact prompt from widget",
      }),
    ).toBe(true);
    expect(
      isSayToMeVoiceWidgetInsertUsagePromptEvent(
        new CustomEvent(SAY_TO_ME_VOICE_WIDGET_INSERT_USAGE_PROMPT_EVENT, {
          detail: { ...base, type: "insert-usage-prompt", prompt: "exact" },
        }),
      ),
    ).toBe(true);
    expect(
      isSayToMeVoiceWidgetInsertUsagePromptDetail({
        ...base,
        type: "insert-usage-prompt",
      }),
    ).toBe(false);

    expect(isSayToMeVoiceWidgetOpenSessionDetail({ ...base, type: "open-session" })).toBe(true);
    expect(
      isSayToMeVoiceWidgetOpenSessionEvent(
        new CustomEvent(SAY_TO_ME_VOICE_WIDGET_OPEN_SESSION_EVENT, {
          detail: { ...base, type: "open-session" },
        }),
      ),
    ).toBe(true);
    expect(isSayToMeVoiceWidgetParkSessionDetail({ ...base, type: "park-session" })).toBe(true);
    expect(
      isSayToMeVoiceWidgetParkSessionEvent(
        new CustomEvent(SAY_TO_ME_VOICE_WIDGET_PARK_SESSION_EVENT, {
          detail: { ...base, type: "park-session" },
        }),
      ),
    ).toBe(true);
    expect(isSayToMeVoiceWidgetPermissionIssueDetail({ ...base, type: "permission-issue" })).toBe(
      true,
    );
    expect(
      isSayToMeVoiceWidgetPermissionIssueEvent(
        new CustomEvent(SAY_TO_ME_VOICE_WIDGET_PERMISSION_ISSUE_EVENT, {
          detail: { ...base, type: "permission-issue" },
        }),
      ),
    ).toBe(true);

    expect(
      isSayToMeVoiceWidgetPlaybackChangeDetail({
        ...base,
        type: "playback-change",
        playingId: null,
      }),
    ).toBe(true);
    expect(
      isSayToMeVoiceWidgetPlaybackChangeEvent(
        new CustomEvent(SAY_TO_ME_VOICE_WIDGET_PLAYBACK_CHANGE_EVENT, {
          detail: { ...base, type: "playback-change", playingId: "42" },
        }),
      ),
    ).toBe(true);
    expect(
      isSayToMeVoiceWidgetPlaybackChangeDetail({
        ...base,
        type: "playback-change",
        playing: true,
      }),
    ).toBe(false);

    expect(
      isSayToMeVoiceWidgetCollapseDetail({
        source: "say-to-me-lift",
        version: 1,
        type: "collapse-change",
        collapsed: true,
      }),
    ).toBe(false);
  });
});
