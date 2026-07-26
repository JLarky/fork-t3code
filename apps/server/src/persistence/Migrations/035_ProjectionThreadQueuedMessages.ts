import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!threadColumns.some((column) => column.name === "queued_message_count")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN queued_message_count INTEGER NOT NULL DEFAULT 0
    `;
  }

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_queued_messages (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      text TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      model_selection_json TEXT,
      title_seed TEXT,
      runtime_mode TEXT NOT NULL,
      interaction_mode TEXT NOT NULL,
      source_proposed_plan_thread_id TEXT,
      source_proposed_plan_id TEXT,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_queued_messages_thread_created
    ON projection_thread_queued_messages(thread_id, created_at, message_id)
  `;
});
