import { useEffect, useRef, useState } from "react";
import * as Schema from "effect/Schema";
import {
  AlarmClockIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  PlayIcon,
  SquareIcon,
  Volume2Icon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import ChatMarkdown from "../../../components/ChatMarkdown";
import { Button } from "../../../components/ui/button";
import { SayToMeTimerPanel, timerRelativeLabel } from "../timers/SayToMeTimerPanel";
import { useSayToMeTimers } from "../timers/useSayToMeTimers";
import { enqueueSound } from "../../audioQueue";
import { SAY_TO_ME_UI_URL, sayToMeAttachmentUrl, sayToMeSessionUrl } from "../../sayToMeUi";
import { useSoundUnlock } from "../../useSoundUnlock";
import { voiceNotesSessionId } from "../../voiceSessionId";

export { voiceNotesSessionId };

export const SAY_TO_ME_BANNER_COLLAPSED_STORAGE_KEY = "t3code:say-to-me-banner-collapsed:v1";
const CollapsedSchema = Schema.Boolean;
const SAY_TO_ME_USAGE_PROMPT = "Tell your agent how to use Say To Me";

/** Upper bound on how long a single spoken note may hold the audio queue. */
const SPEECH_TIMEOUT_MS = 120_000;

// Prefer the Edge neural voice used by t3-vo, then fall back to Google's
// English voice when the preferred voice is not installed.
const PREFERRED_SPEECH_VOICE_NAMES = [
  "Microsoft Emma Online (Natural) - English (United States)",
  "Google US English",
];

function voiceNotesUrl(sessionId: string): string {
  return `/api/voice-notes/${encodeURIComponent(sessionId)}`;
}

type VoiceNote = {
  readonly id: string;
  readonly author: string;
  readonly time: string;
  readonly text: string;
  readonly extraMarkdown: string | null;
  readonly status: string;
  readonly attachments: ReadonlyArray<SayToMeAttachment>;
  readonly sessions: ReadonlyArray<SayToMeSession>;
};

type SayToMeAttachment = {
  readonly id: number;
  readonly mimeType: string;
  readonly originalName: string;
  readonly thumbnailDataUrl?: string;
};

type SayToMeMessage = {
  readonly id: number;
  readonly author: string;
  readonly text: string;
  readonly extraMarkdown?: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly attachments?: ReadonlyArray<SayToMeAttachment>;
  readonly sessions?: ReadonlyArray<SayToMeSession>;
};

type SayToMeSession = {
  readonly id: string;
  readonly alias?: string | null;
  readonly title?: string | null;
  readonly summary?: string | null;
  readonly summaryUpdatedAt?: string | null;
  readonly waitingState?: string | null;
  readonly latestActivity?: string | null;
  readonly messageCount?: number | null;
};

type SayToMeMessagesPayload = {
  readonly messages?: ReadonlyArray<SayToMeMessage>;
};

type VoiceNoteStatus = "queued" | "speaking" | "played" | "stopped";

type SessionState = "loading" | "ready" | "missing" | "unavailable";

const SAY_TO_ME_SQL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

/** Say To Me returns SQLite UTC timestamps without an offset. Make the UTC contract explicit. */
export function normalizeSayToMeTimestamp(timestamp: string): string {
  const trimmed = timestamp.trim();
  return SAY_TO_ME_SQL_TIMESTAMP_RE.test(trimmed) ? `${trimmed.replace(" ", "T")}Z` : trimmed;
}

/** Render voice-note timestamps in the browser's local timezone. */
export function formatSayToMeTimestamp(timestamp: string): string {
  const date = new Date(normalizeSayToMeTimestamp(timestamp));
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function imageAttachmentThumbnail(
  attachment: Pick<SayToMeAttachment, "mimeType" | "thumbnailDataUrl">,
): string | null {
  return attachment.mimeType.startsWith("image/") && attachment.thumbnailDataUrl
    ? attachment.thumbnailDataUrl
    : null;
}

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

/** Without a voice room to open, the title falls back to the Say To Me home page. */
export function sayToMeTitleUrl(sessionId: string, sessionState: SessionState): string {
  return sessionState === "missing" ? SAY_TO_ME_UI_URL : sayToMeSessionUrl(sessionId);
}

export function sayToMeBannerSectionClass(
  collapsed: boolean,
  hasExtraMarkdown = false,
  hasCollapsedAction = false,
): string {
  const hasInteractiveCollapsedContent = hasExtraMarkdown || hasCollapsedAction;
  return collapsed
    ? cn(
        "absolute top-2 right-[10px] z-30 w-max short:top-1",
        hasInteractiveCollapsedContent ? "pointer-events-auto" : "pointer-events-none",
        hasInteractiveCollapsedContent ? "max-w-[min(80vw,32rem)]" : "max-w-[min(30%,18rem)]",
      )
    : "mx-auto w-[min(48rem,calc(100%-2rem))] shrink-0 py-3 short:py-1.5";
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

/** Claim every queued agent note so autoplay cannot restart after a manual stop-all. */
export function claimQueuedNotesForStopAll(
  notes: ReadonlyArray<Pick<VoiceNote, "id" | "author" | "status">>,
  claimedIds: Set<string>,
): ReadonlyArray<string> {
  const stoppedIds: string[] = [];
  for (const note of notes) {
    if (note.author !== "agent" || note.status !== "queued" || claimedIds.has(note.id)) continue;
    claimedIds.add(note.id);
    stoppedIds.push(note.id);
  }
  return stoppedIds;
}

function VoiceNoteExtraMarkdown({
  markdown,
  compact = false,
}: {
  readonly markdown: string;
  readonly compact?: boolean;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "extra markdown" });

  return (
    <div
      data-testid="say-to-me-extra-markdown"
      className={cn(
        "mt-2 rounded-xl border border-border/70 bg-muted/25 px-3 py-2.5 short:mt-1 short:rounded-lg short:px-1.5 short:py-1.5",
        compact && "max-h-36 overflow-y-auto overscroll-contain short:max-h-28",
      )}
    >
      {compact ? null : (
        <div className="flex justify-end">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={isCopied ? "Copied extra markdown" : "Copy extra markdown"}
            title={isCopied ? "Copied" : "Copy extra markdown"}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => copyToClipboard(markdown, undefined)}
          >
            {isCopied ? (
              <CheckIcon className="size-3 text-primary" />
            ) : (
              <CopyIcon className="size-3" />
            )}
          </Button>
        </div>
      )}
      <ChatMarkdown text={markdown} cwd={undefined} className="min-w-0" />
    </div>
  );
}

function SayToMeUsagePromptButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button size="xs" variant="outline" onClick={onClick}>
      {SAY_TO_ME_USAGE_PROMPT}
    </Button>
  );
}

