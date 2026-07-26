import { describe, expect, it } from "vite-plus/test";

import {
  flattenSpacesForSidebar,
  findThreadSpace,
  prioritizeCurrentThread,
  spacePath,
  type T3SpaceSession,
  type T3SpaceSummary,
} from "./SpacesOverlay";

const currentSession: T3SpaceSession = {
  environmentId: "environment-current",
  threadId: "thread-current",
  sessionId: "vo_current",
  spaceId: "space-two",
  title: "Current thread",
  claimedAt: "2026-07-25T00:00:00.000Z",
};

const otherSession: T3SpaceSession = {
  environmentId: "environment-other",
  threadId: "thread-other",
  sessionId: "vo_other",
  spaceId: "space-two",
  title: "Other thread",
  claimedAt: "2026-07-24T00:00:00.000Z",
};

const spaces: ReadonlyArray<T3SpaceSummary> = [
  {
    id: "space-one",
    name: "One",
    parentId: null,
    archived: false,
    sortOrder: 0,
    sessions: [],
  },
  {
    id: "space-two",
    name: "Two",
    parentId: null,
    archived: false,
    sortOrder: 1,
    sessions: [otherSession, currentSession],
  },
];

describe("SpacesOverlay current thread helpers", () => {
  it("finds the space containing the current thread", () => {
    expect(findThreadSpace(spaces, currentSession.environmentId, currentSession.threadId)?.id).toBe(
      "space-two",
    );
    expect(findThreadSpace(spaces, "environment-missing", "thread-missing")).toBeNull();
  });

  it("puts the current thread first without reordering the others", () => {
    expect(
      prioritizeCurrentThread(
        [otherSession, currentSession],
        currentSession.environmentId,
        currentSession.threadId,
      ).map((session) => session.sessionId),
    ).toEqual(["vo_current", "vo_other"]);
  });

  it("uses Say To Me's nested sibling and depth-first ordering", () => {
    const tree = flattenSpacesForSidebar([
      {
        id: "later-root",
        name: "Later root",
        parentId: null,
        archived: false,
        sortOrder: 2,
        sessions: [],
      },
      {
        id: "child-b",
        name: "Child B",
        parentId: "root",
        archived: false,
        sortOrder: 2,
        sessions: [],
      },
      {
        id: "root",
        name: "Root",
        parentId: null,
        archived: false,
        sortOrder: 1,
        sessions: [],
      },
      {
        id: "child-a",
        name: "Child A",
        parentId: "root",
        archived: false,
        sortOrder: 1,
        sessions: [],
      },
      {
        id: "grandchild",
        name: "Grandchild",
        parentId: "child-a",
        archived: false,
        sortOrder: 0,
        sessions: [],
      },
    ]);

    expect(tree.map(({ space, depth }) => `${depth}:${space.id}`)).toEqual([
      "0:root",
      "1:child-a",
      "2:grandchild",
      "1:child-b",
      "0:later-root",
    ]);
  });

  it("builds a breadcrumb path from a nested space", () => {
    const nestedSpaces: ReadonlyArray<T3SpaceSummary> = [
      { ...spaces[0]!, id: "root", name: "Root" },
      { ...spaces[0]!, id: "child", name: "Child", parentId: "root" },
      { ...spaces[0]!, id: "leaf", name: "Leaf", parentId: "child" },
    ];

    expect(spacePath(nestedSpaces, "leaf").map((space) => space.name)).toEqual([
      "Root",
      "Child",
      "Leaf",
    ]);
  });
});
