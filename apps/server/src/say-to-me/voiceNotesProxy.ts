import * as NodePath from "node:path";

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
import * as ServerConfig from "../config.ts";

const VOICE_NOTES_ROUTE = "/api/voice-notes/*";
const VOICE_NOTE_CREATE_ROUTE = "/api/voice-notes/:sessionId";
const VOICE_NOTE_STATUS_ROUTE = "/api/voice-notes/:sessionId/messages/:messageId/status";
const VOICE_NOTES_EVENTS_ROUTE = "/api/voice-notes/:sessionId/events";
const SAY_TO_ME_TIMERS_ROUTE = "/api/say-to-me-timers";
const SAY_TO_ME_TIMER_ROUTE = "/api/say-to-me-timers/:timerId";
const SAY_TO_ME_TIMER_ACTION_ROUTE = "/api/say-to-me-timers/:timerId/actions";
const DEFAULT_SAY_TO_ME_URL = "https://say.local:1355";
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MESSAGE_ID_PATTERN = /^[0-9]+$/;
const MESSAGE_STATUS_PATTERN = /^(queued|speaking|played|stopped)$/;
const TIMER_ID_PATTERN = /^[0-9]+$/;

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

export function sayToMeSettingsUrl(baseUrl: string): string {
  return new URL("/api/settings", `${baseUrl.replace(/\/$/, "")}/`).toString();
}

export function sayToMeTimersUrl(baseUrl: string, sessionId?: string): string {
  const url = new URL("/api/jarvis-timers", `${baseUrl.replace(/\/$/, "")}/`);
  if (sessionId) url.searchParams.set("sessionId", sessionId);
  return url.toString();
}

