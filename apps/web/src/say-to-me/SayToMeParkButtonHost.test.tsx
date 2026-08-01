import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SayToMeParkButtonHost } from "./SayToMeParkButtonHost";
import {
  assignParkSessionUrl,
  resolveParkButtonHostStatus,
  SAY_TO_ME_PARK_BUTTON_SRC,
} from "./parkButton";

describe("SayToMeParkButtonHost availability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves to custom-element after successful script load and definition", async () => {
    const status = await resolveParkButtonHostStatus({
      scriptSrc: SAY_TO_ME_PARK_BUTTON_SRC,
      loadScript: async () => undefined,
      isElementDefined: () => true,
      whenElementDefined: async () => undefined,
    });
    expect(status).toEqual({ mode: "custom-element" });
  });

  it("resolves to fallback when the park-button script fails to load", async () => {
    const status = await resolveParkButtonHostStatus({
      loadScript: async () => {
        throw new Error("network down");
      },
      isElementDefined: () => false,
    });
    expect(status).toEqual({ mode: "fallback", reason: "script-load-failed" });
  });

  it("resolves to fallback when the script loads but the element is never defined", async () => {
    const status = await resolveParkButtonHostStatus({
      loadScript: async () => undefined,
      isElementDefined: () => false,
      whenElementDefined: async () => {
        throw new Error("timeout");
      },
      timeoutMs: 1,
    });
    expect(status).toEqual({ mode: "fallback", reason: "element-undefined" });
  });

  it("renders only the custom element when availability is ready", () => {
    const markup = renderToStaticMarkup(
      <SayToMeParkButtonHost
        sessionId="t3_thread"
        environmentId="env-1"
        threadId="thread-1"
        availability={{ mode: "custom-element" }}
      />,
    );

    expect(markup).toContain('data-park-availability="custom-element"');
    expect(markup).toContain("say-to-me-park-button");
    expect(markup).toContain('data-testid="say-to-me-park-button-element"');
    expect(markup).not.toContain('data-testid="say-to-me-park-button-fallback"');
    expect(markup).not.toContain('aria-label="Park session"');
    expect(markup).not.toContain("data-park-error");
  });

  it("keeps a styled legacy Park control when the embed is unavailable", () => {
    const markup = renderToStaticMarkup(
      <SayToMeParkButtonHost
        sessionId="t3_thread"
        environmentId="env-1"
        threadId="thread-1"
        title="Park me"
        availability={{ mode: "fallback", reason: "script-load-failed" }}
      />,
    );

    expect(markup).toContain('data-park-availability="fallback"');
    expect(markup).toContain('data-park-reason="script-load-failed"');
    expect(markup).toContain('data-park-error="script-load-failed"');
    expect(markup).toContain('data-testid="say-to-me-park-button-fallback"');
    expect(markup).toContain('aria-label="Park session"');
    expect(markup).toContain("Park session (Say To Me embed unavailable)");
    expect(markup).toContain(">P</");
    expect(markup).toContain("h-6 w-6 shrink-0");
    expect(markup).not.toContain('data-testid="say-to-me-park-button-element"');
  });

  it("uses the legacy navigation helper once for failed-load fallback clicks", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        origin: "https://t3.example",
        assign,
      },
    });

    // Same helper the fallback Button onClick calls — no duplicated URL construction.
    assignParkSessionUrl({
      environmentId: "env-1",
      threadId: "thread-1",
      title: "Park me",
      project: "t3code",
      cwd: "/tmp/t3",
      branch: "feat/stm-park-button",
    });

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(
      new URL(
        "https://t3.example/park?environmentId=env-1&threadId=thread-1&title=Park+me&project=t3code&cwd=%2Ftmp%2Ft3&branch=feat%2Fstm-park-button",
      ),
    );
  });
});
