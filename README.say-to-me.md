# Say To Me Integration

This fork keeps Say To Me functionality isolated from the main T3 Code feature
tree so rebasing onto upstream remains straightforward.

## Boundaries

- Web implementation lives under `apps/web/src/say-to-me/`.
- Server implementation lives under `apps/server/src/say-to-me/`.
- Existing T3 files should contain only the smallest integration points needed
  to mount the banner, register its routes, and play the send ding.
- Do not move general T3 utilities into this area or modify unrelated T3
  behavior for Say To Me features.

Current integration points in existing T3 files:

- `apps/web/src/components/ChatView.tsx` mounts `<VoiceNotesBanner>`.
- `apps/server/src/server.ts` registers the four voice-note route layers.
- `apps/web/src/components/chat/ChatComposer.tsx` calls `playSendDing()` in
  `submitComposer`.

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

## Send Ding

`apps/web/src/say-to-me/sound.ts` ports the Say To Me app's send ding so composing
in T3 Code sounds the same. The tone is synthesized into a WAV data URL at runtime
rather than shipped as an audio asset, keeping the fork free of binary files.

`submitComposer` in `ChatComposer.tsx` is the single funnel for every send path —
the `Send message` submit button, Enter-to-send, and the collapsed mobile send
button — so one call there covers all of them. It runs after the
`noProviderAvailable` guard so a rejected submit stays silent.

Playback prefers an `HTMLAudioElement` and falls back to a Web Audio oscillator
when element playback is blocked. Because the call happens inside the send gesture,
autoplay policies allow it without a separate "enable sound" prompt.

## Rebase Workflow

1. Start a new branch from the latest `origin/main`.
2. Keep Say To Me files inside the two `say-to-me` directories.
3. Resolve conflicts in the small ChatView/server registration points first.
4. Run the focused voice tests and web/server typechecks.
5. Review `git diff origin/main` and confirm no unrelated T3 files changed.

The integration is intentionally kept as a small, self-contained fork feature
rather than spread across existing T3 modules.
