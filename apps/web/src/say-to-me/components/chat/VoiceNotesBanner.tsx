import { useEffect, useRef, useState } from "react";
import { CheckIcon, PlayIcon, SquareIcon, Volume2Icon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../../../components/ui/button";
import { enqueueSound } from "../../audioQueue";
import { sayToMeSessionUrl } from "../../sayToMeUi";

/** Upper bound on how long a single spoken note may hold the audio queue. */
const SPEECH_TIMEOUT_MS = 120_000;

// Prefer the Edge neural voice used by t3-vo, then fall back to Google's
// English voice when the preferred voice is not installed.
const PREFERRED_SPEECH_VOICE_NAMES = [
  "Microsoft Emma Online (Natural) - English (United States)",
  "Google US English",
];

export function voiceNotesSessionId(environmentId: string, threadId: string): string {
  return `vo_t3_${environmentId}__${threadId}`;
}

function voiceNotesUrl(sessionId: string): string {
  return `/api/voice-notes/${encodeURIComponent(sessionId)}`;
}

type VoiceNote = {
  readonly id: string;
  readonly author: string;
  readonly time: string;
  readonly text: string;
  readonly status: string;
};

type SayToMeMessage = {
  readonly id: number;
  readonly author: string;
  readonly text: string;
  readonly status: string;
  readonly createdAt: string;
};

type SayToMeMessagesPayload = {
  readonly messages?: ReadonlyArray<SayToMeMessage>;
};

type VoiceNoteStatus = "queued" | "speaking" | "played" | "stopped";

type SessionState = "loading" | "ready" | "missing" | "unavailable";

function listSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

function loadSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = listSpeechVoices();
  if (voices.length > 0) return Promise.resolve(voices);

  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve([]);
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      window.clearTimeout(timeout);
      resolve(listSpeechVoices());
    };
    const onVoicesChanged = () => finish();
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    const timeout = window.setTimeout(finish, 1_000);
  });
}

function preferredSpeechVoice(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
): SpeechSynthesisVoice | null {
  for (const name of PREFERRED_SPEECH_VOICE_NAMES) {
    const voice = voices.find((candidate) => candidate.name === name);
    if (voice) return voice;
  }
  return null;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "queued":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "speaking":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "played":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "stopped":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
    default:
      return "bg-muted/70 text-muted-foreground";
  }
}

export function claimVoiceNoteForAutoplay(
  note: Pick<VoiceNote, "id" | "author" | "status">,
  claimedIds: Set<string>,
): boolean {
  if (note.author !== "agent" || note.status !== "queued" || claimedIds.has(note.id)) {
    return false;
  }
  claimedIds.add(note.id);
  return true;
}

type VoiceNotesBannerProps = {
  readonly environmentId: string;
  readonly threadId: string;
};

