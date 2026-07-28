import { describe, expect, it } from "@effect/vitest";

import { parseVoiceNotesSessionId, voiceNotesSessionId } from "./voiceSessionId.ts";

describe("Say To Me voice session ids", () => {
  it("uses the thread id for current T3 rooms", () => {
    const threadId = "2572d5ed-a15b-487f-8102-71a350b357ed";
    expect(voiceNotesSessionId("environment-id", threadId)).toBe(`t3_${threadId}`);
    expect(parseVoiceNotesSessionId(`t3_${threadId}`)).toEqual({
      environmentId: "",
      threadId,
    });
  });

  it("continues parsing legacy rooms", () => {
    expect(
      parseVoiceNotesSessionId(
        "vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed",
      ),
    ).toEqual({
      environmentId: "3bae4963-5d72-4221-835b-66e2770e72d0",
      threadId: "2572d5ed-a15b-487f-8102-71a350b357ed",
    });
  });

  it("rejects unrelated Say To Me sessions", () => {
    expect(parseVoiceNotesSessionId("t3_not-a-uuid")).toBeNull();
    expect(parseVoiceNotesSessionId("voice-room")).toBeNull();
  });
});
