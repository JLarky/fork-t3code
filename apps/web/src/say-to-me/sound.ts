/**
 * Send "ding" ported from the Say To Me app (`src/sound.ts`) so composing in T3
 * Code sounds the same as composing there. The tone is synthesized rather than
 * shipped as an asset, which keeps the fork free of binary files.
 */

const SEND_DING = {
  duration: 0.16,
  volume: 0.24,
  type: "triangle",
  startFrequency: 440,
  endFrequency: 587,
} as const;

const SAMPLE_RATE = 44100;
const WAV_HEADER_BYTES = 44;

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const extendedWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? extendedWindow.webkitAudioContext;
}

/** Builds a mono 16-bit PCM WAV of the send ding as a base64 data URL. */
export function createSendDingWavUrl(): string {
  const samples = Math.floor(SAMPLE_RATE * SEND_DING.duration);
  const dataBytes = samples * 2;
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + dataBytes));
  let offset = 0;

  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index));
      offset += 1;
    }
  };
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };

  writeString("RIFF");
  writeUint32(36 + dataBytes);
  writeString("WAVEfmt ");
  writeUint32(16);
  writeUint16(1);
  writeUint16(1);
  writeUint32(SAMPLE_RATE);
  writeUint32(SAMPLE_RATE * 2);
  writeUint16(2);
  writeUint16(16);
  writeString("data");
  writeUint32(dataBytes);

  for (let index = 0; index < samples; index += 1) {
    const progress = index / samples;
    const envelope = Math.sin(Math.PI * progress) * (1 - progress * 0.45);
    const frequency =
      SEND_DING.startFrequency + (SEND_DING.endFrequency - SEND_DING.startFrequency) * progress;
    const sample =
      Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE) * envelope * SEND_DING.volume;
    view.setInt16(offset, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
    offset += 2;
  }

  let binary = "";
  for (const byte of new Uint8Array(view.buffer)) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let cachedUrl: string | null = null;
let cachedAudio: HTMLAudioElement | null = null;
let cachedContext: AudioContext | null = null;

function prepareAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  cachedUrl ??= createSendDingWavUrl();
  if (!cachedAudio) {
    cachedAudio = new Audio(cachedUrl);
    cachedAudio.preload = "auto";
    cachedAudio.load();
  }
  return cachedAudio;
}

/**
 * Plays the send ding. Callers should invoke this from a user gesture (the send
 * action) so autoplay policies allow it. Resolves false only when the browser
 * offers no usable audio path; a blocked element playback falls back to Web
 * Audio rather than failing.
 */
export async function playSendDing({ volumeScale = 1 } = {}): Promise<boolean> {
  const audio = prepareAudio();
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = Math.max(0, Math.min(1, volumeScale));
      await audio.play();
      return true;
    } catch {
      // Fall through to Web Audio when element playback is blocked.
    }
  }

  const AudioContextConstructor = audioContextConstructor();
  if (!AudioContextConstructor) return false;

  try {
    if (!cachedContext || cachedContext.state === "closed") {
      cachedContext = new AudioContextConstructor();
    }
    const context = cachedContext;
    if (context.state === "suspended") await context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startedAt = context.currentTime;

    oscillator.type = SEND_DING.type;
    oscillator.frequency.setValueAtTime(SEND_DING.startFrequency, startedAt);
    oscillator.frequency.exponentialRampToValueAtTime(SEND_DING.endFrequency, startedAt + 0.1);
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(SEND_DING.volume * 0.28 * volumeScale, startedAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + SEND_DING.duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + SEND_DING.duration + 0.02);
    return true;
  } catch {
    return false;
  }
}

export function __resetSendDingForTests(): void {
  cachedUrl = null;
  cachedAudio = null;
  cachedContext = null;
}
