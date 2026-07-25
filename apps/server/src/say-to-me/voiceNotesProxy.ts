import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import {
  HttpClient,
  HttpClientResponse,
  HttpBody,
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/unstable/http";

import {
  annotateEnvironmentRequest,
  failEnvironmentAuthInvalid,
  failEnvironmentInternal,
  failEnvironmentScopeRequired,
} from "../auth/http.ts";
import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";

const VOICE_NOTES_ROUTE = "/api/voice-notes/*";
const VOICE_NOTE_CREATE_ROUTE = "/api/voice-notes/:sessionId";
const VOICE_NOTE_STATUS_ROUTE = "/api/voice-notes/:sessionId/messages/:messageId/status";
const VOICE_NOTES_EVENTS_ROUTE = "/api/voice-notes/:sessionId/events";
const DEFAULT_SAY_TO_ME_URL = "https://say.local:1355";
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MESSAGE_ID_PATTERN = /^[0-9]+$/;
const MESSAGE_STATUS_PATTERN = /^(queued|speaking|played|stopped)$/;

const authenticateVoiceNotesRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
  const session = yield* serverAuth.authenticateHttpRequest(request).pipe(
    Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
      failEnvironmentAuthInvalid(EnvironmentAuth.serverAuthCredentialReason(error)),
    ),
    Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
      failEnvironmentInternal("internal_error", error),
    ),
  );
  if (!session.scopes.includes(AuthOrchestrationReadScope)) {
    return yield* failEnvironmentScopeRequired(AuthOrchestrationReadScope);
  }
});

export function sayToMeBaseUrl(): string {
  return process.env.T3CODE_SAY_TO_ME_URL?.trim() || DEFAULT_SAY_TO_ME_URL;
}

export function sayToMeMessagesUrl(baseUrl: string, sessionId: string): string {
  return new URL(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

export function sayToMeMessageStatusUrl(baseUrl: string, messageId: string): string {
  return new URL(
    `/api/messages/${encodeURIComponent(messageId)}/status`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

export function sayToMeEventsUrl(baseUrl: string, sessionId: string): string {
  return new URL(
    `/api/sessions/${encodeURIComponent(sessionId)}/events`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

export function sayToMeCreateSessionUrl(baseUrl: string): string {
  return new URL("/api/cli-sessions", `${baseUrl.replace(/\/$/, "")}/`).toString();
}

/** Say To Me slugifies `name` into `vo_<slug>`, so strip a leading `vo_`. */
export function sayToMeVoiceSessionName(sessionId: string): string {
  return sessionId.startsWith("vo_") ? sessionId.slice(3) : sessionId;
}

export const voiceNotesProxyRouteLayer = HttpRouter.add(
  "GET",
  VOICE_NOTES_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://localhost").pathname;
    const sessionId = path.slice("/api/voice-notes/".length);
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return HttpServerResponse.text("Invalid voice session id", { status: 400 });
    }

    const httpClient = yield* HttpClient.HttpClient;
    const upstream = yield* httpClient.get(sayToMeMessagesUrl(sayToMeBaseUrl(), sessionId)).pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("Failed to load Say To Me voice notes", { cause, sessionId }),
      ),
      Effect.orElseSucceed(() => null),
    );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to load voice notes", { status: 502 });
    }
    if (upstream.status === 404) {
      yield* annotateEnvironmentRequest("voiceNotesProxy");
      return HttpServerResponse.jsonUnsafe({ error: "Session not found." }, { status: 404 });
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return HttpServerResponse.text("Unable to load voice notes", { status: 502 });
    }

    const body = yield* upstream.json.pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("Failed to decode Say To Me voice notes", { cause, sessionId }),
      ),
      Effect.orElseSucceed(() => null),
    );
    if (body === null) {
      return HttpServerResponse.text("Unable to load voice notes", { status: 502 });
    }

    yield* annotateEnvironmentRequest("voiceNotesProxy");
    return HttpServerResponse.jsonUnsafe(body);
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
  ),
);

