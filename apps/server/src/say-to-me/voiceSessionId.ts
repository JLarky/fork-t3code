/**
 * Deterministic Say To Me voice-room id for a T3 thread.
 * Keep in sync with apps/web/src/say-to-me/voiceSessionId.ts.
 */
export function voiceNotesSessionId(_environmentId: string, threadId: string): string {
  return `t3_${threadId}`;
}

const VO_T3_PATTERN =
  /^vo_t3_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function parseVoiceNotesSessionId(
  sessionId: string,
): { environmentId: string; threadId: string } | null {
  const match = VO_T3_PATTERN.exec(sessionId);
  if (!match) return null;
  return { environmentId: match[1]!, threadId: match[2]! };
}
