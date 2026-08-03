import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { SidebarInset } from "../components/ui/sidebar";
import {
  type SayToMeAttachment,
  type SayToMeSession,
  type VoiceNote,
  type VoiceNotesDemoFixture,
  VoiceNotesBanner,
} from "../say-to-me/components/chat/VoiceNotesBanner";

export const Route = createFileRoute("/dev/say-to-me-components")({
  component: SayToMeComponentsGallery,
});

const STM_GALLERY_URL = "http://127.0.0.1:5511/dev/voice-widget-components";
const DEMO_TIME = "2026-08-02 19:17:58";
// Shared with the STM handoff: a valid 2x2 RGBA PNG, not a URL-encoded SVG.
const THUMBNAIL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNk+M/wHwAFAwIAjQYGBgAAAABJRU5ErkJggg==";
const MARKDOWN_FIXTURE_HTML = `<h2>Markdown baseline</h2>
<p><strong>Bold</strong>, <em>italic</em>, <code>inline code</code>, and a <a href="https://example.com" target="_blank" rel="noopener noreferrer">safe link</a>.</p>
<ul>
<li>one</li>
<li>two</li>
</ul>

<p><a target="_blank" rel="noopener noreferrer">unsafe</a></p>
`;

function note(
  id: string,
  status: string,
  text: string,
  extraMarkdown: string | null = null,
  extraMarkdownHtml: string | null = null,
  attachments: ReadonlyArray<SayToMeAttachment> = [],
  sessions: ReadonlyArray<SayToMeSession> = [],
): VoiceNote {
  return {
    id,
    author: "agent",
    time: DEMO_TIME,
    text,
    extraMarkdown,
    extraMarkdownHtml,
    status,
    attachments,
    sessions,
  };
}

const attachments: ReadonlyArray<SayToMeAttachment> = [
  {
    id: 101,
    mimeType: "image/png",
    originalName: "comparison-thumb.png",
    thumbnailDataUrl: THUMBNAIL_DATA_URL,
  },
  { id: 102, mimeType: "text/plain", originalName: "not-a-preview.txt" },
];

const sessions: ReadonlyArray<SayToMeSession> = [
  {
    id: "needs-answer-session",
    alias: "Review",
    title: "Ignored title because alias wins",
    waitingState: "needs_answer",
    latestActivity: DEMO_TIME,
    summary: "Last update: Waiting for a decision.",
    messageCount: 12,
  },
  {
    id: "working-session",
    title: "Title fallback",
    waitingState: "working",
    summaryUpdatedAt: DEMO_TIME,
    messageCount: 4,
  },
  { id: "id-fallback-session", waitingState: "can_continue" },
  { id: "unknown-state-session", waitingState: "mystery_state" },
];

const baselineFixture: VoiceNotesDemoFixture = {
  sessionState: "ready",
  notes: [
    note(
      "queued",
      "queued",
      "Queued message with attachments and every session display fallback.",
      "## Markdown baseline\n\n**Bold**, *italic*, `inline code`, and a [safe link](https://example.com).\n\n- one\n- two\n\n<script>alert('blocked')</script>\n\n[unsafe](javascript:alert('blocked'))",
      MARKDOWN_FIXTURE_HTML,
      attachments,
      sessions,
    ),
    note("speaking", "speaking", "Speaking status badge."),
    note("played", "played", "Played status badge."),
    note("stopped", "stopped", "Stopped status badge."),
    note("unknown", "future_status", "Unknown status fallback badge."),
  ],
};

const playingFixture: VoiceNotesDemoFixture = {
  sessionState: "ready",
  playingId: "playing",
  notes: [
    note("playing", "queued", "The playing override renders as speaking."),
    note("older", "played", "Older note."),
  ],
};

const waitingFixtures: ReadonlyArray<{
  readonly label: string;
  readonly fixture: VoiceNotesDemoFixture;
}> = [
  {
    label: "Loading",
    fixture: { sessionState: "loading", hasLoadedRemoteNotes: false, notes: [] },
  },
  { label: "Missing", fixture: { sessionState: "missing", notes: [] } },
  { label: "Unavailable", fixture: { sessionState: "unavailable", notes: [] } },
];

