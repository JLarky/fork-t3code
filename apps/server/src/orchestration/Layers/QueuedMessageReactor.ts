import { CommandId, type OrchestrationEvent, type ThreadId } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  QueuedMessageReactor,
  type QueuedMessageReactorShape,
} from "../Services/QueuedMessageReactor.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

type QueueReleaseTrigger = {
  readonly threadId: ThreadId;
  readonly eventType: OrchestrationEvent["type"] | "startup";
};

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const snapshotQuery = yield* ProjectionSnapshotQuery;
  const crypto = yield* Crypto.Crypto;

  const attemptRelease = Effect.fn("attemptQueuedMessageRelease")(function* ({
    threadId,
  }: QueueReleaseTrigger) {
    const threadOption = yield* snapshotQuery.getThreadDetailById(threadId);
    if (Option.isNone(threadOption)) return;
    const queuedMessage = threadOption.value.queuedMessages?.[0];
    if (!queuedMessage) return;
    const commandId = CommandId.make(yield* crypto.randomUUIDv4);
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    yield* orchestrationEngine.dispatch({
      type: "thread.queued-message.release",
      commandId,
      threadId,
      messageId: queuedMessage.id,
      createdAt,
    });
  });

  const attemptReleaseSafely = (trigger: QueueReleaseTrigger) =>
    attemptRelease(trigger).pipe(
      Effect.catch((error) =>
        typeof error === "object" &&
        error !== null &&
        "_tag" in error &&
        error._tag === "OrchestrationCommandInvariantError"
          ? Effect.void
          : Effect.logWarning("queued message reactor failed to release message", {
              threadId: trigger.threadId,
              eventType: trigger.eventType,
              error,
            }),
      ),
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
        return Effect.logWarning("queued message reactor failed unexpectedly", {
          threadId: trigger.threadId,
          eventType: trigger.eventType,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(attemptReleaseSafely);

  const enqueueEvent = (event: OrchestrationEvent) => {
    switch (event.type) {
      case "thread.message-queued":
      case "thread.queued-message-released":
      case "thread.session-set":
      case "thread.activity-appended":
      case "thread.turn-diff-completed":
      case "thread.reverted":
        return worker.enqueue({
          threadId: event.payload.threadId,
          eventType: event.type,
        });
      default:
        return Effect.void;
    }
  };

  const start: QueuedMessageReactorShape["start"] = Effect.fn("start")(function* () {
    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, enqueueEvent),
    );
    const snapshot = yield* snapshotQuery
      .getShellSnapshot()
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("queued message reactor failed to scan startup queue", { error }).pipe(
            Effect.as(null),
          ),
        ),
      );
    if (snapshot === null) return;
    yield* Effect.forEach(
      snapshot.threads,
      (thread) =>
        (thread.queuedMessageCount ?? 0) > 0
          ? worker.enqueue({ threadId: thread.id, eventType: "startup" })
          : Effect.void,
      { discard: true },
    );
  });

  return {
    start,
    drain: worker.drain,
  } satisfies QueuedMessageReactorShape;
});

export const QueuedMessageReactorLive = Layer.effect(QueuedMessageReactor, make);
