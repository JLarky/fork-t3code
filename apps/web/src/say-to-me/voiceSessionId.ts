/**
 * Deterministic Say To Me voice-room id for a T3 thread.
 * Same formula the voice-notes banner uses (`vo_t3_<env>__<thread>`).
 */
export function voiceNotesSessionId(environmentId: string, threadId: string): string {
  return `vo_t3_${environmentId}__${threadId}`;
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
