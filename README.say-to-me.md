# Say To Me Integration

This fork keeps Say To Me functionality isolated from the main T3 Code feature
tree so rebasing onto upstream remains straightforward.

## Boundaries

- Web implementation lives under `apps/web/src/say-to-me/`.
- Server implementation lives under `apps/server/src/say-to-me/`.
- Existing T3 files should contain only the smallest integration points needed
  to mount the banner, register its routes, play the notification sounds, and
  open the Spaces overlay.
- Do not move general T3 utilities into this area or modify unrelated T3
  behavior for Say To Me features.

Current integration points in existing T3 files:

- `apps/web/src/components/ChatView.tsx` mounts `<VoiceNotesBanner>` and calls
  `useIdleCompletionDing()`.
- `apps/web/src/routes/__root.tsx` mounts `<SpacesOverlay>` when authenticated.
- `apps/server/src/server.ts` registers the voice-note and T3-spaces proxy
  route layers.
- `apps/web/src/components/chat/ChatComposer.tsx` calls `playSendDing()` in
  `submitComposer`.
- `apps/web/src/components/CommandPalette.tsx` adds one "Open Spaces" action that
  calls `openSpaces()`.

## Voice Flow

The web banner talks only to same-origin T3 routes. The server proxies those
requests to the local Say To Me instance at `https://say.local:1355` by default.
Set `T3CODE_SAY_TO_ME_URL` to override that endpoint.

Each T3 Code thread gets its own Say To Me room:

`vo_t3_<environmentId>__<threadId>`

Example: environment `3bae4963-5d72-4221-835b-66e2770e72d0` and thread
`2572d5ed-a15b-487f-8102-71a350b357ed` map to
`vo_t3_3bae4963-5d72-4221-835b-66e2770e72d0__2572d5ed-a15b-487f-8102-71a350b357ed`.

- `GET /api/voice-notes/:sessionId` loads the initial message snapshot, and
  returns 404 when the room does not exist yet.
- `POST /api/voice-notes/:sessionId` creates the missing voice session.
- `GET /api/voice-notes/:sessionId/events` streams revisioned SSE snapshots.
- `POST /api/voice-notes/:sessionId/messages/:messageId/status` updates
  playback status.

Say To Me owns room creation, so the Say To Me section only derives the room id
and shows a Create voice session button on 404. The event stream opens after the
snapshot confirms the room exists, which keeps a permanent 404 from turning into
an EventSource reconnect loop.

Autoplay claims a message ID before speech starts. Repeated SSE snapshots and
automatic reconnects cannot claim that ID again. Manual Play or Restart is the
only path that intentionally plays an already claimed message again.

## Notification Sounds

`apps/web/src/say-to-me/sound.ts` ports the Say To Me app's two notification
sounds so T3 Code sounds the same: a short rising ding when a message is sent and
a softer two-tone chime when a session goes idle. Both are synthesized into WAV
data URLs at runtime rather than shipped as audio assets, keeping the fork free of
binary files. Playback prefers an `HTMLAudioElement` and falls back to a Web Audio
oscillator when element playback is blocked.

The amplitudes match Say To Me and are deliberately quiet — the send tone peaks at
24% of full scale and the idle chime at 12%.

### Send ding

`submitComposer` in `ChatComposer.tsx` is the single funnel for every send path —
the `Send message` submit button, Enter-to-send, and the collapsed mobile send
button — so one call there covers all of them. It runs after the
`noProviderAvailable` guard so a rejected submit stays silent. Because the call
happens inside the send gesture, autoplay policies allow it without a separate
"enable sound" prompt, which also unlocks audio for the idle chime that follows.

### Idle chime

`useIdleCompletionDing` watches the session phase and plays on a `running` to
`ready` transition, which is exactly when the composer's stop button turns back
into the send button. `connecting` and `disconnected` are excluded, so
interrupting a turn, losing the connection, or a session erroring out stay silent.

Prefer the phase over composites such as `isWorking || !latestTurnSettled`.
`isLatestTurnSettled` is false whenever the latest turn has no `completedAt`, so a
turn that never records one pins the busy flag true and the chime never fires.

Two guards prevent stray chimes: the first observed sample never plays, so opening
an already-idle thread is quiet, and a change of thread key never plays, so
switching from a running thread to an idle one is quiet.

### Playback queue

Say To Me queues playback as messages. `apps/web/src/say-to-me/audioQueue.ts` is
the equivalent here: a serial promise chain that keeps the idle chime from playing
over a spoken note. The banner's `speechSynthesis.speak` is a queued task
resolving on `end` or `error`, and the chime is a queued task that additionally
waits out speech started outside the queue.

Every task is timeout-bounded because browsers drop the `end` event after
`cancel()`, and one missing event would otherwise wedge the queue and silence
everything after it. A note cancelled while still waiting its turn checks the play
token and skips rather than speaking late.

The send ding is intentionally **not** queued. It is immediate feedback for a
keypress, and delaying it behind a long spoken note would feel broken.

## Spaces Tracer (Cmd/Ctrl+I)

Claiming a T3 thread into a Say To Me space attaches its voice room
(`vo_t3_<environmentId>__<threadId>`) via native `claimSession` /
`releaseSession`. Membership lives in Say To Me's existing `space_sessions`
table — no parallel T3 membership schema — so claimed threads show on the
Say To Me dashboard.

- Press **Cmd/Ctrl+I** (outside inputs) to open the Spaces overlay.
- On touch devices there is no shortcut, so open the sidebar, tap **Search**, and
  pick **Open Spaces**. Both entry points go through `say-to-me/spacesBus.ts`.
- The overlay lists Say To Me spaces, shows claimed `vo_t3_*` sessions, and lets
  you claim an unclaimed thread (creating the voice room first if needed) or
  release one.
- Selected space header includes an underlined **open** link to
  `https://say.localhost:1311/dashboard/:spaceId` (`target=_blank`).
- Shortcut is hardcoded in `SpacesOverlay` for now so we do not touch shared
  keybinding contracts.

Same-origin proxy routes (auth + thin mapping over native Say To Me APIs):

- `GET /api/t3-spaces` → `GET /api/spaces` (filters to `vo_t3_*` sessions)
- `POST /api/t3-spaces/:spaceId/sessions` → ensure voice room + `claimSession`
- `DELETE /api/t3-spaces/:spaceId/sessions/:environmentId/:threadId` →
  `releaseSession`

Upstream base URL is `T3CODE_SAY_TO_ME_URL` (default `https://say.local:1355`).

## Rebase Workflow

1. Start a new branch from the latest `origin/main`.
2. Keep Say To Me files inside the two `say-to-me` directories.
3. Resolve conflicts in the small ChatView/server registration points first.
4. Run the focused voice tests and web/server typechecks.
5. Review `git diff origin/main` and confirm no unrelated T3 files changed.

The integration is intentionally kept as a small, self-contained fork feature
rather than spread across existing T3 modules.