export const voiceNoteCreateProxyRouteLayer = HttpRouter.add(
  "POST",
  VOICE_NOTE_CREATE_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://localhost").pathname;
    const match = path.match(/^\/api\/voice-notes\/([^/]+)$/);
    const sessionId = match?.[1] ?? "";
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return HttpServerResponse.text("Invalid voice session id", { status: 400 });
    }

    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient
      .post(sayToMeCreateSessionUrl(sayToMeBaseUrl()), {
        body: HttpBody.jsonUnsafe({
          provider: "voice",
          name: sayToMeVoiceSessionName(sessionId),
        }),
      })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((upstream) => upstream.json),
        Effect.flatMap((body) => {
          const createdId =
            typeof body === "object" &&
            body !== null &&
            "session" in body &&
            typeof (body as { session?: { id?: unknown } }).session?.id === "string"
              ? (body as { session: { id: string } }).session.id
              : null;
          if (createdId !== sessionId) {
            return Effect.succeed(
              HttpServerResponse.text("Created Say To Me session id did not match", {
                status: 502,
              }),
            );
          }
          return Effect.succeed(HttpServerResponse.jsonUnsafe(body));
        }),
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to create Say To Me voice session", {
            cause,
            sessionId,
          }),
        ),
        Effect.orElseSucceed(() =>
          HttpServerResponse.text("Unable to create voice session", { status: 502 }),
        ),
      );

    yield* annotateEnvironmentRequest("voiceNoteCreateProxy");
    return response;
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
  ),
);

export const voiceNoteStatusProxyRouteLayer = HttpRouter.add(
  "POST",
  VOICE_NOTE_STATUS_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://localhost").pathname;
    const match = path.match(/^\/api\/voice-notes\/[^/]+\/messages\/([^/]+)\/status$/);
    const messageId = match?.[1] ?? "";
    const body = (yield* request.json) as { readonly status?: unknown };
    if (!MESSAGE_ID_PATTERN.test(messageId) || typeof body.status !== "string") {
      return HttpServerResponse.text("Invalid voice message status", { status: 400 });
    }
    if (!MESSAGE_STATUS_PATTERN.test(body.status)) {
      return HttpServerResponse.text("Invalid voice message status", { status: 400 });
    }

    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient
      .post(sayToMeMessageStatusUrl(sayToMeBaseUrl(), messageId), {
        body: HttpBody.jsonUnsafe({ status: body.status }),
      })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((upstream) => upstream.json),
        Effect.map((body) => HttpServerResponse.jsonUnsafe(body)),
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to update Say To Me voice note status", {
            cause,
            messageId,
          }),
        ),
        Effect.orElseSucceed(() =>
          HttpServerResponse.text("Unable to update voice note status", { status: 502 }),
        ),
      );

    yield* annotateEnvironmentRequest("voiceNoteStatusProxy");
    return response;
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
  ),
);

export const voiceNotesEventsProxyRouteLayer = HttpRouter.add(
  "GET",
  VOICE_NOTES_EVENTS_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://localhost").pathname;
    const match = path.match(/^\/api\/voice-notes\/([^/]+)\/events$/);
    const sessionId = match?.[1] ?? "";
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return HttpServerResponse.text("Invalid voice session id", { status: 400 });
    }

    const httpClient = yield* HttpClient.HttpClient;
    const upstream = yield* httpClient
      .get(sayToMeEventsUrl(sayToMeBaseUrl(), sessionId))
      .pipe(Effect.orElseSucceed(() => null));
    if (upstream === null) {
      return HttpServerResponse.text("Unable to open voice notes stream", { status: 502 });
    }
    if (upstream.status === 404) {
      yield* annotateEnvironmentRequest("voiceNotesEventsProxy");
      return HttpServerResponse.jsonUnsafe({ error: "Session not found." }, { status: 404 });
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return HttpServerResponse.text("Unable to open voice notes stream", { status: 502 });
    }

    yield* annotateEnvironmentRequest("voiceNotesEventsProxy");
    return HttpServerResponse.stream(HttpClientResponse.stream(Effect.succeed(upstream)), {
      contentType: "text/event-stream",
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }).pipe(
    Effect.catchTags({
      EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
      EnvironmentInternalError: HttpServerRespondable.toResponse,
      EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
    }),
  ),
);
