import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SayToMeParkButtonHost } from "./SayToMeParkButtonHost";
import {
  loadSayToMeParkButtonScript,
  resetParkButtonScriptLoadsForTests,
  resolveParkButtonHostStatus,
  SAY_TO_ME_PARK_BUTTON_SRC,
} from "./parkButton";

type FakeScript = HTMLScriptElement & {
  listeners: Map<string, EventListener>;
  dispatch(type: "load" | "error"): void;
};

function createFakeScriptDocument() {
  const scripts: FakeScript[] = [];

  const createScript = (): FakeScript => {
    const listeners = new Map<string, EventListener>();
    const dataset: Record<string, string> = {};
    const attributes = new Map<string, string>();
    const script = {
      src: "",
      async: false,
      dataset,
      listeners,
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
      getAttribute(name: string) {
        return attributes.get(name) ?? null;
      },
      addEventListener(type: string, listener: EventListener) {
        listeners.set(type, listener);
      },
      remove() {
        const index = scripts.indexOf(script);
        if (index >= 0) scripts.splice(index, 1);
      },
      dispatch(type: "load" | "error") {
        listeners.get(type)?.(new Event(type));
      },
    } as unknown as FakeScript;
    return script;
  };

  const doc = {
    scripts,
    head: {
      appendChild(node: FakeScript) {
        scripts.push(node);
        return node;
      },
    },
    createElement(tagName: "script") {
      if (tagName !== "script") {
        throw new Error(`unexpected tag ${tagName}`);
      }
      return createScript();
    },
    querySelector(selectors: string) {
      const attrMatch = /^script\[data-park-button-src="(.+)"\]$/.exec(selectors);
      if (attrMatch) {
        const src = attrMatch[1];
        return (
          scripts.find((script) => script.getAttribute("data-park-button-src") === src) ?? null
        );
      }
      const srcMatch = /^script\[src="(.+)"\]$/.exec(selectors);
      if (srcMatch) {
        const src = srcMatch[1];
        return scripts.find((script) => script.src === src) ?? null;
      }
      return null;
    },
  };

  return doc;
}

let capturedLegacyParkClick: (() => void) | undefined;

vi.mock("../components/ui/button", () => ({
  Button: ({
    onClick,
    children,
    ...rest
  }: {
    onClick?: () => void;
    children?: unknown;
    [key: string]: unknown;
  }) => {
    capturedLegacyParkClick = onClick;
    return (
      <button type="button" onClick={onClick} {...rest}>
        {children as never}
      </button>
    );
  },
}));

describe("SayToMeParkButtonHost availability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetParkButtonScriptLoadsForTests();
    capturedLegacyParkClick = undefined;
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

  it("rejects immediately on remount after a prior script failure and can retry", async () => {
    const doc = createFakeScriptDocument();
    const src = SAY_TO_ME_PARK_BUTTON_SRC;

    const first = loadSayToMeParkButtonScript(src, doc);
    expect(doc.scripts).toHaveLength(1);
    let firstError: unknown;
    const firstSettled = first.then(
      () => {
        throw new Error("expected first load to reject");
      },
      (error: unknown) => {
        firstError = error;
      },
    );
    doc.scripts[0]?.dispatch("error");
    await firstSettled;
    expect(String(firstError)).toMatch(/Failed to load/);
    expect(doc.scripts[0]?.dataset.failed).toBe("true");

    // Remount/retry must not hang on the already-failed script tag.
    const second = loadSayToMeParkButtonScript(src, doc);
    expect(doc.scripts).toHaveLength(1);
    expect(doc.scripts[0]?.dataset.failed).toBeUndefined();
    const secondSettled = second.then((value) => value);
    doc.scripts[0]?.dispatch("load");
    await expect(secondSettled).resolves.toBeUndefined();
    expect(doc.scripts[0]?.dataset.loaded).toBe("true");

    // A later successful mount shares the loaded script without inserting another.
    await expect(loadSayToMeParkButtonScript(src, doc)).resolves.toBeUndefined();
    expect(doc.scripts).toHaveLength(1);
  });

  it("retries instead of hanging when a prior unmarked failed script tag remains", async () => {
    const doc = createFakeScriptDocument();
    const src = SAY_TO_ME_PARK_BUTTON_SRC;
    const stale = doc.createElement("script");
    stale.src = src;
    // Simulate the previous bug: error already fired, no data-loaded/failed markers.
    doc.head.appendChild(stale);
    expect(doc.scripts).toHaveLength(1);

    const retry = loadSayToMeParkButtonScript(src, doc);
    expect(doc.scripts).toHaveLength(1);
    expect(doc.scripts[0]).not.toBe(stale);
    const retrySettled = retry.then((value) => value);
    doc.scripts[0]?.dispatch("load");
    await expect(retrySettled).resolves.toBeUndefined();
  });

  it("deduplicates concurrent script loads for the same src", async () => {
    const doc = createFakeScriptDocument();
    const src = SAY_TO_ME_PARK_BUTTON_SRC;

    const first = loadSayToMeParkButtonScript(src, doc);
    const second = loadSayToMeParkButtonScript(src, doc);
    expect(doc.scripts).toHaveLength(1);
    expect(second).toBe(first);

    const bothSettled = Promise.all([first, second]);
    doc.scripts[0]?.dispatch("load");
    await expect(bothSettled).resolves.toEqual([undefined, undefined]);
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

  it("invokes legacy navigation once from the host fallback click", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        origin: "https://t3.example",
        assign,
      },
    });

    renderToStaticMarkup(
      <SayToMeParkButtonHost
        sessionId="t3_thread"
        environmentId="env-1"
        threadId="thread-1"
        title="Park me"
        project="t3code"
        cwd="/tmp/t3"
        branch="feat/stm-park-button"
        availability={{ mode: "fallback", reason: "script-load-failed" }}
      />,
    );

    expect(capturedLegacyParkClick).toEqual(expect.any(Function));
    capturedLegacyParkClick?.();

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(
      new URL(
        "https://t3.example/park?environmentId=env-1&threadId=thread-1&title=Park+me&project=t3code&cwd=%2Ftmp%2Ft3&branch=feat%2Fstm-park-button",
      ),
    );
  });
});
