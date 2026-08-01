import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SayToMeParkButtonHost } from "./SayToMeParkButtonHost";
import { resolveSayToMeParkButtonHmrModuleUrl } from "./parkButton";

vi.mock("./parkButton", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./parkButton")>();
  return {
    ...actual,
    resolveSayToMeParkButtonHmrModuleUrl: vi.fn(),
  };
});

function renderHost(): string {
  return renderToStaticMarkup(
    <SayToMeParkButtonHost sessionId="t3_thread" environmentId="env-1" threadId="thread-1" />,
  );
}

afterEach(() => {
  vi.mocked(resolveSayToMeParkButtonHmrModuleUrl).mockReset();
});

describe("SayToMeParkButtonHost delivery", () => {
  it("mounts only the custom element when direct HMR delivery is selected", () => {
    vi.mocked(resolveSayToMeParkButtonHmrModuleUrl).mockReturnValue(
      "http://localhost:5413/server/embed/solid/park-button-hmr.ts",
    );

    const markup = renderHost();
    expect(markup).toContain("<say-to-me-park-button");
    expect(markup).not.toContain("say-to-me-park-button-script");
    expect(markup).not.toContain("/api/say-to-me/embed/park-button.js");
  });

  it("mounts the fixed classic script and the same custom element otherwise", () => {
    vi.mocked(resolveSayToMeParkButtonHmrModuleUrl).mockReturnValue(null);

    const markup = renderHost();
    expect(markup).toContain("<say-to-me-park-button");
    expect(markup).toContain('data-testid="say-to-me-park-button-script"');
    expect(markup).toContain('src="/api/say-to-me/embed/park-button.js"');
  });
});
