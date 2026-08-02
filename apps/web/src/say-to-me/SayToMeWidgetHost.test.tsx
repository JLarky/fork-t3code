import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SayToMeWidgetHost } from "./SayToMeWidgetHost";
import { resolveSayToMeWidgetHmrModuleUrl } from "./widget";

vi.mock("./widget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./widget")>();
  return {
    ...actual,
    resolveSayToMeWidgetHmrModuleUrl: vi.fn(),
  };
});

function renderHost(): string {
  return renderToStaticMarkup(
    <SayToMeWidgetHost sessionId="t3_thread" environmentId="env-1" threadId="thread-1" />,
  );
}

afterEach(() => {
  vi.mocked(resolveSayToMeWidgetHmrModuleUrl).mockReset();
});

describe("SayToMeWidgetHost delivery", () => {
  it("mounts only the custom element when direct HMR delivery is selected", () => {
    vi.mocked(resolveSayToMeWidgetHmrModuleUrl).mockReturnValue(
      "http://localhost:5413/server/embed/solid/widget-hmr.ts",
    );

    const markup = renderHost();
    expect(markup).toContain("<say-to-me-widget");
    expect(markup).not.toContain("say-to-me-widget-script");
    expect(markup).not.toContain("/api/say-to-me/embed/widget.js");
  });

  it("mounts the fixed classic script and the same custom element otherwise", () => {
    vi.mocked(resolveSayToMeWidgetHmrModuleUrl).mockReturnValue(null);

    const markup = renderHost();
    expect(markup).toContain("<say-to-me-widget");
    expect(markup).toContain('data-testid="say-to-me-widget-script"');
    expect(markup).toContain('src="/api/say-to-me/embed/widget.js"');
  });
});