export function sayToMeTimerUrl(baseUrl: string, timerId: string): string {
  return new URL(
    `/api/jarvis-timers/${encodeURIComponent(timerId)}`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

export function sayToMeTimerActionUrl(baseUrl: string, timerId: string): string {
  return new URL(
    `/api/jarvis-timers/${encodeURIComponent(timerId)}/actions`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

export function sayToMeImportSessionUrl(baseUrl: string, sessionId: string): string {
  return new URL(
    `/api/sessions/${encodeURIComponent(sessionId)}/import`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

/** Say To Me slugifies `name` into `vo_<slug>`, so strip a leading `vo_`. */
export function sayToMeVoiceSessionName(sessionId: string): string {
  return sessionId.startsWith("vo_") ? sessionId.slice(3) : sessionId;
}

type PublicT3ServerInstanceSettings = {
  readonly id: string;
  readonly binPath?: string;
  readonly baseDir: string;
  readonly originUrl: string;
  readonly isDev: boolean;
};

type T3ServerInstanceSettings = PublicT3ServerInstanceSettings & {
  readonly binPath: string;
};

function t3CheckoutPath(cwd: string): string {
  const absoluteCwd = NodePath.resolve(cwd);
  return NodePath.basename(absoluteCwd) === "server" &&
    NodePath.basename(NodePath.dirname(absoluteCwd)) === "apps"
    ? NodePath.resolve(absoluteCwd, "../..")
    : absoluteCwd;
}

function currentT3ServerInstanceSettings(
  config: ServerConfig.ServerConfig["Service"],
): T3ServerInstanceSettings {
  const originUrl = config.devUrl?.toString() || process.env.VITE_HTTP_URL || "";
  return {
    id: `t3-${config.devUrl?.port ?? config.port}`,
    binPath: t3CheckoutPath(config.cwd),
    baseDir: config.baseDir,
    originUrl,
    isDev: config.devUrl !== undefined,
  };
}

function publicT3ServerInstances(body: unknown): PublicT3ServerInstanceSettings[] | null {
  if (typeof body !== "object" || body === null || !("t3ServerInstances" in body)) return null;
  const instances = (body as { t3ServerInstances?: unknown }).t3ServerInstances;
  if (!Array.isArray(instances)) return null;
  return instances.filter(
    (instance): instance is T3ServerInstanceSettings =>
      typeof instance === "object" &&
      instance !== null &&
      typeof (instance as PublicT3ServerInstanceSettings).id === "string" &&
      (typeof (instance as PublicT3ServerInstanceSettings).binPath === "string" ||
        typeof (instance as PublicT3ServerInstanceSettings).binPath === "undefined") &&
      typeof (instance as PublicT3ServerInstanceSettings).baseDir === "string" &&
      typeof (instance as PublicT3ServerInstanceSettings).originUrl === "string" &&
      typeof (instance as PublicT3ServerInstanceSettings).isDev === "boolean",
  );
}

function sameT3ServerInstance(
  left: PublicT3ServerInstanceSettings,
  right: T3ServerInstanceSettings,
): boolean {
  return (
    left.id === right.id &&
    (left.binPath ?? "") === right.binPath &&
    left.baseDir === right.baseDir &&
    left.originUrl === right.originUrl &&
    left.isDev === right.isDev
  );
}

function ensureT3ServerInstance(
  httpClient: HttpClient.HttpClient,
  baseUrl: string,
  instance: T3ServerInstanceSettings,
): Effect.Effect<void, unknown> {
  const settingsUrl = sayToMeSettingsUrl(baseUrl);
  return Effect.gen(function* () {
    const currentResponse = yield* httpClient.get(settingsUrl).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((response) => response.json),
    );
    const currentInstances = publicT3ServerInstances(currentResponse);
    if (currentInstances === null) {
      return yield* Effect.fail(new Error("Say To Me returned invalid T3 instance settings."));
    }

    const existing = currentInstances.find((candidate) => candidate.id === instance.id);
    if (existing && sameT3ServerInstance(existing, instance)) return;

    const nextInstances = currentInstances.filter((candidate) => candidate.id !== instance.id);
    nextInstances.push(instance);
    yield* httpClient
      .patch(settingsUrl, { body: HttpBody.jsonUnsafe({ t3ServerInstances: nextInstances }) })
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
  });
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
    const serverConfig = yield* ServerConfig.ServerConfig;
    yield* ensureT3ServerInstance(
      httpClient,
      sayToMeBaseUrl(),
      currentT3ServerInstanceSettings(serverConfig),
    ).pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("Failed to ensure Say To Me T3 instance", { cause, sessionId }),
      ),
      Effect.orElseSucceed(() => undefined),
    );
    // T3 sessions are imported through Say To Me's T3 backend. That verifies
    // the thread against configured T3 instances, creates the Say To Me row
    // when it is missing, and records the matching t3InstanceId/cwd.
    const response = yield* httpClient
      .post(sayToMeImportSessionUrl(sayToMeBaseUrl(), sessionId))
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((upstream) => upstream.json),
        Effect.map((body) => HttpServerResponse.jsonUnsafe(body)),
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to import T3 session into Say To Me", {
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

const timerProxyCatchTags = {
  EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
  EnvironmentInternalError: HttpServerRespondable.toResponse,
  EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
} as const;

function timerIdFromRequest(request: HttpServerRequest.HttpServerRequest): string {
  const path = new URL(request.url, "http://localhost").pathname;
  const match = path.match(/^\/api\/say-to-me-timers\/([^/]+)(?:\/actions)?$/);
  return match?.[1] ?? "";
}

export const sayToMeTimersListProxyRouteLayer = HttpRouter.add(
  "GET",
  SAY_TO_ME_TIMERS_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://localhost");
    const sessionId = url.searchParams.get("sessionId") ?? "";
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return HttpServerResponse.text("Invalid timer session id", { status: 400 });
    }
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient.get(sayToMeTimersUrl(sayToMeBaseUrl(), sessionId)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((upstream) => upstream.json),
      Effect.map((body) => HttpServerResponse.jsonUnsafe(body)),
      Effect.orElseSucceed(() => HttpServerResponse.text("Unable to load timers", { status: 502 })),
    );
    yield* annotateEnvironmentRequest("sayToMeTimersProxy");
    return response;
  }).pipe(Effect.catchTags(timerProxyCatchTags)),
);

export const sayToMeTimersCreateProxyRouteLayer = HttpRouter.add(
  "POST",
  SAY_TO_ME_TIMERS_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* request.json) as { readonly sessionId?: unknown };
    if (typeof body.sessionId !== "string" || !SESSION_ID_PATTERN.test(body.sessionId)) {
      return HttpServerResponse.text("Invalid timer session id", { status: 400 });
    }
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient
      .post(sayToMeTimersUrl(sayToMeBaseUrl()), { body: HttpBody.jsonUnsafe(body) })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((upstream) => upstream.json),
        Effect.map((body) => HttpServerResponse.jsonUnsafe(body)),
        Effect.orElseSucceed(() =>
          HttpServerResponse.text("Unable to create timer", { status: 502 }),
        ),
      );
    yield* annotateEnvironmentRequest("sayToMeTimersProxy");
    return response;
  }).pipe(Effect.catchTags(timerProxyCatchTags)),
);

