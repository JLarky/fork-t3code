import { renderToStaticMarkup } from "react-dom/server";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  claimQueuedNotesForStopAll,
  claimVoiceNoteForAutoplay,
  formatSayToMeTimestamp,
  imageAttachmentThumbnail,
  latestVoiceNoteExtraMarkdownHtml,
  VoiceNoteExtraMarkdown,
  mostRecentVoiceNote,
  normalizeSayToMeTimestamp,
  SAY_TO_ME_BANNER_COLLAPSED_STORAGE_KEY,
  sayToMeBannerSectionClass,
  sayToMeTitleUrl,
  VoiceNotesBanner,
  voiceNotesSessionId,
} from "./VoiceNotesBanner";
import { SAY_TO_ME_UI_URL, sayToMeAttachmentUrl } from "../../sayToMeUi";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "~/hooks/useLocalStorage";

const serverSanitizedExtraMarkdownHtml =
  '<h2>Latest</h2><p>Safe details.</p><table><tbody><tr><td>Passed</td></tr></tbody></table><p><a href="https://example.com" target="_blank" rel="noopener noreferrer">Safe link</a></p>';
const rawExtraMarkdownWithUnsafeInput =
  "## Latest\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))";

afterEach(() => {
  removeLocalStorageItem(SAY_TO_ME_BANNER_COLLAPSED_STORAGE_KEY);
});

