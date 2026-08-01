import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  __resetAudioQueueForTests,
  delay,
  enqueueSound,
  isSpeechActive,
  setVoiceWidgetPlaybackActive,
} from "./audioQueue";

afterEach(() => {
  __resetAudioQueueForTests();
});

describe("enqueueSound", () => {
  it("never overlaps two sounds", async () => {
    const events: string[] = [];
    const sound = (name: string, durationMs: number) => async () => {
      events.push(`${name}:start`);
      await delay(durationMs);
      events.push(`${name}:end`);
    };

    const first = enqueueSound(sound("speech", 30), { timeoutMs: 1000 });
    const second = enqueueSound(sound("ding", 5), { timeoutMs: 1000 });
    await Promise.all([first, second]);

    expect(events).toEqual(["speech:start", "speech:end", "ding:start", "ding:end"]);
  });

  it("moves on when a sound never reports that it finished", async () => {
    const events: string[] = [];
    const stuck = () =>
      new Promise<void>(() => {
        events.push("stuck:start");
      });

    await enqueueSound(stuck, { timeoutMs: 20 });
    await enqueueSound(
      async () => {
        events.push("next:start");
      },
      { timeoutMs: 1000 },
    );

    expect(events).toEqual(["stuck:start", "next:start"]);
  });

  it("keeps draining after a sound throws", async () => {
    const events: string[] = [];

    await enqueueSound(
      async () => {
        throw new Error("playback failed");
      },
      { timeoutMs: 1000 },
    );
    await enqueueSound(
      async () => {
        events.push("next:start");
      },
      { timeoutMs: 1000 },
    );

    expect(events).toEqual(["next:start"]);
  });
});

describe("setVoiceWidgetPlaybackActive", () => {
  it("marks speech active so idle ding policy can wait on widget playback", () => {
    expect(isSpeechActive()).toBe(false);
    setVoiceWidgetPlaybackActive(true);
    expect(isSpeechActive()).toBe(true);
    setVoiceWidgetPlaybackActive(false);
    expect(isSpeechActive()).toBe(false);
  });

  it("suppresses queued idle ding until playback-change clears, then restores it", async () => {
    const events: string[] = [];
    setVoiceWidgetPlaybackActive(true);

    const ding = enqueueSound(
      async () => {
        while (isSpeechActive()) {
          events.push("wait");
          await delay(15);
        }
        events.push("ding");
      },
      { timeoutMs: 2000 },
    );

    await delay(40);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event === "wait")).toBe(true);
    expect(events).not.toContain("ding");

    setVoiceWidgetPlaybackActive(false);
    await ding;
    expect(events.at(-1)).toBe("ding");
    expect(isSpeechActive()).toBe(false);
  });
});
