import {
  ChatAttachment,
  IsoDateTime,
  MessageId,
  ModelSelection,
  OrchestrationProposedPlanId,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadQueuedMessage = Schema.Struct({
  messageId: MessageId,
  threadId: ThreadId,
  text: Schema.String,
  attachments: Schema.Array(ChatAttachment),
  modelSelection: Schema.NullOr(ModelSelection),
  titleSeed: Schema.NullOr(Schema.String),
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  sourceProposedPlanThreadId: Schema.NullOr(ThreadId),
  sourceProposedPlanId: Schema.NullOr(OrchestrationProposedPlanId),
  createdAt: IsoDateTime,
});
export type ProjectionThreadQueuedMessage = typeof ProjectionThreadQueuedMessage.Type;

export const ProjectionThreadQueuedMessageIdInput = Schema.Struct({
  messageId: MessageId,
});
export type ProjectionThreadQueuedMessageIdInput = typeof ProjectionThreadQueuedMessageIdInput.Type;

export const ProjectionThreadQueuedMessagesByThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type ProjectionThreadQueuedMessagesByThreadInput =
  typeof ProjectionThreadQueuedMessagesByThreadInput.Type;

export interface ProjectionThreadQueuedMessageRepositoryShape {
  readonly upsert: (
    message: ProjectionThreadQueuedMessage,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getByMessageId: (
    input: ProjectionThreadQueuedMessageIdInput,
  ) => Effect.Effect<Option.Option<ProjectionThreadQueuedMessage>, ProjectionRepositoryError>;
  readonly listByThreadId: (
    input: ProjectionThreadQueuedMessagesByThreadInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThreadQueuedMessage>, ProjectionRepositoryError>;
  readonly deleteByMessageId: (
    input: ProjectionThreadQueuedMessageIdInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly deleteByThreadId: (
    input: ProjectionThreadQueuedMessagesByThreadInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionThreadQueuedMessageRepository extends Context.Service<
  ProjectionThreadQueuedMessageRepository,
  ProjectionThreadQueuedMessageRepositoryShape
>()(
  "t3/persistence/Services/ProjectionThreadQueuedMessages/ProjectionThreadQueuedMessageRepository",
) {}
