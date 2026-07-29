import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useState } from "react";

import { appAtomRegistry } from "../../../rpc/atomRegistry";

const SayToMeTimerSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  message: Schema.String,
  status: Schema.String,
  nextFireAt: Schema.Number,
  intervalMs: Schema.NullOr(Schema.Number),
  lastFiredAt: Schema.optional(Schema.NullOr(Schema.Number)),
  lastError: Schema.optional(Schema.NullOr(Schema.String)),
});

export type SayToMeTimer = Schema.Schema.Type<typeof SayToMeTimerSchema>;

const SayToMeTimersPayloadSchema = Schema.Struct({
  timers: Schema.optional(Schema.Array(SayToMeTimerSchema)),
});

function timersAtom(sessionId: string) {
  return Atom.make(Effect.promise(() => fetchSayToMeTimers(sessionId))).pipe(
    Atom.swr({ staleTime: 15_000, revalidateOnMount: true }),
    Atom.setIdleTTL(5 * 60_000),
    Atom.withLabel(`say-to-me:timers:${sessionId}`),
  );
}

async function fetchSayToMeTimers(sessionId: string): Promise<ReadonlyArray<SayToMeTimer>> {
  const response = await fetch(`/api/say-to-me-timers?sessionId=${encodeURIComponent(sessionId)}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Unable to load Say To Me timers.");
  const payload = await response.json();
  const decoded = await Effect.runPromise(
    Schema.decodeUnknownEffect(SayToMeTimersPayloadSchema)(payload),
  );
  return decoded.timers ?? [];
}

export function useSayToMeTimers(sessionId: string) {
  const atom = useMemo(() => timersAtom(sessionId), [sessionId]);
  const result = useAtomValue(atom);
  const refresh = useCallback(() => appAtomRegistry.refresh(atom), [atom]);
  const [now, setNow] = useState(() => Date.now());
  const timers = Option.getOrElse(
    AsyncResult.value(result),
    () => [] as ReadonlyArray<SayToMeTimer>,
  );
  const hasClock = timers.some((timer) => timer.status === "active" || timer.status === "paused");

  useEffect(() => {
    const interval = window.setInterval(() => {
      refresh();
      setNow(Date.now());
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!hasClock) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [hasClock]);

  const error = result._tag === "Failure" ? Cause.squash(result.cause) : null;
  return {
    timers,
    now,
    error:
      error instanceof Error ? error.message : error ? "Unable to load Say To Me timers." : null,
    isPending: result.waiting,
    refresh,
  };
}