describe("Say To Me section", () => {
  it("treats Say To Me SQLite timestamps as UTC", () => {
    expect(normalizeSayToMeTimestamp("2026-07-26 19:17:58")).toBe("2026-07-26T19:17:58Z");
    expect(new Date(normalizeSayToMeTimestamp("2026-07-26 19:17:58")).toISOString()).toBe(
      "2026-07-26T19:17:58.000Z",
    );
  });

  it("formats voice-note timestamps with the browser's local timezone", () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date("2026-07-26T19:17:58Z"));
    expect(formatSayToMeTimestamp("2026-07-26 19:17:58")).toBe(expected);
  });

  it("builds the T3 worktree Say To Me session id from the thread id", () => {
    expect(
      voiceNotesSessionId(
        "3bae4963-5d72-4221-835b-66e2770e72d0",
        "2572d5ed-a15b-487f-8102-71a350b357ed",
      ),
    ).toBe("t3_2572d5ed-a15b-487f-8102-71a350b357ed");
  });

  it("renders a loading state before the Say To Me snapshot arrives", () => {
    const markup = renderToStaticMarkup(
      <VoiceNotesBanner
        environmentId="3bae4963-5d72-4221-835b-66e2770e72d0"
        threadId="2572d5ed-a15b-487f-8102-71a350b357ed"
        onInsertUsagePrompt={() => undefined}
      />,
    );

    expect(markup).toContain('data-testid="say-to-me-banner"');
    expect(markup).toContain('data-collapsed="false"');
    expect(markup).toContain('class="hover:underline">Say To Me</a>');
    expect(markup).not.toContain('data-testid="say-to-me-widget-host"');
    expect(markup).not.toContain("say-to-me-widget");
    expect(markup).not.toContain('aria-label="Park session"');
    expect(markup).toContain('aria-label="Play most recent voice note"');
    expect(markup).toContain('data-speaking="false"');
    expect(markup).toContain("Collapse");
    expect(markup).not.toContain("Preview");
    expect(markup).not.toContain("Listen to short updates from your agents while they work.");
    expect(markup).toContain(
      'href="https://say.localhost:1311/ses/t3_2572d5ed-a15b-487f-8102-71a350b357ed"',
    );
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("Loading voice notes...");
    expect(markup).not.toContain("I’m reviewing the latest changes");
    expect(markup).toContain("max-h-64");
    expect(markup).toContain("short:max-h-32");
    expect(markup).toContain("overflow-y-auto");
  });

  it("floats the collapsed panel in the top-right without reserving chat width", () => {
    expect(sayToMeBannerSectionClass(false)).toContain("w-[min(48rem,calc(100%-2rem))]");
    expect(sayToMeBannerSectionClass(false)).not.toContain("absolute");
    expect(sayToMeBannerSectionClass(true)).toContain("absolute top-2 right-[10px]");
    expect(sayToMeBannerSectionClass(true)).toContain("w-max");
    expect(sayToMeBannerSectionClass(true)).toContain("max-w-[calc(100%-20px)]");
    expect(sayToMeBannerSectionClass(true)).toContain("pointer-events-none");
    expect(sayToMeBannerSectionClass(true, true)).toContain("max-w-[min(calc(100%-20px),32rem)]");
    expect(sayToMeBannerSectionClass(true, true)).toContain("pointer-events-auto");
    expect(sayToMeBannerSectionClass(true, false, true)).toContain("pointer-events-auto");
  });

  it("keeps the collapsed panel shrink-to-fit instead of a fixed width", () => {
    // A plain `w-*` utility would win the tailwind-merge width group and drop
    // `w-max`, stretching the collapsed card across the top of the timeline.
    for (const className of [
      sayToMeBannerSectionClass(true),
      sayToMeBannerSectionClass(true, true),
      sayToMeBannerSectionClass(true, false, true),
    ]) {
      expect(className).toContain("w-max");
      expect(className.split(" ").filter((token) => token.startsWith("w-["))).toEqual([]);
    }
  });

  it("restores the collapsed banner from local storage", () => {
    setLocalStorageItem(SAY_TO_ME_BANNER_COLLAPSED_STORAGE_KEY, true, Schema.Boolean);

    const markup = renderToStaticMarkup(
      <VoiceNotesBanner
        environmentId="3bae4963-5d72-4221-835b-66e2770e72d0"
        threadId="2572d5ed-a15b-487f-8102-71a350b357ed"
        onInsertUsagePrompt={() => undefined}
      />,
    );

    expect(getLocalStorageItem(SAY_TO_ME_BANNER_COLLAPSED_STORAGE_KEY, Schema.Boolean)).toBe(true);
    expect(markup).toContain('data-collapsed="true"');
    expect(markup).toContain("Expand");
    expect(markup).not.toContain("Loading voice notes...");
  });

  it("links the title to the voice room, or to the home page when no session exists", () => {
    expect(sayToMeTitleUrl("t3_thread", "ready")).toBe("https://say.localhost:1311/ses/t3_thread");
    expect(sayToMeTitleUrl("t3_thread", "loading")).toBe(
      "https://say.localhost:1311/ses/t3_thread",
    );
    expect(sayToMeTitleUrl("t3_thread", "missing")).toBe(SAY_TO_ME_UI_URL);
  });

  it("claims a queued message only once across repeated snapshots", () => {
    const claimedIds = new Set<string>();
    const note = { id: "32479", author: "agent", status: "queued" } as const;

    expect(claimVoiceNoteForAutoplay(note, claimedIds)).toBe(true);
    expect(claimVoiceNoteForAutoplay(note, claimedIds)).toBe(false);
    expect(claimedIds).toEqual(new Set(["32479"]));
  });

  it("claims every queued agent note when stopping all speech", () => {
    const claimedIds = new Set<string>(["already"]);
    expect(
      claimQueuedNotesForStopAll(
        [
          { id: "already", author: "agent", status: "queued" },
          { id: "1", author: "agent", status: "queued" },
          { id: "2", author: "user", status: "queued" },
          { id: "3", author: "agent", status: "played" },
          { id: "4", author: "agent", status: "queued" },
        ],
        claimedIds,
      ),
    ).toEqual(["1", "4"]);
    expect(claimedIds).toEqual(new Set(["already", "1", "4"]));
  });

  it("picks the newest note for idle speaker-icon playback", () => {
    expect(mostRecentVoiceNote([])).toBeNull();
    expect(mostRecentVoiceNote([{ id: "newer" }, { id: "older" }])).toEqual({ id: "newer" });
  });

  it("only surfaces server-rendered HTML from the newest note in the collapsed banner", () => {
    expect(
      latestVoiceNoteExtraMarkdownHtml([
        { extraMarkdownHtml: serverSanitizedExtraMarkdownHtml },
        { extraMarkdownHtml: "<p>Older</p>" },
      ]),
    ).toBe(serverSanitizedExtraMarkdownHtml);
    expect(latestVoiceNoteExtraMarkdownHtml([{ extraMarkdownHtml: null }])).toBeNull();
    expect(latestVoiceNoteExtraMarkdownHtml([{ extraMarkdownHtml: "   " }])).toBeNull();
  });

  it("renders STM sanitized HTML in both expanded and compact note markdown", () => {
    const markup = renderToStaticMarkup(
      <>
        <VoiceNoteExtraMarkdown
          html={serverSanitizedExtraMarkdownHtml}
          markdown={rawExtraMarkdownWithUnsafeInput}
        />
        <VoiceNoteExtraMarkdown html={serverSanitizedExtraMarkdownHtml} compact />
      </>,
    );

    expect(markup.match(/data-testid="say-to-me-extra-markdown"/g)).toHaveLength(2);
    expect(markup).toContain("<table>");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('target="_blank"');
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("## Latest");
  });

  it("does not import ChatMarkdown or parse markdown in this widget", () => {
    const source = Object.values(
      import.meta.glob("./VoiceNotesBanner.tsx", { query: "?raw", import: "default", eager: true }),
    )[0] as string;
    expect(source).not.toContain("ChatMarkdown");
    expect(source).not.toContain("markdownToHtml");
  });

  it("returns thumbnails for image attachments", () => {
    expect(
      imageAttachmentThumbnail({
        mimeType: "image/png",
        thumbnailDataUrl: "data:image/webp;base64,thumbnail",
      }),
    ).toBe("data:image/webp;base64,thumbnail");
    expect(
      imageAttachmentThumbnail({
        mimeType: "audio/mpeg",
        thumbnailDataUrl: "data:image/webp;base64,thumbnail",
      }),
    ).toBeNull();
  });

  it("builds Say To Me attachment links with the shared UI origin", () => {
    expect(sayToMeAttachmentUrl(476)).toBe(
      "https://say.localhost:1311/api/message-attachments/476",
    );
  });
});
