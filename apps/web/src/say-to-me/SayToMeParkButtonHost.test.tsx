import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { SayToMeParkButtonHost } from "./SayToMeParkButtonHost";
import { sayToMeParkButtonModuleUrl } from "./parkButton";

vi.mock("./parkButton", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./parkButton")>();
  return {
    ...actual,
    sayToMeParkButtonModuleUrl: vi.fn(),
  };
});

function renderHost(): string {
  return renderToStaticMarkup(
    <SayToMeParkButtonHost sessionId="t3_thread" environmentId="env-1" threadId="thread-1" />,
  );
}

afterEach(() => {
  vi.mocked(sayToMeParkButtonModuleUrl).mockReset();
});

describe("SayToMeParkButtonHost delivery", () => {
  it("mounts only the custom element for direct STM delivery", () => {
    vi.mocked(sayToMeParkButtonModuleUrl).mockReturnValue(
      "http://localhost:5413/embed/park-button.js",
    );

    const markup = renderHost();
    expect(markup).toContain("<say-to-me-park-button");
    expect(markup).not.toContain("<script");
  });

  it("mounts the identical markup for proxied delivery", () => {
    vi.mocked(sayToMeParkButtonModuleUrl).mockReturnValue("/api/say-to-me/embed/park-button.js");

    const markup = renderHost();
    expect(markup).toContain("<say-to-me-park-button");
    expect(markup).not.toContain("<script");
  });
});
