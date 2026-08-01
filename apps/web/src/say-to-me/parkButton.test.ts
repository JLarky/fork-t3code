import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  assignParkSessionFromEvent,
  assignParkSessionUrl,
  buildParkSessionUrl,
  importSayToMeParkButtonHmrModule,
  isSayToMeParkSessionDetail,
  isSayToMeParkSessionEvent,
  resolveSayToMeParkButtonHmrModuleUrl,
  SAY_TO_ME_PARK_BUTTON_EVENT,
  SAY_TO_ME_PARK_BUTTON_SRC,
  SAY_TO_ME_PARK_BUTTON_TAG,
  sayToMeParkButtonClassicScriptSrc,
} from "./parkButton";

describe("Say To Me Park button host adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the same-origin proxied script path, not the upstream port", () => {
    expect(SAY_TO_ME_PARK_BUTTON_SRC).toBe("/api/say-to-me/embed/park-button.js");
    expect(SAY_TO_ME_PARK_BUTTON_SRC).not.toContain("5411");
    expect(SAY_TO_ME_PARK_BUTTON_TAG).toBe("say-to-me-park-button");
    expect(SAY_TO_ME_PARK_BUTTON_EVENT).toBe("say-to-me-park-session");
  });

  it("selects only the direct STM Vite module for explicit localhost development", async () => {
    const moduleUrl = resolveSayToMeParkButtonHmrModuleUrl({
      isDev: true,
      hostname: "localhost",
      stmOrigin: "http://localhost:5413/",
    });
    expect(moduleUrl).toBe("http://localhost:5413/server/embed/solid/park-button-hmr.ts");
    expect(sayToMeParkButtonClassicScriptSrc(moduleUrl)).toBeNull();

    const importModule = vi.fn(async () => undefined);
    await importSayToMeParkButtonHmrModule(moduleUrl!, importModule);
    expect(importModule).toHaveBeenCalledOnce();
    expect(importModule).toHaveBeenCalledWith(moduleUrl);
  });

  it("selects only the fixed classic script for production and non-local delivery", () => {
    for (const input of [
      { isDev: false, hostname: "localhost", stmOrigin: "http://localhost:5413" },
      {
        isDev: true,
        hostname: "lima-default.tail052173.ts.net",
        stmOrigin: "http://localhost:5413",
      },
      { isDev: true, hostname: "localhost" },
      { isDev: true, hostname: "localhost", stmOrigin: "https://say.example.com" },
    ]) {
      const moduleUrl = resolveSayToMeParkButtonHmrModuleUrl(input);
      expect(moduleUrl).toBeNull();
      expect(sayToMeParkButtonClassicScriptSrc(moduleUrl)).toBe(SAY_TO_ME_PARK_BUTTON_SRC);
    }
  });

  it("accepts only the exact park-session detail shape", () => {
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-park-button",
        version: 1,
        type: "park-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(true);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-web-component",
        version: 1,
        type: "park-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-park-button",
        version: 2,
        type: "park-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-park-button",
        version: 1,
        type: "open-session",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-park-button",
        version: 1,
        type: "park-session",
        sessionId: "   ",
      }),
    ).toBe(false);
    expect(
      isSayToMeParkSessionDetail({
        source: "say-to-me-park-button",
        version: 1,
        type: "park-session",
      }),
    ).toBe(false);
    expect(isSayToMeParkSessionDetail(null)).toBe(false);
  });

  it("requires the CustomEvent name and detail together", () => {
    expect(
      isSayToMeParkSessionEvent(
        new CustomEvent(SAY_TO_ME_PARK_BUTTON_EVENT, {
          bubbles: true,
          composed: true,
          detail: {
            source: "say-to-me-park-button",
            version: 1,
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
            source: "say-to-me-park-button",
            version: 1,
            type: "park-session",
            sessionId: "t3_thread",
          },
        }),
      ),
    ).toBe(false);
    expect(isSayToMeParkSessionEvent(new Event(SAY_TO_ME_PARK_BUTTON_EVENT))).toBe(false);
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

    const event = new CustomEvent(SAY_TO_ME_PARK_BUTTON_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        source: "say-to-me-park-button",
        version: 1,
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
    const mismatchedEvent = new CustomEvent(SAY_TO_ME_PARK_BUTTON_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        source: "say-to-me-park-button",
        version: 1,
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

    const matchingEvent = new CustomEvent(SAY_TO_ME_PARK_BUTTON_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        source: "say-to-me-park-button",
        version: 1,
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
});
