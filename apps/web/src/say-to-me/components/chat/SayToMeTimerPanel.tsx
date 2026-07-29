import { useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../../../components/ui/button";

export type SayToMeTimer = {
  readonly id: number;
  readonly title: string;
  readonly message: string;
  readonly status: string;
  readonly nextFireAt: number;
  readonly intervalMs: number | null;
  readonly lastFiredAt?: number | null;
  readonly lastError?: string | null;
};

export function timerRelativeLabel(nextFireAt: number, now: number): string {
  const seconds = Math.round((nextFireAt - now) / 1000);
  if (seconds <= 0) return "due now";
  if (seconds < 60) return `in ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function timerStatusClass(status: string): string {
  return status === "active"
    ? "bg-primary/10 text-primary"
    : status === "paused"
      ? "bg-muted text-muted-foreground"
      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
}

function timerDateTimeValue(timestamp: number): string {
  const offset = new Date(timestamp).getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

function timerRepeatLabel(intervalMs: number | null): string {
  return intervalMs && intervalMs > 0
    ? `Repeats every ${Math.round(intervalMs / 60_000)}m`
    : "One-shot";
}

export function SayToMeTimerPanel({
  sessionId,
  timers,
  now,
  onRefresh,
}: {
  readonly sessionId: string;
  readonly timers: ReadonlyArray<SayToMeTimer>;
  readonly now: number;
  readonly onRefresh: () => void;
}) {
  const [title, setTitle] = useState("Check in");
  const [message, setMessage] = useState(
    "Please check in with me and report what needs attention.",
  );
  const [repeatMinutes, setRepeatMinutes] = useState("");
  const [dueAt, setDueAt] = useState(() => timerDateTimeValue(Date.now() + 15 * 60_000));
  const [busy, setBusy] = useState(false);
  const [editingTimerId, setEditingTimerId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const act = async (timer: SayToMeTimer, action: "pause" | "resume" | "trigger" | "cancel") => {
    setBusy(true);
    try {
      await fetch(`/api/say-to-me-timers/${timer.id}/actions`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const edit = (timer: SayToMeTimer) => {
    setCreateOpen(true);
    setEditingTimerId(timer.id);
    setTitle(timer.title);
    setMessage(timer.message);
    setDueAt(timerDateTimeValue(timer.nextFireAt));
    setRepeatMinutes(timer.intervalMs ? String(Math.round(timer.intervalMs / 60_000)) : "");
  };

  const remove = async (timer: SayToMeTimer) => {
    setBusy(true);
    try {
      await fetch(`/api/say-to-me-timers/${timer.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!title.trim() || !message.trim()) return;
    setBusy(true);
    const payload = {
      sessionId,
      title: title.trim(),
      message: message.trim(),
      dueAt: new Date(dueAt).getTime(),
      intervalMs: repeatMinutes.trim() ? Number(repeatMinutes) * 60_000 : null,
    };
    if (
      !Number.isFinite(payload.dueAt) ||
      (payload.intervalMs !== null && payload.intervalMs < 60_000)
    ) {
      setBusy(false);
      return;
    }
    try {
      await fetch(
        editingTimerId === null
          ? "/api/say-to-me-timers"
          : `/api/say-to-me-timers/${editingTimerId}`,
        {
          method: editingTimerId === null ? "POST" : "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      setTitle("");
      setMessage("");
      setRepeatMinutes("");
      setEditingTimerId(null);
      setCreateOpen(false);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border/70 bg-muted/20 p-2.5 short:mt-1 short:max-h-48 short:rounded-lg short:p-1.5">
      <div className="space-y-1.5">
        <p className="font-medium text-muted-foreground text-[11px] uppercase tracking-wide">
          Scheduled timers
        </p>
        {timers.length === 0 ? (
          <p className="text-muted-foreground text-xs">No timers scheduled.</p>
        ) : null}
        {timers.map((timer) => (
          <div
            key={timer.id}
            className="rounded-lg border border-border/60 bg-background/60 p-1.5 text-xs"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="min-w-0 flex-1 truncate">{timer.title}</strong>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] uppercase",
                  timerStatusClass(timer.status),
                )}
              >
                {timer.status}
              </span>
              <span className="text-muted-foreground">
                {timerRelativeLabel(timer.nextFireAt, now)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-muted-foreground text-[10px]">
              <span>{timerRepeatLabel(timer.intervalMs)}</span>
              {timer.lastFiredAt ? (
                <span>Last fired {new Date(timer.lastFiredAt).toLocaleString()}</span>
              ) : null}
              {timer.lastError ? <span className="text-destructive">{timer.lastError}</span> : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || timer.status !== "active"}
                onClick={() => act(timer, "trigger")}
              >
                Trigger now
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || (timer.status !== "active" && timer.status !== "firing")}
                onClick={() => act(timer, "pause")}
              >
                Pause
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || timer.status !== "paused"}
                onClick={() => act(timer, "resume")}
              >
                Resume
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || timer.status === "completed" || timer.status === "cancelled"}
                onClick={() => edit(timer)}
              >
                Edit
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || timer.status === "cancelled" || timer.status === "completed"}
                onClick={() => act(timer, "cancel")}
              >
                Stop
              </Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => remove(timer)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-border/70 pt-2.5">
        {!createOpen ? (
          <Button size="xs" variant="outline" onClick={() => setCreateOpen(true)}>
            Create new timer
          </Button>
        ) : (
          <>
            <p className="font-medium text-muted-foreground text-[11px] uppercase tracking-wide">
              {editingTimerId === null ? "Create new timer" : "Edit timer"}
            </p>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              <input
                aria-label="Timer title"
                className="h-7 min-w-0 rounded-md border bg-background px-2 text-xs"
                placeholder="Timer title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <textarea
                aria-label="Timer message"
                rows={2}
                className="min-h-12 min-w-0 resize-y rounded-md border bg-background px-2 py-1 text-xs"
                placeholder="Message to send"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <input
                aria-label="Timer due time"
                type="datetime-local"
                className="h-7 min-w-0 rounded-md border bg-background px-2 text-xs"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
              <input
                aria-label="Timer repeat minutes"
                type="number"
                min={1}
                className="h-7 min-w-0 rounded-md border bg-background px-2 text-xs"
                placeholder="Repeat minutes (optional)"
                value={repeatMinutes}
                onChange={(event) => setRepeatMinutes(event.target.value)}
              />
            </div>
            <Button
              size="xs"
              className="mt-1.5"
              disabled={busy || !title.trim() || !message.trim()}
              onClick={create}
            >
              {editingTimerId === null ? "Create timer" : "Save timer"}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="mt-1.5 ml-1.5"
              onClick={() => {
                setCreateOpen(false);
                setEditingTimerId(null);
              }}
            >
              Close
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
