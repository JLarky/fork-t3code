import { describe, expect, it } from "@effect/vitest";

import {
  sayToMeCreateSessionUrl,
  sayToMeEventsUrl,
  sayToMeImportSessionUrl,
  sayToMeMessageStatusUrl,
  sayToMeMessagesUrl,
  sayToMeSettingsUrl,
  sayToMeVoiceSessionName,
} from "./voiceNotesProxy.ts";

describe("voice notes proxy", () => {
  it("builds the Say To Me messages URL without allowing path injection", () => {
    expect(sayToMeMessagesUrl("https://say.local:1355/", "vo_t3luna")).toBe(
      "https://say.local:1355/api/sessions/vo_t3luna/messages",
    );
    expect(
      sayToMeMessagesUrl(
        "https://say.local:1355",
        "vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed",
      ),
    ).toBe(
      "https://say.local:1355/api/sessions/vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed/messages",
    );
    expect(sayToMeMessagesUrl("https://say.local:1355", "vo/../secret")).toBe(
      "https://say.local:1355/api/sessions/vo%2F..%2Fsecret/messages",
    );
    expect(sayToMeMessageStatusUrl("https://say.local:1355", "32476")).toBe(
      "https://say.local:1355/api/messages/32476/status",
    );
    expect(sayToMeEventsUrl("https://say.local:1355", "vo_t3luna")).toBe(
      "https://say.local:1355/api/sessions/vo_t3luna/events",
    );
  });

  it("creates voice sessions under the name Say To Me slugifies back into the same id", () => {
    expect(sayToMeCreateSessionUrl("https://say.local:1355/")).toBe(
      "https://say.local:1355/api/cli-sessions",
    );
    expect(sayToMeSettingsUrl("https://say.local:1355/")).toBe(
      "https://say.local:1355/api/settings",
    );
    expect(
      sayToMeImportSessionUrl("https://say.local:1355", "t3_2572d5ed-a15b-487f-8102-71a350b357ed"),
    ).toBe("https://say.local:1355/api/sessions/t3_2572d5ed-a15b-487f-8102-71a350b357ed/import");
    expect(
      sayToMeVoiceSessionName(
        "vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed",
      ),
    ).toBe("t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed");
    expect(sayToMeVoiceSessionName("t3_already_stripped")).toBe("t3_already_stripped");
  });
});
