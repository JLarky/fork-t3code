import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  assignParkSessionFromEvent,
  assignParkSessionUrl,
  buildParkSessionUrl,
  importSayToMeWidgetHmrModule,
  isSayToMeParkSessionDetail,
  isSayToMeParkSessionEvent,
  resolveSayToMeWidgetHmrModuleUrl,
  SAY_TO_ME_PARK_SESSION_EVENT,
  SAY_TO_ME_WIDGET_SRC,
  SAY_TO_ME_WIDGET_TAG,
  parseSayToMeWidgetEvent,
  SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT,
  SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT,
  SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT,
} from "./widget";

describe("Say To Me widget host adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the same-origin proxied script path, not the upstream port", () => {
    expect(SAY_TO_ME_WIDGET_SRC).toBe("/api/say-to-me/embed/widget.js");
    expect(SAY_TO_ME_WIDGET_SRC).not.toContain("5411");
    expect(SAY_TO_ME_WIDGET_TAG).toBe("say-to-me-widget");
    expect(SAY_TO_ME_PARK_SESSION_EVENT).toBe("say-to-me-park-session");
  });

  it("defaults localhost development to the canonical STM Vite origin", () => {
    expect(
      resolveSayToMeWidgetHmrModuleUrl({
        isDev: true,
        hostname: "localhost",
        stmOrigin: "http://localhost:5411",
      }),
    ).toBe("http://localhost:5411/server/embed/solid/widget-hmr.ts");
  });

  it("allows an explicit local STM Vite origin override", async () => {
    const moduleUrl = resolveSayToMeWidgetHmrModuleUrl({
      isDev: true,
      hostname: "localhost",
      stmOrigin: "http://localhost:5413/",
    });
    expect(moduleUrl).toBe("http://localhost:5413/server/embed/solid/widget-hmr.ts");

    const importModule = vi.fn(async () => undefined);
    await importSayToMeWidgetHmrModule(moduleUrl!, importModule);
    expect(importModule).toHaveBeenCalledOnce();
    expect(importModule).toHaveBeenCalledWith(moduleUrl);
  });

  it("uses the fixed classic script in production", () => {
    expect(
      resolveSayToMeWidgetHmrModuleUrl({
        isDev: false,
        hostname: "localhost",
        stmOrigin: "http://localhost:5413",
      }),
    ).toBeNull();
  });

  it("uses the fixed classic script for a non-local browser", () => {
    expect(
      resolveSayToMeWidgetHmrModuleUrl({
        isDev: true,
        hostname: "lima-default.tail052173.ts.net",
        stmOrigin: "http://localhost:5413",
      }),
    ).toBeNull();
  });

  it("allows an explicit empty override to disable direct HMR", () => {
    expect(
      resolveSayToMeWidgetHmrModuleUrl({
        isDev: true,
        hostname: "localhost",
        stmOrigin: "",
      }),
    ).toBeNull();
  });

  it("rejects invalid and non-local STM origins", () => {
    for (const stmOrigin of [
      "not a URL",
      "ftp://localhost:5411",
      "https://say.example.com",
      "http://localhost.example.com:5411",
    ]) {
      expect(
        resolveSayToMeWidgetHmrModuleUrl({
          isDev: true,
          hostname: "localhost",
          stmOrigin,
        }),
      ).toBeNull();
    }
  });

  it("accepts only the exact park-session detail shape", () => {
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-widget",
        version: 2,
        type: "park-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(true);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-web-component",
        version: 2,
        type: "park-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-widget",
        version: 1,
        type: "park-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-widget",
        version: 2,
        type: "open-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-widget",
        version: 2,
        type: "park-session",
        sessionId: "   ",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-widget",
        version: 2,
        type: "park-session",
      }),
    ).toBe(false);
    expect(isSayToMeParkSessionDetail(null)).toBe(false);
  });

  it("requires the CustomEvent name and detail together", () => {
    expect(
      isSayToMeParkSessionEvent(
        new CustomEvent(SAY_TO_ME_PARK_SESSION_EVENT, {
          bubbles: true,
          composed: true,
          detail: {
            source: "say-to-me-widget",
            version: 2,
            type: "park-session",
            sessionId: "t3_thread",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isSayToMeParkSessionEvent(
        new CustomEvent("other-event", {
          bubbles: true,
          composed: true,
          detail: {
            source: "say-to-me-widget",
            version: 2,
            type: "park-session",
            sessionId: "t3_thread",
          },
        }),
      ),
    ).toBe(false);
    expect(isSayToMeParkSessionEvent(new Event(SAY_TO_ME_PARK_SESSION_EVENT))).toBe(false);
  });

  it("builds the exact legacy /park URL with required and optional fields", () => {
    const requiredOnly = buildParkSessionUrl(
      {
        environmentId: "env-1",
        threadId: "thread-1",
      },
      "https://t3.example",
    );
    expect(requiredOnly.toString()).toBe(
      "https://t3.example/park?environmentId=env-1&threadId=thread-1",
    );

    const withOptional = buildParkSessionUrl(
      {
        environmentId: "env-1",
        threadId: "thread-1",
        title: "Fix parking",
        project: "t3code",
        cwd: "/home/ylapin/work/t3code",
        branch: "feat/stm-park-button",
      },
      "https://t3.example",
    );
    expect(withOptional.toString()).toBe(
      "https://t3.example/park?environmentId=env-1&threadId=thread-1&title=Fix+parking&project=t3code&cwd=%2Fhome%2Fylapin%2Fwork%2Ft3code&branch=feat%2Fstm-park-button",
    );

    const skipsEmptyOptional = buildParkSessionUrl(
      {
        environmentId: "env-1",
        threadId: "thread-1",
        title: "",
        project: null,
        cwd: undefined,
        branch: "main",
      },
      "https://t3.example",
    );
    expect(skipsEmptyOptional.toString()).toBe(
      "https://t3.example/park?environmentId=env-1&threadId=thread-1&branch=main",
    );
  });

  it("calls window.location.assign once with the legacy park URL", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        origin: "https://t3.example",
        assign,
      },
    });

    assignParkSessionUrl({
      environmentId: "env-1",
      threadId: "thread-1",
      title: "Park me",
      branch: "main",
    });

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(
      new URL(
        "https://t3.example/park?environmentId=env-1&threadId=thread-1&title=Park+me&branch=main",
      ),
    );
  });

  it("does not navigate when the mounted host sessionId is missing/blank", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        origin: "https://t3.example",
        assign,
      },
    });

    const event = new CustomEvent(SAY_TO_ME_PARK_SESSION_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        source: "say-to-me-widget",
        version: 2,
        type: "park-session",
        sessionId: "t3_other-session",
      },
    });

    expect(
      assignParkSessionFromEvent(event, "", {
        environmentId: "env-1",
        threadId: "thread-1",
      }),
    ).toBe(false);
    expect(
      assignParkSessionFromEvent(event, "   ", {
        environmentId: "env-1",
        threadId: "thread-1",
      }),
    ).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("rejects a validly shaped park event whose sessionId does not match the host prop", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        origin: "https://t3.example",
        assign,
      },
    });

    const mountedSessionId = "t3_mounted-session";
    const mismatchedEvent = new CustomEvent(SAY_TO_ME_PARK_SESSION_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        source: "say-to-me-widget",
        version: 2,
        type: "park-session",
        sessionId: "t3_other-session",
      },
    });

    expect(isSayToMeParkSessionDetail(mismatchedEvent.detail)).toBe(true);
    expect(isSayToMeParkSessionDetail(mismatchedEvent.detail, mountedSessionId)).toBe(false);
    expect(isSayToMeParkSessionEvent(mismatchedEvent, mountedSessionId)).toBe(false);
    expect(
      assignParkSessionFromEvent(mismatchedEvent, mountedSessionId, {
        environmentId: "env-1",
        threadId: "thread-1",
      }),
    ).toBe(false);
    expect(assign).not.toHaveBeenCalled();

    const matchingEvent = new CustomEvent(SAY_TO_ME_PARK_SESSION_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        source: "say-to-me-widget",
        version: 2,
        type: "park-session",
        sessionId: mountedSessionId,
      },
    });
    expect(
      assignParkSessionFromEvent(matchingEvent, mountedSessionId, {
        environmentId: "env-1",
        threadId: "thread-1",
      }),
    ).toBe(true);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("parses only versioned v2 usage and speech events", () => {
    const usage = new CustomEvent(SAY_TO_ME_WIDGET_INSERT_USAGE_PROMPT_EVENT, {
      detail: {
        source: "say-to-me-widget",
        version: 2,
        type: "insert-usage-prompt",
        prompt: "use voice",
      },
    });
    const started = new CustomEvent(SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT, {
      detail: { source: "say-to-me-widget", version: 2, type: "speech-started", noteId: "42" },
    });
    const ended = new CustomEvent(SAY_TO_ME_WIDGET_SPEECH_ENDED_EVENT, {
      detail: { source: "say-to-me-widget", version: 2, type: "speech-ended", noteId: "42" },
    });
    expect(parseSayToMeWidgetEvent(usage)).toMatchObject({
      type: "insert-usage-prompt",
      prompt: "use voice",
    });
    expect(parseSayToMeWidgetEvent(started)).toMatchObject({
      type: "speech-started",
      noteId: "42",
    });
    expect(parseSayToMeWidgetEvent(ended)).toMatchObject({ type: "speech-ended", noteId: "42" });
    expect(
      parseSayToMeWidgetEvent(
        new CustomEvent(SAY_TO_ME_WIDGET_SPEECH_STARTED_EVENT, {
          detail: { source: "say-to-me-widget", version: 1, type: "speech-started", noteId: "42" },
        }),
      ),
    ).toBeNull();
  });
});
