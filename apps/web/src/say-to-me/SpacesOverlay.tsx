import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon } from "lucide-react";

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
import { resolveThreadRouteRef } from "~/threadRoutes";
import { sayToMeSessionUrl, sayToMeSpaceDashboardUrl } from "./sayToMeUi";
import { onOpenSpaces } from "./spacesBus";
import { voiceNotesSessionId } from "./voiceSessionId";

export type T3SpaceSession = {
  readonly environmentId: string;
  readonly threadId: string;
  readonly sessionId: string;
  readonly spaceId: string;
  readonly title: string;
  readonly claimedAt: string;
};

export type T3SpaceSummary = {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly archived: boolean;
  readonly sortOrder: number;
  readonly sessions: ReadonlyArray<T3SpaceSession>;
};

export type T3SpaceTreeItem = {
  readonly space: T3SpaceSummary;
  readonly depth: number;
};

function compareSpacesByTreeOrder(left: T3SpaceSummary, right: T3SpaceSummary): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

/** Match Say To Me's Organize view: ordered siblings, then depth-first children. */
export function flattenSpacesForSidebar(
  spaces: ReadonlyArray<T3SpaceSummary>,
): ReadonlyArray<T3SpaceTreeItem> {
  const ids = new Set(spaces.map((space) => space.id));
  const byParent = new Map<string | null, T3SpaceSummary[]>();
  for (const space of spaces) {
    // Treat stale parent references as roots so a space never disappears from T3.
    const parentId = space.parentId && ids.has(space.parentId) ? space.parentId : null;
    const siblings = byParent.get(parentId);
    if (siblings) siblings.push(space);
    else byParent.set(parentId, [space]);
  }
  for (const siblings of byParent.values()) siblings.sort(compareSpacesByTreeOrder);

  const result: T3SpaceTreeItem[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const space of byParent.get(parentId) ?? []) {
      if (visited.has(space.id)) continue;
      visited.add(space.id);
      result.push({ space, depth });
      visit(space.id, depth + 1);
    }
  };
  visit(null, 0);

  // A malformed cyclic relationship cannot be reached from a root. Keep it usable.
  for (const space of [...spaces].sort(compareSpacesByTreeOrder)) {
    if (visited.has(space.id)) continue;
    visited.add(space.id);
    result.push({ space, depth: 0 });
    visit(space.id, 1);
  }
  return result;
}

