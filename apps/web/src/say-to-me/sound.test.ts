import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  __resetSoundsForTests,
  createIdleCompletionDingWavUrl,
  createSendDingWavUrl,
  playSendDing,
} from "./sound";

function peakAmplitude(view: DataView): number {
  let peak = 0;
  for (let offset = 44; offset + 1 < view.byteLength; offset += 2) {
    peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
  }
  return peak / 0x7fff;
}

function decodeWav(dataUrl: string): DataView {
  const base64 = dataUrl.replace("data:audio/wav;base64,", "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new DataView(bytes.buffer);
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

afterEach(() => {
  __resetSoundsForTests();
  vi.unstubAllGlobals();
});

describe("createSendDingWavUrl", () => {
  it("emits a mono 16-bit PCM WAV sized for the ding duration", () => {
    const view = decodeWav(createSendDingWavUrl());
    // 0.16s at 44100Hz, 2 bytes per sample, plus the 44 byte header.
    const samples = Math.floor(44100 * 0.16);
    const dataBytes = samples * 2;

    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 8)).toBe("WAVEfmt ");
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.getUint32(4, true)).toBe(36 + dataBytes);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(dataBytes);
    expect(view.byteLength).toBe(44 + dataBytes);
  });

  it("renders an audible tone rather than silence", () => {
    expect(peakAmplitude(decodeWav(createSendDingWavUrl()))).toBeGreaterThan(0.1);
    expect(peakAmplitude(decodeWav(createIdleCompletionDingWavUrl()))).toBeGreaterThan(0.05);
  });

  it("starts and ends near silence so the tone does not click", () => {
    const view = decodeWav(createSendDingWavUrl());
    const lastSampleOffset = view.byteLength - 2;

    expect(Math.abs(view.getInt16(44, true))).toBeLessThan(0x7fff * 0.02);
    expect(Math.abs(view.getInt16(lastSampleOffset, true))).toBeLessThan(0x7fff * 0.02);
  });
});

describe("playSendDing", () => {
  it("plays through the audio element when it is allowed", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        play = play;
        pause = pause;
        load = vi.fn();
        currentTime = 5;
        volume = 1;
        preload = "";
      },
    );

    await expect(playSendDing()).resolves.toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("falls back to Web Audio when element playback is blocked", async () => {
    vi.stubGlobal(
      "Audio",
      class {
        play = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
        pause = vi.fn();
        load = vi.fn();
        currentTime = 0;
        volume = 1;
        preload = "";
      },
    );

    const start = vi.fn();
    const connect = vi.fn();
    const createOscillator = vi.fn(() => ({
      type: "",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect,
      start,
      stop: vi.fn(),
    }));
    const createGain = vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect,
    }));
    vi.stubGlobal("window", {
      AudioContext: class {
        state = "running";
        currentTime = 0;
        destination = {};
        createOscillator = createOscillator;
        createGain = createGain;
        resume = vi.fn();
      },
    });

    await expect(playSendDing()).resolves.toBe(true);
    expect(createOscillator).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("reports failure when the browser exposes no audio path", async () => {
    vi.stubGlobal("Audio", undefined);
    vi.stubGlobal("window", {});

    await expect(playSendDing()).resolves.toBe(false);
  });
});
