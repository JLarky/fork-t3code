import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { HostedSayToMeVoiceWidget } from "./HostedSayToMeVoiceWidget";
import { SAY_TO_ME_UI_URL } from "./sayToMeUi";
import {
  SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY,
  SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL,
  SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL,
  SAY_TO_ME_VOICE_WIDGET_SRC,
} from "./voiceWidget";

const ENVIRONMENT_ID = "3bae4963-5d72-4221-835b-66e2770e72d0";
const THREAD_ID = "2572d5ed-a15b-487f-8102-71a350b357ed";
const SESSION_ID = `t3_${THREAD_ID}`;

describe("HostedSayToMeVoiceWidget", () => {
  it("renders the empty liftSolid host with Contract v1 attributes", () => {
    const markup = renderToStaticMarkup(
      <HostedSayToMeVoiceWidget
        environmentId={ENVIRONMENT_ID}
        threadId={THREAD_ID}
        loader={{ mode: "classic", scriptSrc: SAY_TO_ME_VOICE_WIDGET_SRC }}
      />,
    );

    expect(markup).toContain('data-testid="say-to-me-voice-widget-host"');
    expect(markup).toContain('data-testid="say-to-me-voice-widget-element"');
    expect(markup).toContain("say-to-me-voice-widget");
    expect(markup).toContain(`session-id="${SESSION_ID}"`);
    expect(markup).toContain(`notes-base-url="${SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL}"`);
    expect(markup).toMatch(/can-autoplay="[01]"/);
    expect(markup).not.toContain('can-autoplay="true"');
    expect(markup).not.toContain('can-autoplay="false"');
    expect(markup).toContain(`storage-key="${SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY}"`);
    expect(markup).toContain(`ui-base-url="${SAY_TO_ME_UI_URL}"`);
    expect(markup).toContain('data-testid="say-to-me-voice-widget-script"');
    expect(markup).toContain(`src="${SAY_TO_ME_VOICE_WIDGET_SRC}"`);
    expect(markup).not.toContain('data-testid="say-to-me-voice-widget-s1-limitation"');

    // Runtime absence of prior experiment / legacy controls.
    expect(markup).not.toContain("Create voice session");
    expect(markup).not.toContain("Play latest");
    expect(markup).not.toContain("Tell your agent how to use Say To Me");
    expect(markup).not.toContain("Enable sound");
    expect(markup).not.toContain('data-testid="say-to-me-banner"');
    expect(markup).not.toContain('data-testid="say-to-me-embed-tracers-panel"');
    expect(markup).not.toContain('data-testid="say-to-me-lift-tracer"');
    expect(markup).not.toContain('data-testid="say-to-me-lift-solid-tracer"');
    expect(markup).not.toContain('data-testid="say-to-me-collapsed-banner"');
    expect(markup).not.toContain("@say-to-me/voice-widget");
    expect(markup).not.toContain("VITE_SAY_TO_ME");
    expect(markup).not.toContain("5411");
  });

  it("renders the direct STM HMR module loader on localhost DEV mode", () => {
    const markup = renderToStaticMarkup(
      <HostedSayToMeVoiceWidget
        environmentId={ENVIRONMENT_ID}
        threadId={THREAD_ID}
        loader={{ mode: "hmr", moduleUrl: SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL }}
      />,
    );

    expect(markup).toContain('data-voice-widget-preferred-loader="hmr"');
    expect(markup).toContain('data-voice-widget-loader-mode="hmr"');
    expect(markup).toContain('data-testid="say-to-me-voice-widget-hmr-loader"');
    expect(markup).toContain(`data-module-url="${SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL}"`);
    expect(markup).not.toContain("say-to-me-voice-widget-script");
    expect(markup).toContain(`session-id="${SESSION_ID}"`);
    expect(markup).toContain(`ui-base-url="${SAY_TO_ME_UI_URL}"`);
  });
});
