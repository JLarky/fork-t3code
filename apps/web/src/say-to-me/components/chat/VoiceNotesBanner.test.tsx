import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  claimVoiceNoteForAutoplay,
  imageAttachmentThumbnail,
  VoiceNotesBanner,
  voiceNotesSessionId,
} from "./VoiceNotesBanner";
import { sayToMeAttachmentUrl } from "../../sayToMeUi";

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
      />,
    );

    expect(markup).toContain('data-testid="say-to-me-banner"');
    expect(markup).toContain("Say To Me");
    expect(markup).toContain(
      'href="https://say.localhost:1311/ses/vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed"',
    );
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("Loading voice notes...");
    expect(markup).not.toContain("I’m reviewing the latest changes");
    expect(markup).toContain("max-h-64");
    expect(markup).toContain("overflow-y-auto");
  });

  it("claims a queued message only once across repeated snapshots", () => {
    const claimedIds = new Set<string>();
    const note = { id: "32479", author: "agent", status: "queued" } as const;

    expect(claimVoiceNoteForAutoplay(note, claimedIds)).toBe(true);
    expect(claimVoiceNoteForAutoplay(note, claimedIds)).toBe(false);
    expect(claimedIds).toEqual(new Set(["32479"]));
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
