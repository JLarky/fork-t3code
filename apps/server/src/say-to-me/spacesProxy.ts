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
import { sayToMeBaseUrl } from "./voiceNotesProxy.ts";

const SPACES_LIST_ROUTE = "/api/t3-spaces";
const SPACES_CLAIM_ROUTE = "/api/t3-spaces/:spaceId/sessions";
const SPACES_RELEASE_ROUTE = "/api/t3-spaces/sessions/:environmentId/:threadId";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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

function sayToMeT3SpacesUrl(baseUrl: string): string {
  return new URL("/api/t3-spaces", `${baseUrl.replace(/\/$/, "")}/`).toString();
}

function sayToMeClaimUrl(baseUrl: string, spaceId: string): string {
  return new URL(
    `/api/t3-spaces/${encodeURIComponent(spaceId)}/sessions`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

function sayToMeReleaseUrl(baseUrl: string, environmentId: string, threadId: string): string {
  return new URL(
    `/api/t3-spaces/sessions/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`,
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
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
    const upstream = yield* httpClient.get(sayToMeT3SpacesUrl(sayToMeBaseUrl())).pipe(
      Effect.tapError((cause) => Effect.logWarning("Failed to load T3 spaces", { cause })),
      Effect.orElseSucceed(() => null),
    );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to load spaces", { status: 502 });
    }
    const body = yield* upstream.json.pipe(
      Effect.tapError((cause) => Effect.logWarning("Failed to decode T3 spaces", { cause })),
      Effect.orElseSucceed(() => null),
    );
    if (body === null) {
      return HttpServerResponse.text("Unable to load spaces", { status: 502 });
    }
    yield* annotateEnvironmentRequest("t3SpacesProxy");
    return HttpServerResponse.jsonUnsafe(body, { status: upstream.status });
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

    const httpClient = yield* HttpClient.HttpClient;
    const upstream = yield* httpClient
      .post(sayToMeClaimUrl(sayToMeBaseUrl(), spaceId), {
        body: HttpBody.jsonUnsafe(payload),
      })
      .pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to claim T3 session into space", { cause, spaceId }),
        ),
        Effect.orElseSucceed(() => null),
      );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to claim session", { status: 502 });
    }
    const body = yield* upstream.json.pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("Failed to decode claim response", { cause, spaceId }),
      ),
      Effect.orElseSucceed(() => null),
    );
    if (body === null) {
      return HttpServerResponse.text("Unable to claim session", { status: 502 });
    }
    yield* annotateEnvironmentRequest("t3SpacesProxy");
    return HttpServerResponse.jsonUnsafe(body, { status: upstream.status });
  }).pipe(Effect.catchTags(authCatchTags)),
);

export const t3SpacesReleaseProxyRouteLayer = HttpRouter.add(
  "DELETE",
  SPACES_RELEASE_ROUTE,
  Effect.gen(function* () {
    yield* authenticateSpacesRequest;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://localhost").pathname;
    const match = path.match(/^\/api\/t3-spaces\/sessions\/([^/]+)\/([^/]+)$/);
    const environmentId = decodeURIComponent(match?.[1] ?? "");
    const threadId = decodeURIComponent(match?.[2] ?? "");
    if (!ID_PATTERN.test(environmentId) || !ID_PATTERN.test(threadId)) {
      return HttpServerResponse.text("Invalid session reference", { status: 400 });
    }

    const httpClient = yield* HttpClient.HttpClient;
    const upstream = yield* httpClient
      .del(sayToMeReleaseUrl(sayToMeBaseUrl(), environmentId, threadId))
      .pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("Failed to release T3 session from space", {
            cause,
            environmentId,
            threadId,
          }),
        ),
        Effect.orElseSucceed(() => null),
      );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to release session", { status: 502 });
    }
    if (upstream.status === 204) {
      yield* annotateEnvironmentRequest("t3SpacesProxy");
      return HttpServerResponse.empty({ status: 204 });
    }
    const body = yield* upstream.json.pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("Failed to decode release response", {
          cause,
          environmentId,
          threadId,
        }),
      ),
      Effect.orElseSucceed(() => null),
    );
    if (body === null) {
      return HttpServerResponse.text("Unable to release session", { status: 502 });
    }
    yield* annotateEnvironmentRequest("t3SpacesProxy");
    return HttpServerResponse.jsonUnsafe(body, { status: upstream.status });
  }).pipe(Effect.catchTags(authCatchTags)),
);
