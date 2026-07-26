import { ChatAttachment, ModelSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  ProjectionThreadQueuedMessage,
  ProjectionThreadQueuedMessageIdInput,
  ProjectionThreadQueuedMessageRepository,
  type ProjectionThreadQueuedMessageRepositoryShape,
  ProjectionThreadQueuedMessagesByThreadInput,
} from "../Services/ProjectionThreadQueuedMessages.ts";

const ProjectionThreadQueuedMessageDbRow = ProjectionThreadQueuedMessage.mapFields(
  Struct.assign({
    attachments: Schema.fromJsonString(Schema.Array(ChatAttachment)),
    modelSelection: Schema.NullOr(Schema.fromJsonString(ModelSelection)),
  }),
);

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionThreadQueuedMessage,
    execute: (row) => sql`
      INSERT INTO projection_thread_queued_messages (
        message_id,
        thread_id,
        text,
        attachments_json,
        model_selection_json,
        title_seed,
        runtime_mode,
        interaction_mode,
        source_proposed_plan_thread_id,
        source_proposed_plan_id,
        created_at
      )
      VALUES (
        ${row.messageId},
        ${row.threadId},
        ${row.text},
        ${JSON.stringify(row.attachments)},
        ${row.modelSelection === null ? null : JSON.stringify(row.modelSelection)},
        ${row.titleSeed},
        ${row.runtimeMode},
        ${row.interactionMode},
        ${row.sourceProposedPlanThreadId},
        ${row.sourceProposedPlanId},
        ${row.createdAt}
      )
      ON CONFLICT (message_id)
      DO UPDATE SET
        thread_id = excluded.thread_id,
        text = excluded.text,
        attachments_json = excluded.attachments_json,
        model_selection_json = excluded.model_selection_json,
        title_seed = excluded.title_seed,
        runtime_mode = excluded.runtime_mode,
        interaction_mode = excluded.interaction_mode,
        source_proposed_plan_thread_id = excluded.source_proposed_plan_thread_id,
        source_proposed_plan_id = excluded.source_proposed_plan_id,
        created_at = excluded.created_at
    `,
  });

  const rowSelection = sql`
    SELECT
      message_id AS "messageId",
      thread_id AS "threadId",
      text,
      attachments_json AS "attachments",
      model_selection_json AS "modelSelection",
      title_seed AS "titleSeed",
      runtime_mode AS "runtimeMode",
      interaction_mode AS "interactionMode",
      source_proposed_plan_thread_id AS "sourceProposedPlanThreadId",
      source_proposed_plan_id AS "sourceProposedPlanId",
      created_at AS "createdAt"
    FROM projection_thread_queued_messages
  `;

  const getRow = SqlSchema.findOneOption({
    Request: ProjectionThreadQueuedMessageIdInput,
    Result: ProjectionThreadQueuedMessageDbRow,
    execute: ({ messageId }) => sql`${rowSelection} WHERE message_id = ${messageId} LIMIT 1`,
  });

  const listRows = SqlSchema.findAll({
    Request: ProjectionThreadQueuedMessagesByThreadInput,
    Result: ProjectionThreadQueuedMessageDbRow,
    execute: ({ threadId }) =>
      sql`${rowSelection} WHERE thread_id = ${threadId} ORDER BY created_at ASC, message_id ASC`,
  });

  const deleteRow = SqlSchema.void({
    Request: ProjectionThreadQueuedMessageIdInput,
    execute: ({ messageId }) =>
      sql`DELETE FROM projection_thread_queued_messages WHERE message_id = ${messageId}`,
  });

  const deleteThreadRows = SqlSchema.void({
    Request: ProjectionThreadQueuedMessagesByThreadInput,
    execute: ({ threadId }) =>
      sql`DELETE FROM projection_thread_queued_messages WHERE thread_id = ${threadId}`,
  });

  const mapSqlError = (operation: string) => toPersistenceSqlError(operation);

  return ProjectionThreadQueuedMessageRepository.of({
    upsert: (row) =>
      upsertRow(row).pipe(
        Effect.mapError(mapSqlError("ProjectionThreadQueuedMessageRepository.upsert:query")),
      ),
    getByMessageId: (input) =>
      getRow(input).pipe(
        Effect.mapError(
          mapSqlError("ProjectionThreadQueuedMessageRepository.getByMessageId:query"),
        ),
        Effect.map(Option.map((row) => row)),
      ),
    listByThreadId: (input) =>
      listRows(input).pipe(
        Effect.mapError(
          mapSqlError("ProjectionThreadQueuedMessageRepository.listByThreadId:query"),
        ),
      ),
    deleteByMessageId: (input) =>
      deleteRow(input).pipe(
        Effect.mapError(
          mapSqlError("ProjectionThreadQueuedMessageRepository.deleteByMessageId:query"),
        ),
      ),
    deleteByThreadId: (input) =>
      deleteThreadRows(input).pipe(
        Effect.mapError(
          mapSqlError("ProjectionThreadQueuedMessageRepository.deleteByThreadId:query"),
        ),
      ),
  } satisfies ProjectionThreadQueuedMessageRepositoryShape);
});

export const ProjectionThreadQueuedMessageRepositoryLive = Layer.effect(
  ProjectionThreadQueuedMessageRepository,
  make,
);
