import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationSession,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-07-25T00:00:00.000Z";
const THREAD_ID = ThreadId.make("thread-queue");
const MESSAGE_ID = MessageId.make("message-queue");

function makeReadModel(
  status: OrchestrationSession["status"] | null,
  queued = false,
): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      {
        id: THREAD_ID,
        projectId: ProjectId.make("project-queue"),
        title: "Queue",
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
        deletedAt: null,
        messages: [],
        queuedMessages: queued
          ? [
              {
                id: MESSAGE_ID,
                text: "queued",
                attachments: [],
                runtimeMode: "full-access",
                interactionMode: "default",
                createdAt: NOW,
              },
            ]
          : [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session:
          status === null
            ? null
            : {
                threadId: THREAD_ID,
                status,
                providerName: "Codex",
                runtimeMode: "full-access",
                activeTurnId: null,
                lastError: null,
                updatedAt: NOW,
              },
      },
    ],
    updatedAt: NOW,
  };
}

const startCommand = {
  type: "thread.turn.start" as const,
  commandId: CommandId.make("command-queue"),
  threadId: THREAD_ID,
  message: {
    messageId: MESSAGE_ID,
    role: "user" as const,
    text: "queued",
    attachments: [],
  },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  deliveryMode: "when-idle" as const,
  createdAt: NOW,
};

it.layer(NodeServices.layer)("queued message decider", (it) => {
  it.effect("queues an ordinary send while the session is running", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: startCommand,
        readModel: makeReadModel("running"),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((event) => event.type)).toEqual(["thread.message-queued"]);
    }),
  );

  it.effect("delivers an ordinary send immediately while idle", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: startCommand,
        readModel: makeReadModel("idle"),
      });
      const events = Array.isArray(result) ? result : [result];
      expect(events.map((event) => event.type)).toEqual([
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);
    }),
  );

  it.effect("releases the queue head while idle and force releases while running", () =>
    Effect.gen(function* () {
      for (const [type, status] of [
        ["thread.queued-message.release", "idle"],
        ["thread.queued-message.force", "running"],
      ] as const) {
        const result = yield* decideOrchestrationCommand({
          command: {
            type,
            commandId: CommandId.make(`command-${type}`),
            threadId: THREAD_ID,
            messageId: MESSAGE_ID,
            createdAt: NOW,
          },
          readModel: makeReadModel(status, true),
        });
        const events = Array.isArray(result) ? result : [result];
        expect(events.map((event) => event.type)).toEqual([
          "thread.queued-message-released",
          "thread.message-sent",
          "thread.turn-start-requested",
        ]);
      }
    }),
  );
});
