import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface QueuedMessageReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly drain: Effect.Effect<void>;
}

export class QueuedMessageReactor extends Context.Service<
  QueuedMessageReactor,
  QueuedMessageReactorShape
>()("t3/orchestration/Services/QueuedMessageReactor") {}
