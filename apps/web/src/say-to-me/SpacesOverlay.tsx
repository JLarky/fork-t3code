import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { useProjects, useThreadShells } from "~/state/entities";
import { sayToMeSessionUrl, sayToMeSpaceDashboardUrl } from "./sayToMeUi";
import { onOpenSpaces } from "./spacesBus";
import { voiceNotesSessionId } from "./voiceSessionId";

type T3SpaceSession = {
  readonly environmentId: string;
  readonly threadId: string;
  readonly sessionId: string;
  readonly spaceId: string;
  readonly title: string;
  readonly claimedAt: string;
};

type T3SpaceSummary = {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly sessions: ReadonlyArray<T3SpaceSession>;
};

function sessionKey(environmentId: string, threadId: string): string {
  return `${environmentId}::${threadId}`;
}

/**
 * Spaces overlay. Opened with Cmd/Ctrl+I (or Search → Open Spaces).
 * Claim attaches the thread's `vo_t3_<env>__<thread>` voice room into native
 * Say To Me `space_sessions` via claimSession — so it shows on the dashboard.
 */
export function SpacesOverlay() {
  const [open, setOpen] = useState(false);
  const [spaces, setSpaces] = useState<ReadonlyArray<T3SpaceSummary>>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const projects = useProjects();
  const threads = useThreadShells();

  const projectTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(`${project.environmentId}::${project.id}`, project.title);
    }
    return map;
  }, [projects]);

  const threadTitleByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const thread of threads) {
      map.set(sessionKey(thread.environmentId, thread.id), thread.title);
    }
    return map;
  }, [threads]);

  const loadSpaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/t3-spaces", { credentials: "include" });
      if (!response.ok) {
        setError(response.status === 502 ? "Say To Me is unavailable." : "Unable to load spaces.");
        setSpaces([]);
        return;
      }
      const payload = (await response.json()) as { spaces?: T3SpaceSummary[] };
      const next = Array.isArray(payload.spaces) ? payload.spaces : [];
      setSpaces(next);
      setSelectedSpaceId((current) => {
        if (current && next.some((space) => space.id === current)) return current;
        return next.find((space) => !space.archived)?.id ?? next[0]?.id ?? null;
      });
    } catch {
      setError("Unable to load spaces.");
      setSpaces([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadSpaces();
  }, [open, loadSpaces]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.shiftKey) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== "i") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => onOpenSpaces(() => setOpen(true)), []);

  const selectedSpace = useMemo(
    () => spaces.find((space) => space.id === selectedSpaceId) ?? null,
    [spaces, selectedSpaceId],
  );

  const claimedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const space of spaces) {
      for (const session of space.sessions) {
        keys.add(sessionKey(session.environmentId, session.threadId));
      }
    }
    return keys;
  }, [spaces]);

  const unclaimedSessions = useMemo(
    () =>
      threads.filter(
        (thread) =>
          thread.archivedAt === null &&
          !claimedKeys.has(sessionKey(thread.environmentId, thread.id)),
      ),
    [threads, claimedKeys],
  );

  const claimSession = async (thread: (typeof threads)[number]) => {
    if (!selectedSpace) return;
    const key = sessionKey(thread.environmentId, thread.id);
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch(
        `/api/t3-spaces/${encodeURIComponent(selectedSpace.id)}/sessions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            environmentId: thread.environmentId,
            threadId: thread.id,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to claim session.");
        return;
      }
      await loadSpaces();
    } catch {
      setError("Unable to claim session.");
    } finally {
      setBusyKey(null);
    }
  };

  const releaseSession = async (session: T3SpaceSession) => {
    const key = sessionKey(session.environmentId, session.threadId);
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch(
        `/api/t3-spaces/${encodeURIComponent(session.spaceId)}/sessions/${encodeURIComponent(session.environmentId)}/${encodeURIComponent(session.threadId)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok && response.status !== 204) {
        setError("Unable to release session.");
        return;
      }
      await loadSpaces();
    } catch {
      setError("Unable to release session.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPopup className="flex max-h-[min(36rem,85vh)] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-border/60 border-b px-4 py-3">
          <DialogTitle>Spaces</DialogTitle>
          <DialogDescription>
            Claim T3 threads into Say To Me spaces via their voice rooms. Press Cmd/Ctrl+I to
            toggle.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[11rem_1fr] overflow-hidden">
          <aside className="border-border/60 overflow-y-auto border-r p-2">
            {isLoading && spaces.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">Loading…</p>
            ) : spaces.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">No spaces yet.</p>
            ) : (
              spaces.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  className={cn(
                    "hover:bg-muted/60 flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm",
                    selectedSpaceId === space.id && "bg-muted",
                    space.archived && "text-muted-foreground",
                  )}
                  onClick={() => setSelectedSpaceId(space.id)}
                >
                  <span className="truncate font-medium">{space.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {space.sessions.length} claimed
                    {space.archived ? " · archived" : ""}
                  </span>
                </button>
              ))
            )}
          </aside>

          <div className="overflow-y-auto p-3">
            {error ? (
              <p className="bg-destructive/10 text-destructive mb-3 rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            ) : null}

            {!selectedSpace ? (
              <p className="text-muted-foreground text-sm">Select a space to manage sessions.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <section>
                  <h3 className="mb-2 flex items-baseline gap-2 text-sm font-medium">
                    <span>In {selectedSpace.name}</span>
                    <a
                      href={sayToMeSpaceDashboardUrl(selectedSpace.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground text-xs font-normal underline underline-offset-2"
                    >
                      open
                    </a>
                  </h3>
                  {selectedSpace.sessions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No T3 sessions claimed yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {selectedSpace.sessions.map((session) => {
                        const key = sessionKey(session.environmentId, session.threadId);
                        const title =
                          threadTitleByKey.get(key) || session.title || session.threadId;
                        return (
                          <li
                            key={key}
                            className="bg-muted/40 flex items-center justify-between gap-2 rounded-md px-2.5 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                <a
                                  href={sayToMeSessionUrl(
                                    session.sessionId ||
                                      voiceNotesSessionId(session.environmentId, session.threadId),
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline"
                                >
                                  {title}
                                </a>
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                {session.sessionId}
                              </p>
                            </div>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyKey === key}
                              onClick={() => void releaseSession(session)}
                            >
                              Release
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-medium">Unclaimed T3 sessions</h3>
                  {unclaimedSessions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Every session is claimed.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {unclaimedSessions.map((thread) => {
                        const key = sessionKey(thread.environmentId, thread.id);
                        const projectTitle =
                          projectTitleById.get(`${thread.environmentId}::${thread.projectId}`) ??
                          thread.projectId;
                        return (
                          <li
                            key={key}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2.5 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{thread.title}</p>
                              <p className="text-muted-foreground truncate text-xs">
                                {projectTitle}
                                {thread.branch ? ` · #${thread.branch}` : ""}
                              </p>
                            </div>
                            <Button
                              size="xs"
                              disabled={busyKey === key || selectedSpace.archived}
                              onClick={() => void claimSession(thread)}
                            >
                              Claim
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