export const sayToMeTimerUpdateProxyRouteLayer = HttpRouter.add(
  "PATCH",
  SAY_TO_ME_TIMER_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const timerId = timerIdFromRequest(request);
    if (!TIMER_ID_PATTERN.test(timerId))
      return HttpServerResponse.text("Invalid timer id", { status: 400 });
    const body = yield* request.json;
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient
      .patch(sayToMeTimerUrl(sayToMeBaseUrl(), timerId), { body: HttpBody.jsonUnsafe(body) })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((upstream) => upstream.json),
        Effect.map((body) => HttpServerResponse.jsonUnsafe(body)),
        Effect.orElseSucceed(() =>
          HttpServerResponse.text("Unable to update timer", { status: 502 }),
        ),
      );
    yield* annotateEnvironmentRequest("sayToMeTimersProxy");
    return response;
  }).pipe(Effect.catchTags(timerProxyCatchTags)),
);

export const sayToMeTimerActionProxyRouteLayer = HttpRouter.add(
  "POST",
  SAY_TO_ME_TIMER_ACTION_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const timerId = timerIdFromRequest(request);
    if (!TIMER_ID_PATTERN.test(timerId))
      return HttpServerResponse.text("Invalid timer id", { status: 400 });
    const body = yield* request.json;
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient
      .post(sayToMeTimerActionUrl(sayToMeBaseUrl(), timerId), { body: HttpBody.jsonUnsafe(body) })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((upstream) => upstream.json),
        Effect.map((body) => HttpServerResponse.jsonUnsafe(body)),
        Effect.orElseSucceed(() =>
          HttpServerResponse.text("Unable to act on timer", { status: 502 }),
        ),
      );
    yield* annotateEnvironmentRequest("sayToMeTimersProxy");
    return response;
  }).pipe(Effect.catchTags(timerProxyCatchTags)),
);

export const sayToMeTimerDeleteProxyRouteLayer = HttpRouter.add(
  "DELETE",
  SAY_TO_ME_TIMER_ROUTE,
  Effect.gen(function* () {
    yield* authenticateVoiceNotesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const timerId = timerIdFromRequest(request);
    if (!TIMER_ID_PATTERN.test(timerId))
      return HttpServerResponse.text("Invalid timer id", { status: 400 });
    const httpClient = yield* HttpClient.HttpClient;
    const response = yield* httpClient.del(sayToMeTimerUrl(sayToMeBaseUrl(), timerId)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap((upstream) => upstream.json),
      Effect.map((body) => HttpServerResponse.jsonUnsafe(body)),
      Effect.orElseSucceed(() =>
        HttpServerResponse.text("Unable to delete timer", { status: 502 }),
      ),
    );
    yield* annotateEnvironmentRequest("sayToMeTimersProxy");
    return response;
  }).pipe(Effect.catchTags(timerProxyCatchTags)),
);
