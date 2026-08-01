import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  Headers,
  HttpClient,
  HttpClientResponse,
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

/** Fixed same-origin route. Intentionally not parameterized — not an open proxy. */
const EMBED_VOICE_WIDGET_ROUTE = "/api/say-to-me/embed/voice-widget.js";
const EMBED_VOICE_WIDGET_UPSTREAM_PATH = "/embed/voice-widget.js";

/** Safe script/cache headers to forward from the fixed upstream classic script. */
const SAFE_SCRIPT_HEADER_NAMES = ["content-type", "cache-control"] as const;

const authenticateEmbedVoiceWidgetRequest = Effect.gen(function* () {
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

const embedVoiceWidgetProxyCatchTags = {
  EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
  EnvironmentInternalError: HttpServerRespondable.toResponse,
  EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
} as const;

function pickNamedHeaders(
  headers: Headers.Headers,
  names: ReadonlyArray<string>,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = Option.getOrUndefined(Headers.get(headers, name));
    if (value !== undefined) {
      picked[name] = value;
    }
  }
  return picked;
}

/** Builds the exact Say To Me liftSolid voice-widget script URL. Path is fixed. */
export function sayToMeEmbedVoiceWidgetUrl(baseUrl: string): string {
  return new URL(EMBED_VOICE_WIDGET_UPSTREAM_PATH, `${baseUrl.replace(/\/$/, "")}/`).toString();
}

export function pickSafeEmbedScriptHeaders(headers: Headers.Headers): Record<string, string> {
  return pickNamedHeaders(headers, SAFE_SCRIPT_HEADER_NAMES);
}

export const sayToMeEmbedVoiceWidgetProxyRouteLayer = HttpRouter.add(
  "GET",
  EMBED_VOICE_WIDGET_ROUTE,
  Effect.gen(function* () {
    yield* authenticateEmbedVoiceWidgetRequest;

    const httpClient = yield* HttpClient.HttpClient;
    const upstream = yield* httpClient.get(sayToMeEmbedVoiceWidgetUrl(sayToMeBaseUrl())).pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("Failed to load sayToMeEmbedVoiceWidgetProxy", { cause }),
      ),
      Effect.orElseSucceed(() => null),
    );
    if (upstream === null) {
      return HttpServerResponse.text("Unable to load embed voice widget", { status: 502 });
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      return HttpServerResponse.text("Unable to load embed voice widget", { status: 502 });
    }

    const safeHeaders = pickSafeEmbedScriptHeaders(upstream.headers);
    const contentType = safeHeaders["content-type"] ?? "text/javascript; charset=utf-8";

    yield* annotateEnvironmentRequest("sayToMeEmbedVoiceWidgetProxy");
    return HttpServerResponse.stream(HttpClientResponse.stream(Effect.succeed(upstream)), {
      status: upstream.status,
      contentType,
      headers: safeHeaders,
    });
  }).pipe(Effect.catchTags(embedVoiceWidgetProxyCatchTags)),
);
