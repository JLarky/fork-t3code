import { describe, expect, it } from "@effect/vitest";
import { Headers } from "effect/unstable/http";

import { pickSafeEmbedScriptHeaders, sayToMeEmbedVoiceWidgetUrl } from "./embedVoiceWidgetProxy.ts";

describe("Say To Me embed voice-widget proxy", () => {
  it("builds the fixed upstream liftSolid voice-widget script URL", () => {
    expect(sayToMeEmbedVoiceWidgetUrl("http://localhost:5411")).toBe(
      "http://localhost:5411/embed/voice-widget.js",
    );
    expect(sayToMeEmbedVoiceWidgetUrl("http://localhost:5411/")).toBe(
      "http://localhost:5411/embed/voice-widget.js",
    );
    expect(sayToMeEmbedVoiceWidgetUrl("https://say.local:1355")).toBe(
      "https://say.local:1355/embed/voice-widget.js",
    );
  });

  it("forwards only safe script/cache headers", () => {
    const picked = pickSafeEmbedScriptHeaders(
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
});
