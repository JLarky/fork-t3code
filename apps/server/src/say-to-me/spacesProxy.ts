import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import {
  HttpBody,
  HttpClient,
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
import {
  sayToMeBaseUrl,
  sayToMeCreateSessionUrl,
  sayToMeMessagesUrl,
  sayToMeVoiceSessionName,
} from "./voiceNotesProxy.ts";
import { parseVoiceNotesSessionId, voiceNotesSessionId } from "./voiceSessionId.ts";

const SPACES_LIST_ROUTE = "/api/t3-spaces";
const SPACES_CLAIM_ROUTE = "/api/t3-spaces/:spaceId/sessions";
const SPACES_RELEASE_ROUTE = "/api/t3-spaces/:spaceId/sessions/:environmentId/:threadId";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type NativeSpaceSession = {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly importedAt?: unknown;
  readonly archived?: unknown;
};

type NativeSpace = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly archived?: unknown;
  readonly sessions?: unknown;
};

type MappedSpaceSession = {
  readonly environmentId: string;
  readonly threadId: string;
  readonly sessionId: string;
  readonly spaceId: string;
  readonly title: string;
  readonly claimedAt: string;
};

type MappedSpace = {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly sessions: ReadonlyArray<MappedSpaceSession>;
};

const authenticateSpacesRequest = Effect.gen(function* () {
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

function sayToMeSpacesUrl(baseUrl: string): string {
  return new URL("/api/spaces", `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function sayToMeSpaceActionUrl(baseUrl: string, spaceId: string): string {
  return new URL(
    `/api/spaces/${encodeURIComponent(spaceId)}/action`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

function mapSpacesFromNative(body: unknown): MappedSpace[] {
  const root =
    typeof body === "object" && body !== null && "state" in body
      ? (body as { state?: { spaces?: unknown } }).state
      : body;
  const spaces =
    typeof root === "object" && root !== null && "spaces" in root
      ? (root as { spaces?: unknown }).spaces
      : null;
  if (!Array.isArray(spaces)) return [];

  return spaces.flatMap((space: NativeSpace) => {
    if (typeof space.id !== "string" || typeof space.name !== "string") return [];
    const spaceId = space.id;
    const sessions = Array.isArray(space.sessions) ? space.sessions : [];
    const mappedSessions: MappedSpaceSession[] = [];
    for (const raw of sessions as NativeSpaceSession[]) {
      if (typeof raw.id !== "string") continue;
      if (raw.archived === true) continue;
      const parsed = parseVoiceNotesSessionId(raw.id);
      if (!parsed) continue;
      mappedSessions.push({
        environmentId: parsed.environmentId,
        threadId: parsed.threadId,
        sessionId: raw.id,
        spaceId,
        title: typeof raw.title === "string" ? raw.title : parsed.threadId,
        claimedAt: typeof raw.importedAt === "string" ? raw.importedAt : "",
      });
    }
    return [
      {
        id: spaceId,
        name: space.name,
        archived: Boolean(space.archived),
        sessions: mappedSessions,
      },
    ];
  });
}

const authCatchTags = {
  EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
  EnvironmentInternalError: HttpServerRespondable.toResponse,
  EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
} as const;

export const t3SpacesListProxyRouteLayer = HttpRouter.add(
  "GET",
  SPACES_LIST_ROUTE,
  Effect.gen(function* () {
    yield* authenticateSpacesRequest;
    const httpClient = yield* HttpClient.HttpClient;
    const upstream = yield* httpClient.get(sayToMeSpacesUrl(sayToMeBaseUrl())).pipe(
      Effect.tapError((cause) => Effect.logWarning("Failed to load Say To Me spaces", { cause })),
      Effect.orElseSucceed(() => null),
    );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to load spaces", { status: 502 });
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return HttpServerResponse.text("Unable to load spaces", { status: 502 });
    }
    const body = yield* upstream.json.pipe(
      Effect.tapError((cause) => Effect.logWarning("Failed to decode Say To Me spaces", { cause })),
      Effect.orElseSucceed(() => null),
    );
    if (body === null) {
      return HttpServerResponse.text("Unable to load spaces", { status: 502 });
    }
    yield* annotateEnvironmentRequest("t3SpacesProxy");
    return HttpServerResponse.jsonUnsafe({ spaces: mapSpacesFromNative(body) });
  }).pipe(Effect.catchTags(authCatchTags)),
);

export const t3SpacesClaimProxyRouteLayer = HttpRouter.add(
  "POST",
  SPACES_CLAIM_ROUTE,
  Effect.gen(function* () {
    yield* authenticateSpacesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://localhost").pathname;
    const match = path.match(/^\/api\/t3-spaces\/([^/]+)\/sessions$/);
    const spaceId = decodeURIComponent(match?.[1] ?? "");
    if (!ID_PATTERN.test(spaceId)) {
      return HttpServerResponse.text("Invalid space id", { status: 400 });
    }

    const payload = yield* request.json.pipe(Effect.orElseSucceed(() => null));
    if (payload === null || typeof payload !== "object") {
      return HttpServerResponse.text("Invalid claim payload", { status: 400 });
    }
    const environmentId =
      "environmentId" in payload && typeof payload.environmentId === "string"
        ? payload.environmentId
        : "";
    const threadId =
      "threadId" in payload && typeof payload.threadId === "string" ? payload.threadId : "";
    if (!ID_PATTERN.test(environmentId) || !ID_PATTERN.test(threadId)) {
      return HttpServerResponse.text("environmentId and threadId are required", { status: 400 });
    }

    const sessionId = voiceNotesSessionId(environmentId, threadId);
    const httpClient = yield* HttpClient.HttpClient;
    const baseUrl = sayToMeBaseUrl();

    // Ensure the voice room exists before native claimSession (404 if missing).
    const existing = yield* httpClient
      .get(sayToMeMessagesUrl(baseUrl, sessionId))
      .pipe(Effect.orElseSucceed(() => null));
    if (existing === null) {
      return HttpServerResponse.text("Unable to claim session", { status: 502 });
    }
    if (existing.status === 404) {
      const created = yield* httpClient
        .post(sayToMeCreateSessionUrl(baseUrl), {
          body: HttpBody.jsonUnsafe({
            provider: "voice",
            name: sayToMeVoiceSessionName(sessionId),
          }),
        })
        .pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to create voice room before space claim", {
              cause,
              sessionId,
              spaceId,
            }),
          ),
          Effect.orElseSucceed(() => null),
        );
      if (created === null || created.status < 200 || created.status >= 300) {
        return HttpServerResponse.text("Unable to create voice session", { status: 502 });
      }
      const createdBody = yield* created.json.pipe(Effect.orElseSucceed(() => null));
      const createdId =
        typeof createdBody === "object" &&
        createdBody !== null &&
        "session" in createdBody &&
        typeof (createdBody as { session?: { id?: unknown } }).session?.id === "string"
          ? (createdBody as { session: { id: string } }).session.id
          : null;
      if (createdId !== sessionId) {
        return HttpServerResponse.text("Created Say To Me session id did not match", {
          status: 502,
        });
      }
    } else if (existing.status < 200 || existing.status >= 300) {
      return HttpServerResponse.text("Unable to claim session", { status: 502 });
    }

    const upstream = yield* httpClient
      .post(sayToMeSpaceActionUrl(baseUrl, spaceId), {
        body: HttpBody.jsonUnsafe({ action: "claimSession", sessionId }),
      })
      .pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to claim voice session into space", {
            cause,
            sessionId,
            spaceId,
          }),
        ),
        Effect.orElseSucceed(() => null),
      );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to claim session", { status: 502 });
    }
    const body = yield* upstream.json.pipe(Effect.orElseSucceed(() => null));
    if (upstream.status < 200 || upstream.status >= 300) {
      const error =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : "Unable to claim session";
      return HttpServerResponse.jsonUnsafe({ error }, { status: upstream.status });
    }
    if (body === null) {
      return HttpServerResponse.text("Unable to claim session", { status: 502 });
    }

    const spaces = mapSpacesFromNative(body);
    const claimed =
      spaces
        .find((space) => space.id === spaceId)
        ?.sessions.find((session) => session.sessionId === sessionId) ?? null;

    yield* annotateEnvironmentRequest("t3SpacesProxy");
    return HttpServerResponse.jsonUnsafe({
      session: claimed ?? {
        environmentId,
        threadId,
        sessionId,
        spaceId,
        title: threadId,
        claimedAt: "",
      },
      spaces,
    });
  }).pipe(Effect.catchTags(authCatchTags)),
);

export const t3SpacesReleaseProxyRouteLayer = HttpRouter.add(
  "DELETE",
  SPACES_RELEASE_ROUTE,
  Effect.gen(function* () {
    yield* authenticateSpacesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://localhost").pathname;
    const match = path.match(/^\/api\/t3-spaces\/([^/]+)\/sessions\/([^/]+)\/([^/]+)$/);
    const spaceId = decodeURIComponent(match?.[1] ?? "");
    const environmentId = decodeURIComponent(match?.[2] ?? "");
    const threadId = decodeURIComponent(match?.[3] ?? "");
    if (
      !ID_PATTERN.test(spaceId) ||
      !ID_PATTERN.test(environmentId) ||
      !ID_PATTERN.test(threadId)
    ) {
      return HttpServerResponse.text("Invalid session reference", { status: 400 });
    }

    const sessionId = voiceNotesSessionId(environmentId, threadId);
    const httpClient = yield* HttpClient.HttpClient;
    const upstream = yield* httpClient
      .post(sayToMeSpaceActionUrl(sayToMeBaseUrl(), spaceId), {
        body: HttpBody.jsonUnsafe({ action: "releaseSession", sessionId }),
      })
      .pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to release voice session from space", {
            cause,
            environmentId,
            sessionId,
            spaceId,
            threadId,
          }),
        ),
        Effect.orElseSucceed(() => null),
      );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to release session", { status: 502 });
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      const body = yield* upstream.json.pipe(Effect.orElseSucceed(() => null));
      const error =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : "Unable to release session";
      return HttpServerResponse.jsonUnsafe({ error }, { status: upstream.status });
    }

    yield* annotateEnvironmentRequest("t3SpacesProxy");
    return HttpServerResponse.empty({ status: 204 });
  }).pipe(Effect.catchTags(authCatchTags)),
);
