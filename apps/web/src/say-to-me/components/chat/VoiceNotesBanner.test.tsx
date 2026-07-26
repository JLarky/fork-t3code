import { renderToStaticMarkup } from "react-dom/server";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  claimQueuedNotesForStopAll,
  claimVoiceNoteForAutoplay,
  imageAttachmentThumbnail,
  mostRecentVoiceNote,
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

afterEach(() => {
  removeLocalStorageItem(SAY_TO_ME_BANNER_COLLAPSED_STORAGE_KEY);
});

describe("Say To Me section", () => {
  it("builds a per-thread Say To Me session id from environment and thread ids", () => {
    expect(
      voiceNotesSessionId(
        "3bae4963-5d72-4221-835b-66e2770e72d0",
        "2572d5ed-a15b-487f-8102-71a350b357ed",
      ),
    ).toBe("vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed");
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
    expect(markup).toContain('aria-label="Play most recent voice note"');
    expect(markup).toContain('data-speaking="false"');
    expect(markup).toContain("Collapse");
    expect(markup).not.toContain("Preview");
    expect(markup).not.toContain("Listen to short updates from your agents while they work.");
    expect(markup).toContain(
      'href="https://say.localhost:1311/ses/vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed"',
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
    expect(sayToMeBannerSectionClass(true)).toContain("max-w-[min(30%,18rem)]");
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
    expect(sayToMeTitleUrl("vo_t3_env__thread", "ready")).toBe(
      "https://say.localhost:1311/ses/vo_t3_env__thread",
    );
    expect(sayToMeTitleUrl("vo_t3_env__thread", "loading")).toBe(
      "https://say.localhost:1311/ses/vo_t3_env__thread",
    );
    expect(sayToMeTitleUrl("vo_t3_env__thread", "missing")).toBe(SAY_TO_ME_UI_URL);
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