function FixturePanel({
  label,
  fixture,
  compact = false,
  dark = false,
}: {
  readonly label: string;
  readonly fixture: VoiceNotesDemoFixture;
  readonly compact?: boolean;
  readonly dark?: boolean;
}) {
  return (
    <section
      className={
        dark ? "dark rounded-xl bg-slate-950 p-3 text-foreground" : "rounded-xl bg-muted/25 p-3"
      }
      data-fixture={label}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <strong>{label}</strong>
        <span className="text-muted-foreground">Actual React VoiceNotesBanner</span>
      </div>
      <div className={compact ? "w-[18rem] max-w-full" : "w-full"}>
        <VoiceNotesBanner
          environmentId="demo-environment"
          threadId={`${label.toLowerCase().replaceAll(" ", "-")}-thread`}
          sessionTitle="Gallery thread"
          projectName="T3 demo"
          workingDirectory="/demo/t3"
          branchName="demo/gallery"
          onInsertUsagePrompt={() => undefined}
          demoFixture={fixture}
        />
      </div>
    </section>
  );
}

function SayToMeComponentsGallery() {
  const [showDark, setShowDark] = useState(true);
  const [showNarrow, setShowNarrow] = useState(true);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-y-auto bg-background text-foreground">
      <main className="mx-auto w-full max-w-[110rem] space-y-6 p-4 sm:p-6">
        <header className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground">DEV / SAY TO ME COMPONENTS</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">T3 ↔ STM comparison gallery</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Side-effect-free fixtures mounted through the existing React VoiceNotesBanner.
                Compare each labeled baseline with the live STM gallery.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="rounded-md border border-border bg-background px-2 py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => setShowDark((value) => !value)}
              >
                {showDark ? "Hide dark" : "Show dark"}
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-background px-2 py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => setShowNarrow((value) => !value)}
              >
                {showNarrow ? "Hide narrow" : "Show narrow"}
              </button>
              <a
                className="rounded-md border border-border bg-background px-2 py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                href={STM_GALLERY_URL}
                target="_blank"
                rel="noreferrer"
              >
                Open STM gallery ↗
              </a>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-card p-3 text-xs">
              <strong>Actual React baseline</strong>
              <p className="mt-1 text-muted-foreground">
                Every panel below is the actual React VoiceNotesBanner mounted with side-effect-free
                fixtures. Compare it with the live STM component view.
              </p>
            </div>
            <FixturePanel
              label="Statuses · attachments · Markdown · sessions"
              fixture={baselineFixture}
            />
            <FixturePanel label="Playing override" fixture={playingFixture} />
            <div className="grid gap-4 md:grid-cols-3">
              {waitingFixtures.map(({ label, fixture }) => (
                <FixturePanel key={label} label={`Waiting · ${label}`} fixture={fixture} compact />
              ))}
            </div>
            {showNarrow ? (
              <FixturePanel label="Compact / narrow" fixture={baselineFixture} compact />
            ) : null}
            {showDark ? <FixturePanel label="Dark theme" fixture={baselineFixture} dark /> : null}
            <p className="text-xs text-muted-foreground">
              Interaction inspection: Tab through the real banner controls; hover buttons; press
              Space/Enter on focused controls; inspect focus-visible rings and expanded Details.
            </p>
          </div>

          <section className="min-h-[48rem] rounded-xl border border-border/70 bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <strong>Actual STM component view</strong>
              <a
                className="text-primary underline"
                href={STM_GALLERY_URL}
                target="_blank"
                rel="noreferrer"
              >
                Direct link
              </a>
            </div>
            <iframe
              title="Say To Me STM comparison gallery"
              src={STM_GALLERY_URL}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              className="h-[calc(100%-2rem)] min-h-[46rem] w-full rounded-lg border border-border bg-background"
            />
          </section>
        </div>

        <section className="rounded-xl border border-border/70 bg-card p-4 text-sm">
          <h2 className="font-medium">Difference checklist</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Compare labels and fixture content first; this gallery contains no product-fidelity
              markers.
            </li>
            <li>
              Check status badge colors, waiting labels, alias/title/id fallbacks, details, and copy
              controls.
            </li>
            <li>
              Check image-only attachment thumbnails and sanitized Markdown/security examples.
            </li>
            <li>
              Check compact width, light/dark surfaces, keyboard focus, hover, and pressed states.
            </li>
            <li>
              Fixture mode intentionally omits live fetch/SSE/timer polling/autoplay and isolates
              collapse state; production behavior is unchanged.
            </li>
          </ul>
        </section>
      </main>
    </SidebarInset>
  );
}
