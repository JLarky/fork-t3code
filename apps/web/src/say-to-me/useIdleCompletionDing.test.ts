import { describe, expect, it } from "vite-plus/test";

import { shouldPlayIdleCompletionDing } from "./useIdleCompletionDing";

describe("shouldPlayIdleCompletionDing", () => {
  it("plays when the stop button turns back into the send button", () => {
    expect(
      shouldPlayIdleCompletionDing(
        { threadKey: "a", phase: "running" },
        { threadKey: "a", phase: "ready" },
      ),
    ).toBe(true);
  });

  it("stays silent on the first sample so opening an idle thread is quiet", () => {
    expect(shouldPlayIdleCompletionDing(null, { threadKey: "a", phase: "ready" })).toBe(false);
  });

  it("stays silent when switching away from a running thread", () => {
    expect(
      shouldPlayIdleCompletionDing(
        { threadKey: "a", phase: "running" },
        { threadKey: "b", phase: "ready" },
      ),
    ).toBe(false);
  });

  it("stays silent while a turn keeps running or stays idle", () => {
    expect(
      shouldPlayIdleCompletionDing(
        { threadKey: "a", phase: "running" },
        { threadKey: "a", phase: "running" },
      ),
    ).toBe(false);
    expect(
      shouldPlayIdleCompletionDing(
        { threadKey: "a", phase: "ready" },
        { threadKey: "a", phase: "ready" },
      ),
    ).toBe(false);
  });

  it("stays silent when a turn starts", () => {
    expect(
      shouldPlayIdleCompletionDing(
        { threadKey: "a", phase: "ready" },
        { threadKey: "a", phase: "running" },
      ),
    ).toBe(false);
  });

  it("stays silent when an interrupt or connection loss ends the run", () => {
    expect(
      shouldPlayIdleCompletionDing(
        { threadKey: "a", phase: "running" },
        { threadKey: "a", phase: "disconnected" },
      ),
    ).toBe(false);
    expect(
      shouldPlayIdleCompletionDing(
        { threadKey: "a", phase: "running" },
        { threadKey: "a", phase: "connecting" },
      ),
    ).toBe(false);
  });
});