export function VoiceNotesBanner({ environmentId, threadId }: VoiceNotesBannerProps) {
  const sessionId = voiceNotesSessionId(environmentId, threadId);
  const notesUrl = voiceNotesUrl(sessionId);
  const [notes, setNotes] = useState<ReadonlyArray<VoiceNote>>([]);
  const [hasLoadedRemoteNotes, setHasLoadedRemoteNotes] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playRequestRef = useRef(0);
  const autoplayLockRef = useRef(false);
  const autoplayClaimedIdsRef = useRef<Set<string>>(new Set());
  const revisionRef = useRef(-1);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let events: EventSource | null = null;

    const applyPayload = (payload: SayToMeMessagesPayload & { readonly revision?: number }) => {
      if (disposed || !Array.isArray(payload.messages)) return;
      if (Number.isInteger(payload.revision) && payload.revision! < revisionRef.current) return;
      if (Number.isInteger(payload.revision)) revisionRef.current = payload.revision!;
      const nextMessages = payload.messages.slice(-30);
      setHasLoadedRemoteNotes(true);
      setNotes(
        nextMessages
          .slice()
          .toReversed()
          .map((message) => ({
            id: String(message.id),
            author: message.author,
            time: message.createdAt,
            text: message.text,
            status: message.status,
          })),
      );
    };

    // Only stream once the room is known to exist; a missing session would
    // otherwise make EventSource reconnect on a permanent 404.
    const openEventStream = () => {
      if (disposed || typeof EventSource === "undefined") return;
      events = new EventSource(`${notesUrl}/events`, { withCredentials: true });
      const handleSnapshot = (event: MessageEvent<string>) => {
        try {
          applyPayload(JSON.parse(event.data) as SayToMeMessagesPayload & { revision?: number });
        } catch {
          // EventSource reconnects automatically after interrupted streams.
        }
      };
      events.addEventListener("snapshot", handleSnapshot);
      events.addEventListener("message", handleSnapshot);
    };

    const loadInitial = async () => {
      try {
        const response = await fetch(notesUrl, { credentials: "include" });
        if (disposed) return;
        if (response.status === 404) {
          setSessionState("missing");
          return;
        }
        if (!response.ok) {
          setSessionState("unavailable");
          return;
        }
        setSessionState("ready");
        applyPayload((await response.json()) as SayToMeMessagesPayload);
        openEventStream();
      } catch {
        if (!disposed) setSessionState("unavailable");
      }
    };

    void loadInitial();
    return () => {
      disposed = true;
      events?.close();
    };
  }, [notesUrl, reloadToken]);

  const createSession = async () => {
    setIsCreatingSession(true);
    try {
      const response = await fetch(notesUrl, { method: "POST", credentials: "include" });
      if (!response.ok) {
        setSessionState("unavailable");
        return;
      }
      setSessionState("loading");
      setReloadToken((token) => token + 1);
    } catch {
      setSessionState("unavailable");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const updateNoteStatus = (noteId: string, status: VoiceNoteStatus) => {
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, status } : note)));
    if (!hasLoadedRemoteNotes || !/^[0-9]+$/.test(noteId)) return;
    void fetch(`${notesUrl}/messages/${encodeURIComponent(noteId)}/status`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const stop = () => {
    const activeId = playingId;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    playRequestRef.current += 1;
    autoplayLockRef.current = false;
    setPlayingId(null);
    if (activeId) updateNoteStatus(activeId, "stopped");
  };

  const play = (note: VoiceNote) => {
    stop();
    const playRequest = playRequestRef.current;

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      updateNoteStatus(note.id, "played");
      autoplayLockRef.current = false;
      return;
    }

    void loadSpeechVoices().then((voices) => {
      if (playRequest !== playRequestRef.current) return;

      const utterance = new SpeechSynthesisUtterance(note.text);
      const voice = preferredSpeechVoice(voices);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || "en-US";
      } else {
        utterance.lang = "en-US";
      }
      updateNoteStatus(note.id, "speaking");

      utterance.onend = () => {
        utteranceRef.current = null;
        setPlayingId(null);
        autoplayLockRef.current = false;
        updateNoteStatus(note.id, "played");
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        setPlayingId(null);
        autoplayLockRef.current = false;
        updateNoteStatus(note.id, "stopped");
      };
      utteranceRef.current = utterance;
      setPlayingId(note.id);
      // Queued so a notification ding waits for the note instead of talking over it.
      void enqueueSound(
        () =>
          new Promise<void>((resolve) => {
            // Stop() may have run while this note waited its turn in the queue.
            if (playRequest !== playRequestRef.current) {
              resolve();
              return;
            }
            utterance.addEventListener("end", () => resolve(), { once: true });
            utterance.addEventListener("error", () => resolve(), { once: true });
            window.speechSynthesis.speak(utterance);
          }),
        { timeoutMs: SPEECH_TIMEOUT_MS },
      );
    });
  };

  useEffect(() => {
    if (!hasLoadedRemoteNotes || playingId || autoplayLockRef.current) return;
    const nextNote = notes
      .slice()
      .toReversed()
      .find((note) => claimVoiceNoteForAutoplay(note, autoplayClaimedIdsRef.current));
    if (!nextNote) return;
    play(nextNote);
    autoplayLockRef.current = true;
  }, [hasLoadedRemoteNotes, notes, playingId]);

  return (
    <section
      aria-label="Say To Me"
      data-testid="say-to-me-banner"
      className="mx-auto w-[min(48rem,calc(100%-2rem))] shrink-0 py-3"
    >
      <div className="rounded-2xl border border-info/32 bg-info/4 p-3 text-card-foreground shadow-sm sm:p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-info/12 text-info">
            <Volume2Icon className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-sm">Say To Me</h2>
              <a
                href={sayToMeSessionUrl(sessionId)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-info/10 px-2 py-0.5 font-medium text-[10px] text-info uppercase tracking-wide"
              >
                Preview
              </a>
            </div>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Listen to short updates from your agents while they work.
            </p>
          </div>
        </div>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {sessionState === "missing" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/55 px-3 py-2.5">
              <p className="text-muted-foreground text-sm">
                No voice session exists for this thread yet.
              </p>
              <Button
                size="xs"
                variant="outline"
                disabled={isCreatingSession}
                onClick={createSession}
              >
                {isCreatingSession ? "Creating..." : "Create voice session"}
              </Button>
            </div>
          ) : sessionState === "unavailable" ? (
            <p className="rounded-xl bg-background/55 px-3 py-2.5 text-muted-foreground text-sm">
              Say To Me is unavailable.
            </p>
          ) : !hasLoadedRemoteNotes ? (
            <p className="rounded-xl bg-background/55 px-3 py-2.5 text-muted-foreground text-sm">
              Loading voice notes...
            </p>
          ) : notes.length === 0 ? (
            <p className="rounded-xl bg-background/55 px-3 py-2.5 text-muted-foreground text-sm">
              No voice notes yet.
            </p>
          ) : (
            notes.map((note) => {
              const isPlaying = playingId === note.id;
              const status = isPlaying ? "speaking" : note.status;
              return (
                <article
                  key={note.id}
                  className={cn(
                    "rounded-xl border bg-background/55 px-3 py-2.5 transition-colors",
                    isPlaying ? "border-info/45 bg-info/8" : "border-border/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                        <span className="font-mono">#{note.id}</span>
                        <span className="font-medium text-foreground">{note.author}</span>
                        <span>{note.time}</span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide",
                            statusBadgeClass(status),
                          )}
                        >
                          {status === "played" ? (
                            <CheckIcon className="size-3" aria-hidden />
                          ) : null}
                          {status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-5">{note.text}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="xs"
                        variant={isPlaying ? "secondary" : "outline"}
                        aria-label={`${isPlaying ? "Restart" : "Play"} voice note from ${note.author}`}
                        onClick={() => play(note)}
                      >
                        <PlayIcon className="size-3" fill="currentColor" aria-hidden />
                        {isPlaying ? "Restart" : "Play"}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Stop voice note from ${note.author}`}
                        disabled={!isPlaying}
                        onClick={stop}
                      >
                        <SquareIcon className="size-3" fill="currentColor" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
