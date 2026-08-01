import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { HostedSayToMeVoiceWidget } from "./HostedSayToMeVoiceWidget";
import { SAY_TO_ME_UI_URL } from "./sayToMeUi";
import {
  SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY,
  SAY_TO_ME_VOICE_WIDGET_HMR_MODULE_URL,
  SAY_TO_ME_VOICE_WIDGET_LAYOUT_FLOATING,
  SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL,
  SAY_TO_ME_VOICE_WIDGET_SRC,
  SAY_TO_ME_VOICE_WIDGET_TIMERS_BASE_URL,
  sayToMeVoiceWidgetHostPanelClass,
  sayToMeVoiceWidgetHostSectionClass,
} from "./voiceWidget";

const ENVIRONMENT_ID = "3bae4963-5d72-4221-835b-66e2770e72d0";
const THREAD_ID = "2572d5ed-a15b-487f-8102-71a350b357ed";
const SESSION_ID = `t3_${THREAD_ID}`;

describe("HostedSayToMeVoiceWidget", () => {
  it("renders the empty liftSolid host with Contract v1 + S-theme attributes", () => {
    const markup = renderToStaticMarkup(
      <HostedSayToMeVoiceWidget
        environmentId={ENVIRONMENT_ID}
        threadId={THREAD_ID}
        sessionTitle="Night shift thread"
        projectName="E2E Night Shift 1"
        workingDirectory="/tmp/t3-e2e-night-shift-1"
        branchName="main"
        loader={{ mode: "classic", scriptSrc: SAY_TO_ME_VOICE_WIDGET_SRC }}
      />,
    );

    expect(markup).toContain('data-testid="say-to-me-voice-widget-host"');
    expect(markup).toContain('data-testid="say-to-me-voice-widget-element"');
    expect(markup).toContain("say-to-me-voice-widget");
    expect(markup).toContain(`session-id="${SESSION_ID}"`);
    expect(markup).toContain(`notes-base-url="${SAY_TO_ME_VOICE_WIDGET_NOTES_BASE_URL}"`);
    expect(markup).toContain(`timers-base-url="${SAY_TO_ME_VOICE_WIDGET_TIMERS_BASE_URL}"`);
    expect(markup).toContain(`layout="${SAY_TO_ME_VOICE_WIDGET_LAYOUT_FLOATING}"`);
    expect(markup).toContain('session-title="Night shift thread"');
    expect(markup).toContain('project-name="E2E Night Shift 1"');
    expect(markup).toContain('working-directory="/tmp/t3-e2e-night-shift-1"');
    expect(markup).toContain('branch-name="main"');
    expect(markup).toMatch(/can-autoplay="[01]"/);
    expect(markup).not.toContain('can-autoplay="true"');
    expect(markup).not.toContain('can-autoplay="false"');
    expect(markup).toContain(`storage-key="${SAY_TO_ME_VOICE_WIDGET_COLLAPSE_STORAGE_KEY}"`);
    expect(markup).toContain(`ui-base-url="${SAY_TO_ME_UI_URL}"`);
    expect(markup).toContain('data-testid="say-to-me-voice-widget-script"');
    expect(markup).toContain(`src="${SAY_TO_ME_VOICE_WIDGET_SRC}"`);
    expect(markup).toContain("absolute top-2 right-[10px]");
    expect(markup).toContain("w-max");
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

  it("omits blank S-theme context attributes", () => {
    const markup = renderToStaticMarkup(
      <HostedSayToMeVoiceWidget
        environmentId={ENVIRONMENT_ID}
        threadId={THREAD_ID}
        sessionTitle="  "
        projectName={null}
        loader={{ mode: "classic", scriptSrc: SAY_TO_ME_VOICE_WIDGET_SRC }}
      />,
    );
    expect(markup).not.toContain("session-title=");
    expect(markup).not.toContain("project-name=");
    expect(markup).not.toContain("working-directory=");
    expect(markup).not.toContain("branch-name=");
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
    expect(markup).toContain(`layout="${SAY_TO_ME_VOICE_WIDGET_LAYOUT_FLOATING}"`);
  });
});

describe("sayToMeVoiceWidgetHostSectionClass", () => {
  it("floats the collapsed panel without reserving a fixed chat width", () => {
    expect(sayToMeVoiceWidgetHostSectionClass(true)).toContain("absolute top-2 right-[10px]");
    expect(sayToMeVoiceWidgetHostSectionClass(true)).toContain("w-max");
    expect(sayToMeVoiceWidgetHostSectionClass(true)).toContain("max-w-[calc(100%-20px)]");
    expect(sayToMeVoiceWidgetHostSectionClass(true)).toContain("pointer-events-none");
    expect(
      sayToMeVoiceWidgetHostSectionClass(true)
        .split(" ")
        .filter((t) => t.startsWith("w-[")),
    ).toEqual([]);
    expect(sayToMeVoiceWidgetHostPanelClass(true)).toContain("w-max");
    expect(
      sayToMeVoiceWidgetHostPanelClass(true)
        .split(" ")
        .filter((t) => t.startsWith("w-[")),
    ).toEqual([]);
    expect(sayToMeVoiceWidgetHostPanelClass(false)).toContain("w-[min(28rem,calc(100vw-1.25rem))]");
  });
});