export function spacePath(
  spaces: ReadonlyArray<T3SpaceSummary>,
  spaceId: string,
): ReadonlyArray<T3SpaceSummary> {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const path: T3SpaceSummary[] = [];
  const visited = new Set<string>();
  let current = byId.get(spaceId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

function sessionKey(environmentId: string, threadId: string): string {
  return `${environmentId}::${threadId}`;
}

export function findThreadSpace(
  spaces: ReadonlyArray<T3SpaceSummary>,
  environmentId: string,
  threadId: string,
): T3SpaceSummary | null {
  const key = sessionKey(environmentId, threadId);
  return (
    spaces.find((space) =>
      space.sessions.some((session) => sessionKey(session.environmentId, session.threadId) === key),
    ) ?? null
  );
}

export function prioritizeCurrentThread(
  sessions: ReadonlyArray<T3SpaceSession>,
  environmentId: string | null,
  threadId: string | null,
): ReadonlyArray<T3SpaceSession> {
  if (!environmentId || !threadId) return sessions;
  const activeKey = sessionKey(environmentId, threadId);
  return sessions
    .map((session, index) => ({ session, index }))
    .toSorted((left, right) => {
      const leftCurrent =
        sessionKey(left.session.environmentId, left.session.threadId) === activeKey;
      const rightCurrent =
        sessionKey(right.session.environmentId, right.session.threadId) === activeKey;
      return Number(rightCurrent) - Number(leftCurrent) || left.index - right.index;
    })
    .map(({ session }) => session);
}

/**
 * Spaces overlay. Opened with Cmd/Ctrl+I (or Search → Open Spaces).
 * Claim attaches the thread's T3 worktree voice room into native
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
  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const currentThread = useMemo(
    () =>
      routeThreadRef
        ? (threads.find(
            (thread) =>
              thread.environmentId === routeThreadRef.environmentId &&
              thread.id === routeThreadRef.threadId,
          ) ?? null)
        : null,
    [routeThreadRef, threads],
  );
  const currentThreadKey = currentThread
    ? sessionKey(currentThread.environmentId, currentThread.id)
    : null;

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
        if (currentThread) {
          const currentSpace = findThreadSpace(next, currentThread.environmentId, currentThread.id);
          if (currentSpace) return currentSpace.id;
        }
        if (current && next.some((space) => space.id === current)) return current;
        return next.find((space) => !space.archived)?.id ?? next[0]?.id ?? null;
      });
    } catch {
      setError("Unable to load spaces.");
      setSpaces([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentThread]);

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
  const currentThreadSpace = useMemo(
    () =>
      currentThread ? findThreadSpace(spaces, currentThread.environmentId, currentThread.id) : null,
    [currentThread, spaces],
  );
  const spacesForSidebar = useMemo(() => flattenSpacesForSidebar(spaces), [spaces]);
  const selectedSpacePath = useMemo(
    () => (selectedSpace ? spacePath(spaces, selectedSpace.id) : []),
    [selectedSpace, spaces],
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
  const selectedSpaceSessions = useMemo(
    () =>
      prioritizeCurrentThread(
        selectedSpace?.sessions ?? [],
        currentThread?.environmentId ?? null,
        currentThread?.id ?? null,
      ),
    [currentThread, selectedSpace],
  );
  const otherUnclaimedSessions = useMemo(
    () =>
      unclaimedSessions.filter(
        (thread) => sessionKey(thread.environmentId, thread.id) !== currentThreadKey,
      ),
    [currentThreadKey, unclaimedSessions],
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
      <DialogPopup className="flex max-h-[min(44rem,88vh)] w-[min(96vw,72rem)] max-w-[72rem] flex-col gap-0 p-0">
        <DialogHeader className="border-border/60 border-b px-5 py-4 md:px-6">
          <DialogTitle>Spaces</DialogTitle>
          <DialogDescription>
            Place T3 voice rooms in the same space tree you use in Say To Me.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[12rem_1fr] overflow-hidden md:grid-cols-[15rem_1fr]">
          <aside className="border-border/60 bg-muted/20 overflow-y-auto border-r p-3">
            <div className="text-muted-foreground flex h-7 items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
              <span>Spaces</span>
              <span>{spaces.filter((space) => !space.archived).length}</span>
            </div>
            {isLoading && spaces.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">Loading…</p>
            ) : spaces.length === 0 ? (
              <p className="text-muted-foreground px-2 py-1.5 text-sm">No spaces yet.</p>
            ) : (
              spacesForSidebar.map(({ space, depth }) => {
                const containsCurrentThread = currentThreadSpace?.id === space.id;
                return (
                  <button
                    key={space.id}
                    type="button"
                    aria-label={
                      containsCurrentThread ? `${space.name} (contains current thread)` : space.name
                    }
                    className={cn(
                      "group relative flex min-h-10 w-full items-center gap-1.5 rounded-md py-2 pr-1.5 text-left text-sm transition-colors",
                      "hover:bg-muted/70 hover:text-foreground",
                      selectedSpaceId === space.id && "bg-background text-foreground shadow-xs",
                      containsCurrentThread &&
                        "before:bg-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r-full",
                      space.archived && "text-muted-foreground",
                    )}
                    onClick={() => setSelectedSpaceId(space.id)}
                    style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
                  >
                    <FolderIcon
                      aria-hidden="true"
                      className="text-muted-foreground size-3.5 shrink-0 group-hover:text-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{space.name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {space.sessions.length}
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="text-muted-foreground size-3 shrink-0 opacity-60"
                    />
                  </button>
                );
              })
            )}
          </aside>

          <div className="overflow-y-auto px-5 py-5 md:px-6">
            {error ? (
              <p className="bg-destructive/10 text-destructive mb-3 rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            ) : null}

            {!selectedSpace ? (
              <p className="text-muted-foreground text-sm">Select a space to manage sessions.</p>
            ) : (
              <div className="flex flex-col gap-6">
                <section
                  className="border-border/60 border-b pb-5"
                  aria-label="Current thread space"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-muted-foreground font-semibold text-[10px] uppercase tracking-[0.14em]">
                        Current thread
                      </p>
                      {currentThread ? (
                        <>
                          <p className="mt-1 truncate font-medium">{currentThread.title}</p>
                          <p className="mt-1 text-muted-foreground text-xs">
                            {currentThreadSpace
                              ? `In ${currentThreadSpace.name}`
                              : "Not in a Say To Me space"}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-muted-foreground text-sm">
                          Open a thread to see its space membership.
                        </p>
                      )}
                    </div>
                    {currentThread && currentThreadSpace ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busyKey === currentThreadKey}
                        onClick={() => {
                          const membership = currentThreadSpace.sessions.find(
                            (session) =>
                              session.environmentId === currentThread.environmentId &&
                              session.threadId === currentThread.id,
                          );
                          if (membership) void releaseSession(membership);
                        }}
                      >
                        Release
                      </Button>
                    ) : currentThread && selectedSpace ? (
                      <Button
                        size="xs"
                        disabled={busyKey === currentThreadKey || selectedSpace.archived}
                        onClick={() => void claimSession(currentThread)}
                      >
                        Add to {selectedSpace.name}
                      </Button>
                    ) : null}
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-muted-foreground font-semibold text-[10px] uppercase tracking-[0.14em]">
                        Space
                      </p>
                      <h3 className="mt-1 truncate text-lg font-semibold">{selectedSpace.name}</h3>
                      {selectedSpacePath.length > 1 ? (
                        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-0.5 text-xs">
                          {selectedSpacePath.map((space, index) => (
                            <span key={space.id} className="flex items-center gap-0.5">
                              {index > 0 ? (
                                <ChevronRightIcon aria-hidden="true" className="size-3" />
                              ) : null}
                              <span>{space.name}</span>
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <a
                      href={sayToMeSpaceDashboardUrl(selectedSpace.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground shrink-0 pt-1 text-xs underline underline-offset-2"
                    >
                      Open in Say To Me
                    </a>
                  </div>
                  {selectedSpaceSessions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No T3 sessions claimed yet.</p>
                  ) : (
                    <ul className="divide-border/60 overflow-hidden rounded-lg border divide-y">
                      {selectedSpaceSessions.map((session) => {
                        const key = sessionKey(session.environmentId, session.threadId);
                        const isCurrent = key === currentThreadKey;
                        const title =
                          threadTitleByKey.get(key) || session.title || session.threadId;
                        return (
                          <li
                            key={key}
                            className={cn(
                              "flex min-h-14 items-center justify-between gap-3 px-3 py-2.5",
                              isCurrent
                                ? "border-primary/70 bg-muted/45 border-l-2 pl-[10px]"
                                : "hover:bg-muted/30",
                            )}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                <Link
                                  to="/$environmentId/$threadId"
                                  params={{
                                    environmentId: session.environmentId,
                                    threadId: session.threadId,
                                  }}
                                  className="hover:underline"
                                >
                                  {title}
                                </Link>
                                {isCurrent ? (
                                  <span className="text-muted-foreground ml-2 text-[10px] font-medium uppercase tracking-wide">
                                    Current
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                {session.sessionId}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <a
                                href={sayToMeSessionUrl(
                                  session.sessionId ||
                                    voiceNotesSessionId(session.environmentId, session.threadId),
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground px-1.5 text-xs underline underline-offset-2"
                              >
                                Say To Me
                              </a>
                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={busyKey === key}
                                onClick={() => void releaseSession(session)}
                              >
                                Release
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="border-border/60 border-t pt-5">
                  <h3 className="text-muted-foreground mb-3 font-semibold text-[10px] uppercase tracking-[0.14em]">
                    Other unclaimed T3 sessions
                  </h3>
                  {otherUnclaimedSessions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No other unclaimed sessions.</p>
                  ) : (
                    <ul className="divide-border/60 overflow-hidden rounded-lg border divide-y">
                      {otherUnclaimedSessions.map((thread) => {
                        const key = sessionKey(thread.environmentId, thread.id);
                        const projectTitle =
                          projectTitleById.get(`${thread.environmentId}::${thread.projectId}`) ??
                          thread.projectId;
                        return (
                          <li
                            key={key}
                            className="flex min-h-14 items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/30"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                <Link
                                  to="/$environmentId/$threadId"
                                  params={{
                                    environmentId: thread.environmentId,
                                    threadId: thread.id,
                                  }}
                                  className="hover:underline"
                                >
                                  {thread.title}
                                </Link>
                              </p>
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
