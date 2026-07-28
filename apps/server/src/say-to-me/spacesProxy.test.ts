import { describe, expect, it } from "@effect/vitest";

import { mapSpacesFromNative } from "./spacesProxy.ts";

describe("Say To Me spaces mapping", () => {
  it("maps current T3 rooms and ignores rooms owned by another T3 instance", () => {
    const spaces = mapSpacesFromNative(
      {
        state: {
          spaces: [
            {
              id: "space-one",
              name: "One",
              sessions: [
                {
                  id: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
                  t3InstanceId: "t3-5470",
                  title: "Current thread",
                  importedAt: "2026-07-28 18:00:00",
                },
                {
                  id: "t3_18c7a3fe-6e68-40af-82c3-4efa0d7a08e6",
                  t3InstanceId: "t3-5477",
                  title: "Other instance",
                },
              ],
            },
          ],
        },
      },
      { environmentId: "environment-current", t3InstanceId: "t3-5470" },
    );

    expect(spaces[0]?.sessions).toEqual([
      {
        environmentId: "environment-current",
        threadId: "2572d5ed-a15b-487f-8102-71a350b357ed",
        sessionId: "t3_2572d5ed-a15b-487f-8102-71a350b357ed",
        spaceId: "space-one",
        title: "Current thread",
        claimedAt: "2026-07-28 18:00:00",
      },
    ]);
  });

  it("keeps legacy rooms mapped from their embedded environment", () => {
    const spaces = mapSpacesFromNative(
      {
        spaces: [
          {
            id: "space-one",
            name: "One",
            sessions: [
              {
                id: "vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed",
              },
            ],
          },
        ],
      },
      { environmentId: "environment-current", t3InstanceId: "t3-5470" },
    );

    expect(spaces[0]?.sessions[0]).toMatchObject({
      environmentId: "3bae4963-5d72-4221-835b-66e2770e72d0",
      threadId: "2572d5ed-a15b-487f-8102-71a350b357ed",
    });
  });
});
