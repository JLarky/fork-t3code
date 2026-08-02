import { AuthOrchestrationReadScope, AuthSessionId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  Headers,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
  HttpServerRequest,
} from "effect/unstable/http";
import { vi } from "vite-plus/test";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import {
  pickSafeWidgetScriptHeaders,
  sayToMeEmbedWidgetProxyRouteLayer,
  sayToMeEmbedWidgetUrl,
} from "./widgetProxy.ts";

describe("Say To Me widget proxy", () => {
  it("builds the fixed upstream widget script URL", () => {
    expect(sayToMeEmbedWidgetUrl("http://localhost:5411")).toBe(
      "http://localhost:5411/embed/widget.js",
    );
    expect(sayToMeEmbedWidgetUrl("http://localhost:5411/")).toBe(
      "http://localhost:5411/embed/widget.js",
    );
    expect(sayToMeEmbedWidgetUrl("https://say.local:1355")).toBe(
      "https://say.local:1355/embed/widget.js",
    );
  });

  it("forwards only safe script/cache headers", () => {
    const picked = pickSafeWidgetScriptHeaders(
      Headers.fromInput({
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'",
        "set-cookie": "secret=1",
        location: "https://evil.example/",
        "x-powered-by": "say-to-me",
      }),
    );

    expect(picked).toEqual({
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    expect(picked).not.toHaveProperty("content-security-policy");
    expect(picked).not.toHaveProperty("set-cookie");
    expect(picked).not.toHaveProperty("location");
    expect(picked).not.toHaveProperty("x-powered-by");
  });

  it.effect("authenticates before contacting the fixed upstream", () =>
    Effect.gen(function* () {
      const authenticateHttpRequest = vi.fn(() =>
        Effect.fail(new EnvironmentAuth.ServerAuthMissingCredentialError({})),
      );
      const upstreamRequest = vi.fn(() => Effect.die("upstream must not be called"));
      const httpEffect = yield* HttpRouter.toHttpEffect(sayToMeEmbedWidgetProxyRouteLayer);
      const request = HttpServerRequest.fromWeb(
        new Request("https://t3.example/api/say-to-me/embed/widget.js"),
      );
      const response = yield* httpEffect.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provide(Layer.mock(EnvironmentAuth.EnvironmentAuth)({ authenticateHttpRequest })),
        Effect.provideService(HttpClient.HttpClient, HttpClient.make(upstreamRequest)),
      );

      expect(response.status).toBe(401);
      expect(authenticateHttpRequest).toHaveBeenCalledOnce();
      expect(upstreamRequest).not.toHaveBeenCalled();
    }).pipe(Effect.scoped),
  );

  it.effect("proxies the authenticated route to the fixed target with safe headers", () =>
    Effect.gen(function* () {
      const previousUrl = process.env.T3CODE_SAY_TO_ME_URL;
      process.env.T3CODE_SAY_TO_ME_URL = "https://stm.example/base/ignored";
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (previousUrl === undefined) delete process.env.T3CODE_SAY_TO_ME_URL;
          else process.env.T3CODE_SAY_TO_ME_URL = previousUrl;
        }),
      );

      const authenticateHttpRequest = vi.fn(() =>
        Effect.succeed({
          sessionId: AuthSessionId.make("session-1"),
          subject: "test",
          method: "bearer-access-token",
          scopes: [AuthOrchestrationReadScope],
        } satisfies EnvironmentAuth.AuthenticatedSession),
      );
      const upstreamRequests: Array<string> = [];
      const httpClient = HttpClient.make((request) =>
        Effect.sync(() => {
          upstreamRequests.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              "customElements.define('say-to-me-widget', class extends HTMLElement {})",
              {
                status: 200,
                headers: {
                  "content-type": "text/javascript; charset=utf-8",
                  "cache-control": "public, max-age=60",
                  "content-security-policy": "default-src 'none'",
                  "set-cookie": "secret=1",
                  location: "https://evil.example/",
                  "x-powered-by": "say-to-me",
                },
              },
            ),
          );
        }),
      );
      const httpEffect = yield* HttpRouter.toHttpEffect(sayToMeEmbedWidgetProxyRouteLayer);
      const request = HttpServerRequest.fromWeb(
        new Request("https://t3.example/api/say-to-me/embed/widget.js?target=evil", {
          headers: { authorization: "Bearer test-token" },
        }),
      );
      const response = yield* httpEffect.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provide(Layer.mock(EnvironmentAuth.EnvironmentAuth)({ authenticateHttpRequest })),
        Effect.provideService(HttpClient.HttpClient, httpClient),
      );

      expect(response.status).toBe(200);
      expect(authenticateHttpRequest).toHaveBeenCalledOnce();
      expect(upstreamRequests).toEqual(["https://stm.example/embed/widget.js"]);
      expect(response.headers["content-type"]).toBe("text/javascript; charset=utf-8");
      expect(response.headers["cache-control"]).toBe("public, max-age=60");
      expect(response.headers["content-security-policy"]).toBeUndefined();
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.headers.location).toBeUndefined();
      expect(response.headers["x-powered-by"]).toBeUndefined();
    }).pipe(Effect.scoped),
  );
});
