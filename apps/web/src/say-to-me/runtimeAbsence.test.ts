import { describe, expect, it } from "vite-plus/test";

import chatViewSource from "../components/ChatView.tsx?raw";
import hostedVoiceWidgetSource from "./HostedSayToMeVoiceWidget.tsx?raw";

describe("Say To Me runtime wiring absence", () => {
  it("ChatView mounts the liftSolid S1 host and not legacy or experiment paths", () => {
    expect(chatViewSource).toContain("HostedSayToMeVoiceWidget");
    expect(chatViewSource).toContain("insertSayToMeUsagePrompt");
    expect(chatViewSource).toContain("onInsertUsagePrompt={insertSayToMeUsagePrompt}");
    expect(chatViewSource).not.toContain("onParkSession");
    expect(chatViewSource).not.toContain("HostedSayToMeCollapsedBanner");
    expect(chatViewSource).not.toContain("SayToMeEmbedTracersPanel");
    expect(chatViewSource).not.toContain('from "../say-to-me/components/chat/VoiceNotesBanner"');
    expect(chatViewSource).not.toContain("<VoiceNotesBanner");
    expect(chatViewSource).not.toContain("VITE_SAY_TO_ME_VOICE_WIDGET");
    expect(chatViewSource).not.toContain("VITE_SAY_TO_ME_EMBED_COMPARISON");
    expect(chatViewSource).not.toContain("say-to-me-lift-tracer");
    expect(chatViewSource).not.toContain("say-to-me-lift-solid-tracer");
  });

  it("does not host-render stm-md (STM owns sanitized HTML; T3 styles only)", () => {
    expect(hostedVoiceWidgetSource).not.toContain("ChatMarkdown");
    expect(hostedVoiceWidgetSource).not.toContain("innerHTML");
    expect(hostedVoiceWidgetSource).not.toContain("extraMarkdownHtml");
    expect(hostedVoiceWidgetSource).not.toContain("dangerouslySetInnerHTML");
  });
});