function sessionDisplayName(session: SayToMeSession): string {
  return session.alias?.trim() || session.title?.trim() || session.id;
}

function sessionWaitingLabel(waitingState: string | null | undefined): string {
  switch (waitingState) {
    case "working":
      return "Working";
    case "needs_answer":
      return "Needs answer";
    case "can_continue":
      return "Idle";
    default:
      return waitingState?.replaceAll("_", " ") || "Unknown";
  }
}

function sessionWaitingClass(waitingState: string | null | undefined): string {
  switch (waitingState) {
    case "working":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    case "needs_answer":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "can_continue":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function VoiceNoteSessionCard({ session }: { readonly session: SayToMeSession }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "session mention" });
  const mention = session.alias
    ? `say-to-me(${session.id}, ${session.alias})`
    : `say-to-me(${session.id})`;
  const latestActivity = session.latestActivity ?? session.summaryUpdatedAt;

  return (
    <div className="mt-2 rounded-xl border border-border/70 bg-background/70 p-2.5 short:mt-1 short:rounded-lg short:p-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong className="min-w-0 truncate text-sm short:text-[11px]">
          {sessionDisplayName(session)}
        </strong>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide short:text-[9px]",
            sessionWaitingClass(session.waitingState),
          )}
        >
          {sessionWaitingLabel(session.waitingState)}
        </span>
        {latestActivity ? (
          <span className="text-muted-foreground text-xs short:text-[10px]">
            Latest: {formatSayToMeTimestamp(latestActivity)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 short:mt-1 short:gap-1">
        <a
          href={sayToMeSessionUrl(session.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-muted short:h-6 short:px-1.5 short:text-[10px]"
        >
          Open
        </a>
        <Button size="xs" variant="outline" onClick={() => copyToClipboard(mention, undefined)}>
          {isCopied ? "Copied" : "Copy mention"}
        </Button>
      </div>
      {session.summary ? (
        <p className="mt-2 line-clamp-2 text-muted-foreground text-xs short:mt-1 short:text-[10px]">
          Last update: {session.summary.replace(/^Last update:\s*/i, "")}
        </p>
      ) : null}
      <details className="mt-1.5 text-muted-foreground text-xs short:mt-1 short:text-[10px]">
        <summary className="cursor-pointer font-medium hover:text-foreground">Details</summary>
        <p className="mt-1 break-all">{session.id}</p>
        {session.messageCount !== null && session.messageCount !== undefined ? (
          <p>{session.messageCount} messages</p>
        ) : null}
      </details>
    </div>
  );
}

/** Notes are stored newest-first; the speaker icon replays that head entry when idle. */
export function mostRecentVoiceNote<T>(notes: ReadonlyArray<T>): T | null {
  return notes[0] ?? null;
}

export function latestVoiceNoteExtraMarkdown(
  notes: ReadonlyArray<Pick<VoiceNote, "extraMarkdown">>,
): string | null {
  const markdown = notes[0]?.extraMarkdown;
  return typeof markdown === "string" && markdown.trim() ? markdown : null;
}

type VoiceNotesBannerProps = {
  readonly environmentId: string;
  readonly threadId: string;
  readonly onInsertUsagePrompt: () => void;
};

export function VoiceNotesBanner({
  environmentId,
  threadId,
  onInsertUsagePrompt,
}: VoiceNotesBannerProps) {
  const sessionId = voiceNotesSessionId(environmentId, threadId);
  const notesUrl = voiceNotesUrl(sessionId);
  const [notes, setNotes] = useState<ReadonlyArray<VoiceNote>>([]);
  const [hasLoadedRemoteNotes, setHasLoadedRemoteNotes] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [timersOpen, setTimersOpen] = useState(false);
  const { copyToClipboard: copySessionMention, isCopied: isSessionMentionCopied } =
    useCopyToClipboard({ target: "session mention" });
  const { showEnableSound, enableSound, reportPermissionIssue } = useSoundUnlock();
  const { timers, now: timerNow, refresh: refreshTimers } = useSayToMeTimers(sessionId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useLocalStorage(
    SAY_TO_ME_BANNER_COLLAPSED_STORAGE_KEY,
    false,
    CollapsedSchema,
  );
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
            extraMarkdown: message.extraMarkdown ?? null,
            status: message.status,
            attachments: message.attachments ?? [],
            sessions: message.sessions ?? [],
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

  const stopAllSpeech = () => {
    const queuedIds = claimQueuedNotesForStopAll(notes, autoplayClaimedIdsRef.current);
    for (const noteId of queuedIds) {
      updateNoteStatus(noteId, "stopped");
    }
    stop();
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
      utterance.onerror = (event) => {
        utteranceRef.current = null;
        setPlayingId(null);
        autoplayLockRef.current = false;
        updateNoteStatus(note.id, "stopped");
        if (event.error === "not-allowed") reportPermissionIssue();
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

  const onSpeakerIconClick = () => {
    if (playingId) {
      stopAllSpeech();
      return;
    }
    const note = mostRecentVoiceNote(notes);
    if (!note) return;
    play(note);
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

  const latestExtraMarkdown = latestVoiceNoteExtraMarkdown(notes);
  const activeTimers = timers.filter(
    (timer) => timer.status === "active" || timer.status === "paused",
  );
  const nextTimer = activeTimers
    .slice()
    .sort((left, right) => left.nextFireAt - right.nextFireAt)[0];
  const collapsedAction =
    sessionState === "missing"
      ? "create-session"
      : sessionState === "ready" && hasLoadedRemoteNotes && notes.length === 0
        ? "usage-prompt"
        : null;

  return (
    <section
      aria-label="Say To Me"
      data-testid="say-to-me-banner"
      data-collapsed={collapsed ? "true" : "false"}
      className={sayToMeBannerSectionClass(
        collapsed,
        latestExtraMarkdown !== null,
        collapsedAction !== null || activeTimers.length > 0 || timersOpen,
      )}
    >
      <div
        className={cn(
          "rounded-2xl border border-info/32 text-card-foreground shadow-sm short:rounded-xl",
          collapsed
            ? "pointer-events-auto bg-card/95 p-2 shadow-md backdrop-blur-sm short:p-1.5"
            : "bg-info/4 p-4 short:p-1.5",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 short:gap-1.5",
            !collapsed && "mb-3 items-start short:mb-1.5",
          )}
        >
          <button
            type="button"
            aria-label={playingId ? "Stop all speech" : "Play most recent voice note"}
            title={playingId ? "Stop all speech" : "Play most recent voice note"}
            data-speaking={playingId ? "true" : "false"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl text-info transition-colors short:size-4 short:rounded-md",
              playingId
                ? "animate-status-pulse bg-info/45 hover:bg-info/55"
                : "bg-info/12 hover:bg-info/20",
            )}
            onClick={onSpeakerIconClick}
          >
            <Volume2Icon className="size-4 short:size-2" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 short:gap-1.5">
              <h2 className="font-medium text-sm short:text-[11px]">
                <a
                  href={sayToMeTitleUrl(sessionId, sessionState)}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  Say To Me
                </a>
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Copy Say To Me session mention"
                  title="Copy Say To Me session mention"
                  className="h-6 w-6 shrink-0 justify-center px-0 font-mono text-[10px] text-muted-foreground hover:text-foreground short:h-5 short:w-5 short:text-[9px]"
                  onClick={() => copySessionMention(`say-to-me(${sessionId})`, undefined)}
                >
                  {isSessionMentionCopied ? (
                    <CheckIcon className="size-3.5 short:size-3" aria-hidden />
                  ) : (
                    "ID"
                  )}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Park session"
                  title="Park session"
                  className="h-6 w-6 shrink-0 justify-center px-0 font-mono text-[10px] text-muted-foreground hover:text-foreground short:h-5 short:w-5 short:text-[9px]"
                  onClick={() => {
                    const url = new URL("/park", window.location.origin);
                    url.searchParams.set("environmentId", environmentId);
                    url.searchParams.set("threadId", threadId);
                    window.location.assign(url);
                  }}
                >
                  P
                </Button>
                {!collapsed ? (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Show timers"
                    title="Show timers"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setTimersOpen((value) => !value)}
                  >
                    <AlarmClockIcon className="size-3.5 short:size-3" aria-hidden />
                    {activeTimers.length > 0 ? (
                      <span className="sr-only">{activeTimers.length} active</span>
                    ) : null}
                  </Button>
                ) : null}
                {/* Keep Expand/Collapse as the rightmost header control. */}
                <Button
                  size="xs"
                  variant="ghost"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? "Expand Say To Me" : "Collapse Say To Me"}
                  className="h-6 shrink-0 gap-0.5 px-1.5 text-xs short:h-5 short:text-[9px]"
                  onClick={() => setCollapsed((value) => !value)}
                >
                  {collapsed ? (
                    <ChevronDownIcon className="size-3 short:size-2.5" aria-hidden />
                  ) : (
                    <ChevronUpIcon className="size-3 short:size-2.5" aria-hidden />
                  )}
                  {collapsed ? "Expand" : "Collapse"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {showEnableSound ? (
          <div
            className={cn(
              "flex items-center justify-between gap-2",
              collapsed
                ? "mt-1 justify-end"
                : "mt-2 rounded-xl border border-border/60 bg-background/55 px-3 py-2 text-sm short:mt-1 short:rounded-lg short:px-1.5 short:py-1.5 short:text-[11px]",
            )}
          >
            {!collapsed ? (
              <span className="text-muted-foreground">
                Enable sound to hear Say To Me notifications.
              </span>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="outline"
              className={cn("shrink-0", collapsed && "h-6 px-2 text-[10px]")}
              onClick={() => void enableSound()}
            >
              <Volume2Icon className="size-3.5 short:size-3" aria-hidden />
              Enable sound
            </Button>
          </div>
        ) : null}

        {nextTimer ? (
          <button
            type="button"
            className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-left text-foreground text-xs hover:bg-muted short:mt-1 short:px-1.5 short:py-0.5 short:text-[10px]"
            onClick={() => setTimersOpen((value) => !value)}
          >
            <AlarmClockIcon className="size-3" aria-hidden />
            <span className="truncate">
              {nextTimer.title} · {timerRelativeLabel(nextTimer.nextFireAt, timerNow)}
            </span>
          </button>
        ) : null}

        {timersOpen ? (
          <SayToMeTimerPanel
            sessionId={sessionId}
            timers={timers}
            now={timerNow}
            onRefresh={refreshTimers}
          />
        ) : null}

        {collapsed && latestExtraMarkdown !== null ? (
          <VoiceNoteExtraMarkdown markdown={latestExtraMarkdown} compact />
        ) : null}

        {collapsed && collapsedAction !== null ? (
          <div className="mt-2 flex justify-end short:mt-1">
            {collapsedAction === "create-session" ? (
              <Button
                size="xs"
                variant="outline"
                disabled={isCreatingSession}
                onClick={createSession}
              >
                {isCreatingSession ? "Creating..." : "Click here to start using Say To Me"}
              </Button>
            ) : (
              <SayToMeUsagePromptButton onClick={onInsertUsagePrompt} />
            )}
          </div>
        ) : null}

        {collapsed ? null : (
          <div
            className={cn(
              "max-h-64 space-y-2 overflow-y-auto short:max-h-32 short:space-y-1",
              (nextTimer || timersOpen) && "mt-3",
            )}
          >
            {sessionState === "missing" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/55 px-3 py-2.5 short:gap-1.5 short:rounded-lg short:px-1.5 short:py-1.5">
                <p className="text-muted-foreground text-sm short:text-[11px]">
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
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/55 px-3 py-2.5 short:gap-1.5 short:rounded-lg short:px-1.5 short:py-1.5">
                <p className="text-muted-foreground text-sm short:text-[11px]">
                  Say To Me is unavailable.
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setSessionState("loading");
                    setHasLoadedRemoteNotes(false);
                    setReloadToken((token) => token + 1);
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : !hasLoadedRemoteNotes ? (
              <p className="rounded-xl bg-background/55 px-3 py-2.5 text-muted-foreground text-sm short:rounded-lg short:px-1.5 short:py-1.5 short:text-[11px]">
                Loading voice notes...
              </p>
            ) : notes.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background/55 px-3 py-2.5 short:gap-1.5 short:rounded-lg short:px-1.5 short:py-1.5">
                <p className="text-muted-foreground text-sm short:text-[11px]">
                  No voice notes yet.
                </p>
                <SayToMeUsagePromptButton onClick={onInsertUsagePrompt} />
              </div>
            ) : (
              notes.map((note) => {
                const isPlaying = playingId === note.id;
                const status = isPlaying ? "speaking" : note.status;
                return (
                  <article
                    key={note.id}
                    className={cn(
                      "rounded-xl border bg-background/55 px-3 py-2.5 transition-colors short:rounded-lg short:px-1.5 short:py-1.5",
                      isPlaying ? "border-info/45 bg-info/8" : "border-border/60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 short:gap-1.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs short:gap-x-1.5 short:gap-y-0.5 short:text-[10px]">
                          <span className="font-mono">#{note.id}</span>
                          <span className="font-medium text-foreground">{note.author}</span>
                          <span>{formatSayToMeTimestamp(note.time)}</span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide short:text-[9px]",
                              statusBadgeClass(status),
                            )}
                          >
                            {status === "played" ? (
                              <CheckIcon className="size-3 short:size-2.5" aria-hidden />
                            ) : null}
                            {status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-5 short:mt-0.5 short:text-[11px] short:leading-4">
                          {note.text}
                        </p>
                        {typeof note.extraMarkdown === "string" && note.extraMarkdown.trim() ? (
                          <VoiceNoteExtraMarkdown markdown={note.extraMarkdown} />
                        ) : null}
                        {note.sessions.map((session) => (
                          <VoiceNoteSessionCard key={session.id} session={session} />
                        ))}
                        {note.attachments.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2 short:mt-1 short:gap-1.5">
                            {note.attachments.map((attachment) => {
                              const thumbnail = imageAttachmentThumbnail(attachment);
                              return thumbnail ? (
                                <a
                                  key={attachment.id}
                                  href={sayToMeAttachmentUrl(attachment.id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open ${attachment.originalName}`}
                                >
                                  <img
                                    src={thumbnail}
                                    alt={attachment.originalName}
                                    className="max-h-32 max-w-48 rounded-lg border border-border/60 object-contain short:max-h-16 short:max-w-24 short:rounded-md"
                                  />
                                </a>
                              ) : null;
                            })}
                          </div>
                        ) : null}
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
        )}
      </div>
    </section>
  );
}
